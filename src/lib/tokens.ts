/**
 * Jetons de lien magique, d'invitation et de session.
 *
 * Le jeton en clair n'existe que dans le lien envoyé ou le cookie posé. La base ne stocke
 * que son empreinte : une fuite de la base ne permet de se connecter à aucun compte, et ne
 * permet d'entrer dans aucun cercle.
 */

import { createHash, randomBytes } from "node:crypto";

/** 32 octets aléatoires, encodés pour tenir dans une URL sans échappement. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Empreinte SHA-256 en hexadécimal — 64 caractères, la taille des colonnes `token_hash`. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
