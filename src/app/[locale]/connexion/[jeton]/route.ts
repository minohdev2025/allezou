/**
 * Vérification du lien de connexion.
 *
 * C'est un Route Handler et non une page : le lien est ouvert par un clic, donc en GET, et
 * un cookie ne peut être posé que depuis un Route Handler ou une Server Action — jamais
 * pendant le rendu d'une page.
 *
 * Le lien n'est PAS consommé ici : on vérifie qu'il existe et on pose un témoin
 * `COOKIE_CONFIRMATION=<token>` qui ouvre une page de confirmation. C'est le clic
 * explicite sur cette page (la server action `confirmerConnexion`) qui consomme
 * le lien et ouvre la session. Détail dans auth.ts > verifierLien.
 */

import { NextResponse } from "next/server";

import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { verifierLien } from "@/lib/auth";
import { COOKIE_CONFIRMATION, COOKIE_SUITE, destinationSure } from "@/lib/session";

/** Quinze minutes : la durée de vie d'un lien de connexion. */
const QUINZE_MINUTES_EN_SECONDES = 15 * 60;

/**
 * L'adresse publique du site, pour construire les redirections.
 *
 * Surtout pas `request.url` : derrière un proxy inverse ou un tunnel, il vaut
 * `http://localhost:3000`, et le parent qui suit son lien de connexion atterrit sur une
 * adresse qui n'existe pas depuis son téléphone.
 */
function adressePublique(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL;

  const protocole = request.headers.get("x-forwarded-proto");
  const hote = request.headers.get("host");
  if (protocole && hote) return `${protocole}://${hote}`;

  return request.url;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jeton: string }> },
) {
  const { jeton } = await params;
  const result = await verifierLien(jeton);
  const base = adressePublique(request);

  if (!result.ok) {
    return NextResponse.redirect(new URL(`/connexion?erreur=${result.reason}`, base));
  }

  // Le témoin ne porte que le jeton. La vérification reste faite ici, et la
  // server action reverifie au moment de consommer — sans quoi un témoin copié
  // d'un autre onglet suffirait à passer.
  const locale: Locale = (routing.locales as readonly string[]).includes(result.locale)
    ? (result.locale as Locale)
    : routing.defaultLocale;

  const confirmer = getPathname({ href: "/connexion/confirmer", locale });
  const response = NextResponse.redirect(new URL(`${confirmer}?jeton=${jeton}`, base));

  response.cookies.set(COOKIE_CONFIRMATION, jeton, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: QUINZE_MINUTES_EN_SECONDES,
  });

  // Et on garde la destination d'origine si elle existe : un clic humain qui
  // passe par la confirmation veut toujours y revenir (un cercle, une sortie).
  const suite = destinationSure(request.headers.get("cookie")?.match(
    new RegExp(`${COOKIE_SUITE}=([^;]+)`),
  )?.[1]);
  if (suite) {
    response.cookies.set(COOKIE_SUITE, suite, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: QUINZE_MINUTES_EN_SECONDES,
    });
  }

  return response;
}

