/**
 * La session, côté Next : un cookie qui ne contient qu'un jeton opaque.
 *
 * Le cookie ne porte aucune information sur le compte — pas d'identifiant, pas de nom, pas
 * de rôle. Tout est relu en base à chaque requête, pour qu'un départ de cercle ou une
 * suppression de compte prenne effet immédiatement et non à la prochaine reconnexion.
 */

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { resolveSession, type Account } from "./auth";

export const COOKIE_SESSION = "totir_session";

/**
 * Porte le jeton d'invitation de l'action à la page qui l'affiche, sans passer par l'URL.
 * Cinq minutes suffisent : au-delà, il faut en recréer un, ce qui ne coûte rien.
 */
export const COOKIE_INVITATION = "totir_invitation";

const SIX_MOIS_EN_SECONDES = 180 * 24 * 60 * 60;

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_SESSION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SIX_MOIS_EN_SECONDES,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_SESSION);
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_SESSION)?.value ?? null;
}

/** Le compte connecté, ou null. */
export async function currentAccount(): Promise<Account | null> {
  const token = await readSessionToken();
  if (!token) return null;
  return resolveSession(token);
}

/**
 * Le compte connecté, ou redirection vers la connexion.
 * À appeler au début de chaque page et de chaque action : une Server Action est joignable
 * directement en POST, pas seulement depuis l'interface.
 */
export async function requireAccount(): Promise<Account> {
  const account = await currentAccount();
  if (!account) redirect("/connexion");
  return account;
}

/**
 * Qui relit l'agenda.
 *
 * Il n'y a volontairement pas de rôle « administrateur » dans la base : ce serait un pouvoir
 * de plus à modéliser, à protéger et à révoquer, pour une seule personne au pilote. La liste
 * vit dans la configuration du serveur, où elle ne peut être modifiée que par qui l'exploite.
 */
export function estRelecteur(account: Account): boolean {
  const autorises = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return autorises.includes(account.email.toLowerCase());
}

export async function requireRelecteur(): Promise<Account> {
  const account = await requireAccount();
  if (!estRelecteur(account)) notFound();
  return account;
}
