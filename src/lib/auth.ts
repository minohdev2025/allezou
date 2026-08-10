/**
 * Accès sans mot de passe.
 *
 * Il n'existe aucun mot de passe dans ce produit, nulle part. On se connecte par un lien
 * reçu par courriel, valable quinze minutes et utilisable une seule fois ; la session qui
 * en découle dure longtemps, parce qu'un parent revient parfois après plusieurs mois et
 * qu'on ne veut pas d'une reconnexion à chaque sortie au parc.
 *
 * Toutes les dates viennent de l'horloge de la base, jamais de celle de Node : deux horloges
 * qui diffèrent de quelques millisecondes suffisent à créer des états incohérents.
 */

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "./db";
import * as s from "./db/schema";
import { sendLoginLink } from "./mail";
import { generateToken, hashToken } from "./tokens";

export const MAGIC_LINK_TTL = "15 minutes";
export const SESSION_TTL = "180 days";
/** Délai minimal entre deux demandes de lien pour une même adresse. */
export const MAGIC_LINK_MIN_INTERVAL = "60 seconds";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Adresse électronique invalide")
  .max(254);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Un nom est nécessaire pour que les autres membres vous reconnaissent")
  .max(60);

export type Account = typeof s.account.$inferSelect;

export type MagicLinkRequest =
  | { ok: true }
  | { ok: false; reason: "adresse_invalide" | "trop_de_demandes" };

/**
 * Demande un lien de connexion. Ne révèle jamais si un compte existe déjà pour cette
 * adresse — le compte est créé au premier lien effectivement suivi, pas ici.
 */
export async function requestMagicLink(rawEmail: string): Promise<MagicLinkRequest> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return { ok: false, reason: "adresse_invalide" };
  }
  const email = parsed.data;

  const recent = await db.execute(sql`
    select 1 from magic_link
    where email = ${email}
      and used_at is null
      and created_at > now() - interval '${sql.raw(MAGIC_LINK_MIN_INTERVAL)}'
    limit 1
  `);
  if (recent.length > 0) {
    return { ok: false, reason: "trop_de_demandes" };
  }

  const token = generateToken();
  await db.insert(s.magicLink).values({
    email,
    tokenHash: hashToken(token),
    expiresAt: sql`now() + interval '${sql.raw(MAGIC_LINK_TTL)}'`,
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendLoginLink(email, `${appUrl}/connexion/${token}`);

  return { ok: true };
}

export type LoginResult =
  | { ok: true; account: Account; sessionToken: string; isNew: boolean }
  | { ok: false; reason: "lien_inconnu" | "lien_expire" | "lien_deja_utilise" };

/**
 * Suit un lien de connexion : le consomme, crée le compte s'il n'existe pas encore,
 * et ouvre une session.
 */
export async function consumeMagicLink(token: string): Promise<LoginResult> {
  const tokenHash = hashToken(token);

  return db.transaction(async (tx) => {
    const rows = await tx.execute<{
      id: string;
      email: string;
      used_at: Date | null;
      expired: boolean;
    }>(sql`
      select id, email, used_at, (expires_at <= now()) as expired
      from magic_link
      where token_hash = ${tokenHash}
      for update
    `);

    const link = rows[0];
    if (!link) return { ok: false as const, reason: "lien_inconnu" as const };
    if (link.used_at) return { ok: false as const, reason: "lien_deja_utilise" as const };
    if (link.expired) return { ok: false as const, reason: "lien_expire" as const };

    await tx.execute(sql`update magic_link set used_at = now() where id = ${link.id}`);

    const existing = await tx
      .select()
      .from(s.account)
      .where(and(eq(s.account.email, link.email), isNull(s.account.deletedAt)))
      .limit(1);

    let account = existing[0];
    let isNew = false;

    if (!account) {
      // Nom provisoire tiré de l'adresse : l'écran d'accueil demande immédiatement au
      // parent sous quel nom il veut apparaître.
      const provisional = link.email.split("@")[0].slice(0, 60);
      const created = await tx
        .insert(s.account)
        .values({ email: link.email, displayName: provisional })
        .returning();
      account = created[0];
      isNew = true;
    }

    const sessionToken = generateToken();
    await tx.insert(s.session).values({
      accountId: account.id,
      tokenHash: hashToken(sessionToken),
      expiresAt: sql`now() + interval '${sql.raw(SESSION_TTL)}'`,
    });

    return { ok: true as const, account, sessionToken, isNew };
  });
}

/**
 * Le compte derrière un jeton de session, ou null. Rejette les sessions expirées et les
 * comptes supprimés — un compte supprimé ne peut plus rien lire, même avec un cookie valide.
 */
export async function resolveSession(sessionToken: string): Promise<Account | null> {
  const rows = await db
    .select({
      account: s.account,
      sessionId: s.session.id,
      stale: sql<boolean>`${s.session.lastSeenAt} < now() - interval '1 hour'`,
    })
    .from(s.session)
    .innerJoin(s.account, eq(s.account.id, s.session.accountId))
    .where(
      and(
        eq(s.session.tokenHash, hashToken(sessionToken)),
        gt(s.session.expiresAt, sql`now()`),
        isNull(s.account.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // On ne réécrit la date de dernière activité qu'une fois par heure : inutile d'écrire
  // en base à chaque affichage de page.
  if (row.stale) {
    await db.execute(sql`
      update session set last_seen_at = now() where id = ${row.sessionId}
    `);
    await db.execute(sql`
      update account set last_seen_at = now() where id = ${row.account.id}
    `);
  }

  return row.account;
}

export async function destroySession(sessionToken: string): Promise<void> {
  await db.execute(sql`delete from session where token_hash = ${hashToken(sessionToken)}`);
}

/** Déconnecte toutes les sessions d'un compte (appareil perdu, doute sur un accès). */
export async function destroyAllSessions(accountId: string): Promise<void> {
  await db.execute(sql`delete from session where account_id = ${accountId}`);
}

export type DisplayNameResult = { ok: true } | { ok: false; reason: string };

export async function setDisplayName(
  accountId: string,
  rawName: string,
): Promise<DisplayNameResult> {
  const parsed = displayNameSchema.safeParse(rawName);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0].message };
  }
  await db.execute(sql`
    update account set display_name = ${parsed.data} where id = ${accountId}
  `);
  return { ok: true };
}
