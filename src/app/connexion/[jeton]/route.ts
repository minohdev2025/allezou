/**
 * Consommation du lien de connexion.
 *
 * C'est un Route Handler et non une page : le lien est ouvert par un clic, donc en GET, et
 * un cookie ne peut être posé que depuis un Route Handler ou une Server Action — jamais
 * pendant le rendu d'une page.
 */

import { NextResponse } from "next/server";

import { consumeMagicLink } from "@/lib/auth";
import { COOKIE_SESSION } from "@/lib/session";

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

  const response = NextResponse.redirect(
    new URL(result.isNew ? "/bienvenue" : "/maintenant", base),
  );

  response.cookies.set(COOKIE_SESSION, result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SIX_MOIS_EN_SECONDES,
  });

  return response;
}
