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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jeton: string }> },
) {
  const { jeton } = await params;
  const result = await consumeMagicLink(jeton);

  if (!result.ok) {
    return NextResponse.redirect(new URL(`/connexion?erreur=${result.reason}`, request.url));
  }

  const response = NextResponse.redirect(
    new URL(result.isNew ? "/bienvenue" : "/maintenant", request.url),
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
