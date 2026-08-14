/**
 * Connexion par clé d'accès.
 *
 * Le principe : l'appareil garde une clé privée qu'il ne révèle à personne, et nous ne
 * connaissons que la clé publique correspondante. Pour se connecter, l'appareil signe un
 * défi que nous venons d'émettre — l'empreinte, le visage ou le code servent à déverrouiller
 * l'appareil, jamais à nous être transmis. Nous n'apprenons donc rien de nouveau sur la
 * personne, et il n'y a aucun secret partagé à faire fuiter.
 *
 * Le lien par courriel reste le chemin de première entrée et de récupération : un téléphone
 * perdu ne doit pas fermer un compte.
 */

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";

import { createSession } from "./auth";
import { db } from "./db";
import * as s from "./db/schema";

export type PasskeyError =
  | "defi_absent"
  | "cle_inconnue"
  | "verification_echouee"
  | "cle_deja_enregistree";

export type Result<T> = { ok: true; value: T } | { ok: false; reason: PasskeyError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const ko = <T>(reason: PasskeyError): Result<T> => ({ ok: false, reason });

/** Nom affiché par l'appareil au moment d'enregistrer la clé. */
const NOM_DU_SITE = "Allezou";

/**
 * Le domaine auquel la clé est liée.
 *
 * Une clé d'accès ne vaut que pour un domaine : c'est ce qui la rend inutilisable sur un
 * site d'hameçonnage, même si la personne s'y laisse conduire. En contrepartie, changer
 * d'adresse invalide les clés enregistrées.
 */
export function domaine(): string {
  const url = new URL(process.env.APP_URL ?? "http://localhost:3000");
  return url.hostname;
}

export function origine(): string {
  return new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
}

/* ------------------------------------------------------- enregistrer une clé */

export async function optionsEnregistrement(accountId: string, displayName: string) {
  const existantes = await db
    .select({ id: s.passkey.id, transports: s.passkey.transports })
    .from(s.passkey)
    .where(eq(s.passkey.accountId, accountId));

  return generateRegistrationOptions({
    rpName: NOM_DU_SITE,
    rpID: domaine(),
    userName: displayName,
    userDisplayName: displayName,
    attestationType: "none",
    // On ne redemande pas une clé déjà enregistrée sur cet appareil : l'appareil le sait
    // et proposera d'en créer une autre plutôt que d'écraser celle-ci.
    excludeCredentials: existantes.map((c) => ({
      id: c.id,
      transports: c.transports ? (c.transports.split(",") as never) : undefined,
    })),
    authenticatorSelection: {
      // La clé reste dans l'appareil, déverrouillée par ce que la personne y utilise déjà —
      // empreinte, visage ou code selon le téléphone.
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
}

export async function enregistrerCle(
  accountId: string,
  reponse: Parameters<typeof verifyRegistrationResponse>[0]["response"],
  defi: string,
  label: string,
): Promise<Result<{ id: string }>> {
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: reponse,
      expectedChallenge: defi,
      expectedOrigin: origine(),
      expectedRPID: domaine(),
    });
  } catch {
    return ko("verification_echouee");
  }

  if (!verification.verified || !verification.registrationInfo) {
    return ko("verification_echouee");
  }

  const { credential } = verification.registrationInfo;

  const [deja] = await db
    .select({ id: s.passkey.id })
    .from(s.passkey)
    .where(eq(s.passkey.id, credential.id))
    .limit(1);
  if (deja) return ko("cle_deja_enregistree");

  await db.insert(s.passkey).values({
    id: credential.id,
    accountId,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports?.join(","),
    label: label.trim().slice(0, 60) || "Cet appareil",
  });

  return ok({ id: credential.id });
}

/* ---------------------------------------------------------- se connecter */

export async function optionsConnexion() {
  // Aucune liste de clés autorisées : on ne demande pas qui vous êtes avant de le savoir.
  // L'appareil propose les clés qu'il détient pour ce domaine, et rien ne fuit sur
  // l'existence d'un compte.
  return generateAuthenticationOptions({
    rpID: domaine(),
    userVerification: "preferred",
  });
}

export async function connecterParCle(
  reponse: Parameters<typeof verifyAuthenticationResponse>[0]["response"],
  defi: string,
): Promise<Result<{ sessionToken: string; accountId: string }>> {
  const [cle] = await db
    .select()
    .from(s.passkey)
    .innerJoin(s.account, eq(s.account.id, s.passkey.accountId))
    .where(and(eq(s.passkey.id, reponse.id)))
    .limit(1);

  if (!cle || cle.account.deletedAt) return ko("cle_inconnue");

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: reponse,
      expectedChallenge: defi,
      expectedOrigin: origine(),
      expectedRPID: domaine(),
      credential: {
        id: cle.passkey.id,
        publicKey: new Uint8Array(Buffer.from(cle.passkey.publicKey, "base64url")),
        counter: cle.passkey.counter,
      },
    });
  } catch {
    return ko("verification_echouee");
  }

  if (!verification.verified) return ko("verification_echouee");

  // Le compteur n'avance que dans un sens : un rejeu se verrait ici.
  await db
    .update(s.passkey)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(s.passkey.id, cle.passkey.id));

  const sessionToken = await createSession(cle.account.id);
  return ok({ sessionToken, accountId: cle.account.id });
}

/* ------------------------------------------------------------- gestion */

export type ClePubliee = {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export async function mesCles(accountId: string): Promise<ClePubliee[]> {
  return db
    .select({
      id: s.passkey.id,
      label: s.passkey.label,
      createdAt: s.passkey.createdAt,
      lastUsedAt: s.passkey.lastUsedAt,
    })
    .from(s.passkey)
    .where(eq(s.passkey.accountId, accountId))
    .orderBy(s.passkey.createdAt);
}

export async function oublierCle(accountId: string, id: string): Promise<void> {
  await db
    .delete(s.passkey)
    .where(and(eq(s.passkey.id, id), eq(s.passkey.accountId, accountId)));
}
