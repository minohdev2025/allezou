/**
 * Consommation du lien de connexion.
 *
 * C'est un Route Handler et non une page : le lien est ouvert par un clic, donc en GET, et
 * un cookie ne peut être posé que depuis un Route Handler ou une Server Action — jamais
 * pendant le rendu d'une page.
 */

import { NextResponse } from "next/server";

import { getPathname } from "@/i18n/navigation";
import { LOCALE_COOKIE, routing, type Locale } from "@/i18n/routing";
import { consumeMagicLink } from "@/lib/auth";
import { COOKIE_SESSION, COOKIE_SUITE, destinationSure } from "@/lib/session";

const SIX_MOIS_EN_SECONDES = 180 * 24 * 60 * 60;

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
  const result = await consumeMagicLink(jeton);
  const base = adressePublique(request);

  if (!result.ok) {
    return NextResponse.redirect(new URL(`/connexion?erreur=${result.reason}`, base));
  }

  // Où l'on allait avant d'être renvoyé au formulaire. Un compte tout neuf passe d'abord
  // par l'accueil : le témoin lui survit et sera consommé à la dernière marche.
  const suite = destinationSure(request.headers.get("cookie")?.match(
    new RegExp(`${COOKIE_SUITE}=([^;]+)`),
  )?.[1]);

  // La langue du compte prime sur celle du navigateur : c'est un réglage, pas une
  // déduction. Le chemin est préfixé pour elle, et le cookie posé pour les pages suivantes.
  const locale: Locale = (routing.locales as readonly string[]).includes(result.account.locale)
    ? (result.account.locale as Locale)
    : routing.defaultLocale;

  const destination = result.isNew ? "/bienvenue" : (suite ?? "/maintenant");
  const response = NextResponse.redirect(
    new URL(getPathname({ href: destination, locale }), base),
  );

  response.cookies.set(LOCALE_COOKIE.name, locale, {
    maxAge: LOCALE_COOKIE.maxAge,
    sameSite: LOCALE_COOKIE.sameSite,
    path: LOCALE_COOKIE.path,
  });

  if (suite && !result.isNew) response.cookies.delete(COOKIE_SUITE);

  response.cookies.set(COOKIE_SESSION, result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SIX_MOIS_EN_SECONDES,
  });

  return response;
}
