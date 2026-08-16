import { NextResponse, type NextRequest } from "next/server";

/**
 * En-tête de sécurité du contenu, avec un nonce par requête.
 *
 * `strict-dynamic` et un nonce plutôt qu'une liste d'origines : même si une injection
 * parvenait à glisser une balise script dans une page, elle n'aurait pas le nonce du moment
 * et le navigateur refuserait de l'exécuter.
 *
 * `style-src` garde `'unsafe-inline'`, et c'est assumé : les couleurs de cercle sont posées
 * en attribut `style`, qu'un nonce ne peut pas couvrir. Une injection de style est très loin
 * de valoir une injection de script — le compromis est du bon côté.
 *
 * `Permissions-Policy: geolocation=()` n'est pas une précaution de forme : c'est la promesse
 * de PRODUIT.md rendue opposable par le navigateur. Allezou ne peut pas demander la position,
 * même si quelqu'un ajoutait le code pour le faire.
 *
 * Les hôtes Google des directives style/img/font/connect/frame servent à la carte intégrée
 * (carte-client.tsx), suivant la liste que Google documente pour son API JS. La CSP autorise,
 * mais c'est le voile qui décide : aucune de ces origines ne reçoit de requête tant que
 * personne n'a touché « Voir sur la carte ». Le script, lui, n'a besoin de rien de plus —
 * `strict-dynamic` couvre le chargeur que notre code, porteur du nonce, insère lui-même.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://*.googleapis.com https://*.gstatic.com https://*.google.com;
    font-src 'self' https://fonts.gstatic.com;
    connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.google.com;
    frame-src 'self' https://*.google.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const entrantes = new Headers(request.headers);
  entrantes.set("x-nonce", nonce);
  entrantes.set("Content-Security-Policy", csp);

  const reponse = NextResponse.next({ request: { headers: entrantes } });

  reponse.headers.set("Content-Security-Policy", csp);
  reponse.headers.set("X-Content-Type-Options", "nosniff");
  reponse.headers.set("Referrer-Policy", "same-origin");
  reponse.headers.set(
    "Permissions-Policy",
    "geolocation=(), camera=(), microphone=(), payment=(), interest-cohort=()",
  );

  return reponse;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
