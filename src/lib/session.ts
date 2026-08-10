/**
 * La session, côté Next : un cookie qui ne contient qu'un jeton opaque.
 *
 * Le cookie ne porte aucune information sur le compte — pas d'identifiant, pas de nom, pas
 * de rôle. Tout est relu en base à chaque requête, pour qu'un départ de cercle ou une
 * suppression de compte prenne effet immédiatement et non à la prochaine reconnexion.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveSession, type Account } from "./auth";

export const COOKIE_SESSION = "totir_session";

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
