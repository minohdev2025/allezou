import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "./db";
import * as s from "./db/schema";
import { estRelecteur } from "./session";
import type { Account } from "./auth";

/**
 * La boîte à idées.
 *
 * Une idée est publique entre comptes et ne se discute qu'entre son auteur et le
 * support. Tout le monde lit, tout le monde vote, personne ne commente à la place du
 * concerné — c'est ce qui garde l'endroit utilisable sans modération.
 */

export const TITRE_MAX = 120;
export const TEXTE_MAX = 2000;

export const titreSchema = z.string().trim().min(2).max(TITRE_MAX);
export const texteSchema = z.string().trim().min(4).max(TEXTE_MAX);
export const typeSchema = z.enum(["fonctionnalite", "bug"]);

export type IdeaType = z.infer<typeof typeSchema>;

export type IdeaError =
  | "idee_introuvable"
  | "contenu_invalide"
  | "pas_autorise"
  | "deja_ferree";

export type Result<T> = { ok: true; value: T } | { ok: false; reason: IdeaError };

export type Idea = typeof s.idea.$inferSelect;
export type IdeaMessage = typeof s.ideaMessage.$inferSelect;

/** L'état visible d'une idée, dérivé du fil — jamais stocké, jamais faux. */
export type EtatIdee = "nouvelle" | "repondu" | "relancee" | "fermee";

/** Les adresses du support, en minuscules. Les mêmes que les « outils d'administration ». */
export function emailsSupport(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Le support : les comptes listés dans ADMIN_EMAILS. */
export function estSupport(account: Account): boolean {
  return estRelecteur(account);
}

export async function creerIdee(
  account: Account,
  entree: { type: string; titre: string; texte: string },
): Promise<Result<Idea>> {
  const valide = typeSchema.safeParse(entree.type);
  const titre = titreSchema.safeParse(entree.titre);
  const texte = texteSchema.safeParse(entree.texte);
  if (!valide.success || !titre.success || !texte.success) {
    return { ok: false, reason: "contenu_invalide" };
  }

  const [idee] = await db
    .insert(s.idea)
    .values({ type: valide.data, titre: titre.data, texte: texte.data, authorId: account.id })
    .returning();

  // Le texte d'ouverture rejoint le fil comme premier message : une idée sans fil
  // n'existe pas, et le support n'a jamais deux endroits à regarder.
  await db
    .insert(s.ideaMessage)
    .values({ ideaId: idee.id, authorId: account.id, texte: texte.data });

  return { ok: true, value: idee };
}

/**
 * Écrire dans le fil. L'auteur et le support seuls : ce qui se dit ici est une
 * réponse, pas un avis de la salle. Une idée fermée n'est plus une conversation,
 * y compris pour celle qui l'a fermée.
 */
export async function repondreIdee(
  account: Account,
  ideaId: string,
  texteBrut: string,
): Promise<Result<IdeaMessage>> {
  const texte = texteSchema.safeParse(texteBrut);
  if (!texte.success) return { ok: false, reason: "contenu_invalide" };

  const [idee] = await db.select().from(s.idea).where(eq(s.idea.id, ideaId));
  if (!idee) return { ok: false, reason: "idee_introuvable" };
  if (account.id !== idee.authorId && !estSupport(account)) {
    return { ok: false, reason: "pas_autorise" };
  }
  if (idee.closedAt) return { ok: false, reason: "deja_ferree" };

  const [message] = await db
    .insert(s.ideaMessage)
    .values({ ideaId, authorId: account.id, texte: texte.data })
    .returning();

  return { ok: true, value: message };
}

/** Voter, ou retirer son vote. Un clic de trop ne doit rien casser. */
export async function voterIdee(account: Account, ideaId: string): Promise<boolean> {
  const existant = await db
    .select({ ideaId: s.ideaVote.ideaId })
    .from(s.ideaVote)
    .where(and(eq(s.ideaVote.ideaId, ideaId), eq(s.ideaVote.accountId, account.id)));

  if (existant.length > 0) {
    await db
      .delete(s.ideaVote)
      .where(and(eq(s.ideaVote.ideaId, ideaId), eq(s.ideaVote.accountId, account.id)));
    return false;
  }
  await db.insert(s.ideaVote).values({ ideaId, accountId: account.id }).onConflictDoNothing();
  return true;
}

/** Fermer l'idée : son auteur d'abord, le support si l'auteur a déserté. */
export async function fermerIdee(
  account: Account,
  ideaId: string,
): Promise<Result<void>> {
  const [idee] = await db.select().from(s.idea).where(eq(s.idea.id, ideaId));
  if (!idee) return { ok: false, reason: "idee_introuvable" };
  if (account.id !== idee.authorId && !estSupport(account)) {
    return { ok: false, reason: "pas_autorise" };
  }
  if (idee.closedAt) return { ok: false, reason: "deja_ferree" };

  await db
    .update(s.idea)
    .set({ closedAt: new Date(), closedBy: account.id })
    .where(eq(s.idea.id, ideaId));
  return { ok: true, value: undefined };
}

/* -------------------------------------------------------------- lecture */

export type ResumeIdee = {
  id: string;
  type: IdeaType;
  titre: string;
  auteur: string;
  auteurId: string;
  createdAt: Date;
  votes: number;
  vote: boolean;
  etat: EtatIdee;
};

/** Les messages d'un fil, auteur par auteur, avec le drapeau support déjà résolu. */
type FilMessage = {
  ideaId: string;
  authorId: string;
  createdAt: Date;
  support: boolean;
};

/**
 * Les idées avec leurs votes et l'état du fil.
 *
 * Trois requêtes droites — les idées, les votes, les messages — et l'état se calcule
 * en TypeScript. Un SQL à six sous-requêtes corrélées économiserait un aller-retour
 * et coûterait sa lisibilité à la seule règle qui compte ici.
 */
async function charger(
  premice: ReturnType<typeof eq> | ReturnType<typeof isNull> | undefined,
  compteCourantId?: string,
): Promise<ResumeIdee[]> {
  const idees = await db
    .select({
      id: s.idea.id,
      type: s.idea.type,
      titre: s.idea.titre,
      auteur: s.account.displayName,
      auteurId: s.idea.authorId,
      createdAt: s.idea.createdAt,
      closedAt: s.idea.closedAt,
    })
    .from(s.idea)
    .innerJoin(s.account, eq(s.account.id, s.idea.authorId))
    .where(premice)
    .orderBy(desc(s.idea.createdAt))
    .limit(200);

  if (idees.length === 0) return [];
  const ids = idees.map((i) => i.id);
  const mailsSupport = new Set(emailsSupport());

  const [votesBruts, votesCourants, messages] = await Promise.all([
    db
      .select({ ideaId: s.ideaVote.ideaId, votes: sql<number>`count(*)::int` })
      .from(s.ideaVote)
      .where(inArray(s.ideaVote.ideaId, ids))
      .groupBy(s.ideaVote.ideaId),
    compteCourantId
      ? db
          .select({ ideaId: s.ideaVote.ideaId })
          .from(s.ideaVote)
          .where(and(inArray(s.ideaVote.ideaId, ids), eq(s.ideaVote.accountId, compteCourantId)))
      : Promise.resolve([] as { ideaId: string }[]),
    db
      .select({
        ideaId: s.ideaMessage.ideaId,
        authorId: s.ideaMessage.authorId,
        createdAt: s.ideaMessage.createdAt,
        email: s.account.email,
      })
      .from(s.ideaMessage)
      .innerJoin(s.account, eq(s.account.id, s.ideaMessage.authorId))
      .where(inArray(s.ideaMessage.ideaId, ids))
      .orderBy(s.ideaMessage.createdAt),
  ]);

  const votesParIdees = new Map(votesBruts.map((v) => [v.ideaId, v.votes]));
  const dejaVote = new Set(votesCourants.map((v) => v.ideaId));
  const filParIdees = new Map<string, FilMessage[]>();
  for (const m of messages) {
    const fil = filParIdees.get(m.ideaId) ?? [];
    fil.push({
      ideaId: m.ideaId,
      authorId: m.authorId,
      createdAt: m.createdAt,
      support: mailsSupport.has(m.email.toLowerCase()),
    });
    filParIdees.set(m.ideaId, fil);
  }

  return idees
    .map((i) => {
      const fil = filParIdees.get(i.id) ?? [];
      const dernierSupport = [...fil].reverse().find((m) => m.support);
      const relance =
        dernierSupport !== undefined &&
        fil.some(
          (m) =>
            !m.support && m.authorId === i.auteurId && m.createdAt > dernierSupport.createdAt,
        );
      const etat: EtatIdee = i.closedAt
        ? "fermee"
        : relance
          ? "relancee"
          : dernierSupport
            ? "repondu"
            : "nouvelle";
      return {
        id: i.id,
        type: i.type,
        titre: i.titre,
        auteur: i.auteur ?? "—",
        auteurId: i.auteurId,
        createdAt: i.createdAt,
        votes: votesParIdees.get(i.id) ?? 0,
        vote: dejaVote.has(i.id),
        etat,
      };
    })
    .sort(
      (a, b) =>
        Number(a.etat === "fermee") - Number(b.etat === "fermee") ||
        b.votes - a.votes ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
}

export async function toutesLesIdees(compteCourantId?: string): Promise<ResumeIdee[]> {
  return charger(undefined, compteCourantId);
}

export async function mesIdees(accountId: string): Promise<ResumeIdee[]> {
  return charger(eq(s.idea.authorId, accountId), accountId);
}

/** Les idées non fermées, pour l'écran du support. */
export async function ideesOuvertes(compteCourantId?: string): Promise<ResumeIdee[]> {
  return charger(isNull(s.idea.closedAt), compteCourantId);
}

export type MessageDuFil = IdeaMessage & { auteur: string; support: boolean };

export type DetailIdee = ResumeIdee & {
  texte: string;
  messages: MessageDuFil[];
  cloturePar: string | null;
  estAuteur: boolean;
  estSupport: boolean;
  peutEcrire: boolean;
};

export async function detailIdee(
  account: Account,
  ideaId: string,
): Promise<DetailIdee | null> {
  const [resume] = await charger(eq(s.idea.id, ideaId), account.id);
  if (!resume) return null;

  const [idee] = await db.select().from(s.idea).where(eq(s.idea.id, ideaId));
  const mailsSupport = new Set(emailsSupport());

  const [lignes, cloture] = await Promise.all([
    db
      .select({
        message: s.ideaMessage,
        auteur: s.account.displayName,
        email: s.account.email,
      })
      .from(s.ideaMessage)
      .innerJoin(s.account, eq(s.account.id, s.ideaMessage.authorId))
      .where(eq(s.ideaMessage.ideaId, ideaId))
      .orderBy(s.ideaMessage.createdAt),
    idee.closedBy
      ? db
          .select({ nom: s.account.displayName })
          .from(s.account)
          .where(eq(s.account.id, idee.closedBy))
      : Promise.resolve([] as { nom: string | null }[]),
  ]);

  const estAuteur = idee.authorId === account.id;
  const estSupportCourant = estSupport(account);

  return {
    ...resume,
    texte: idee.texte,
    cloturePar: cloture[0]?.nom ?? null,
    estAuteur,
    estSupport: estSupportCourant,
    peutEcrire: !idee.closedAt && (estAuteur || estSupportCourant),
    messages: lignes.map((l) => ({
      ...l.message,
      auteur: l.auteur ?? "—",
      support: mailsSupport.has(l.email.toLowerCase()),
    })),
  };
}
