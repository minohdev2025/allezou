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

/**
 * Le défi d'une clé d'accès, entre son émission et sa vérification.
 *
 * Il doit être à usage unique et de courte durée : c'est lui qui empêche de rejouer une
 * signature capturée. Deux minutes suffisent largement à poser un doigt sur un capteur.
 */
export const COOKIE_DEFI = "totir_defi";

/**
 * Marque que l'accueil a été lu et qu'on ne veut plus le revoir.
 *
 * Il n'y a pas de compte à ce moment-là : la personne n'est pas connectée, c'est justement
 * pourquoi elle voit cette page. Le réglage vit donc dans un témoin de navigation, propre à
 * cet appareil, et `/?revoir=1` ramène la page à qui la redemande.
 */
export const COOKIE_ACCUEIL = "totir_accueil";

/**
 * Où reprendre après la connexion.
 *
 * Une invitation arrive par message, et celle qui la suit n'est presque jamais connectée.
 * Sans ce témoin, elle passait par le formulaire, attendait son courriel, cliquait, et
 * atterrissait sur « Aucun cercle pour l'instant » : l'invitation était perdue, et il fallait
 * retourner dans WhatsApp pour recliquer. Celle qui ne comprend pas abandonne.
 *
 * Un quart d'heure, comme le lien de connexion qu'il accompagne.
 */
export const COOKIE_SUITE = "totir_suite";

/**
 * Le jeton de connexion entre sa vérification et la confirmation humaine.
 *
 * Le clic sur le lien reçu par courriel ne consomme plus le lien — il ouvre une
 * page de confirmation pour décourager les scanners qui pré-cliquent. Ce témoin
 * porte le jeton en attendant le clic explicite. Quinze minutes, comme la durée
 * de vie du lien lui-même.
 */
export const COOKIE_CONFIRMATION = "totir_confirmation";

/** Les durées exportées, pour les server actions qui posent les témoins de session. */
export const UN_QUART_D_HEURE = 15 * 60;
export const SIX_MOIS_EN_SECONDES = 180 * 24 * 60 * 60;
export const UN_AN_EN_SECONDES = 365 * 24 * 60 * 60;

/**
 * Une destination interne, et rien d'autre.
 *
 * Ce qui entre ici vient d'une URL, donc de n'importe qui. Sans cette vérification, un lien
 * bien tourné enverrait quelqu'un vers un autre site juste après s'être connecté chez nous,
 * ce qui est la forme la plus efficace d'hameçonnage.
 */
export function destinationSure(valeur: string | undefined | null): string | undefined {
  if (!valeur) return undefined;
  return /^\/(rejoindre|parent)\/[A-Za-z0-9_-]{8,200}$/.test(valeur) ? valeur : undefined;
}

export async function poserSuite(destination: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_SUITE, destination, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UN_QUART_D_HEURE,
  });
}

/** Lit sans consommer : une page ne peut pas effacer un témoin. */
export async function lireSuite(): Promise<string | undefined> {
  const store = await cookies();
  return destinationSure(store.get(COOKIE_SUITE)?.value);
}

/** Lit et consomme. Réservé aux actions et aux gestionnaires de route. */
export async function releverSuite(): Promise<string | undefined> {
  const store = await cookies();
  const destination = destinationSure(store.get(COOKIE_SUITE)?.value);
  store.delete(COOKIE_SUITE);
  return destination;
}

export async function masquerAccueil(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_ACCUEIL, "lu", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UN_AN_EN_SECONDES,
  });
}

export async function accueilMasque(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE_ACCUEIL)?.value === "lu";
}

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
