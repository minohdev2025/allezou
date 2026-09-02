import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { routing } from "./i18n/routing";

/**
 * Le routage des langues : réécrit /agenda vers /fr/agenda en interne, redirige un
 * navigateur anglophone de / vers /en, pose l'en-tête de locale que lisent les actions
 * serveur, et le `Link` d'alternates que lisent les moteurs.
 */
const routageLangues = createMiddleware(routing);

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

  // Muter les en-têtes de la requête AVANT le routage des langues : il les recopie dans
  // celle qu'il transmet à l'application, nonce et CSP compris (vérifié dans son code,
  // middleware.js copie `request.headers`).
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const reponse = routageLangues(request);

  reponse.headers.set("Content-Security-Policy", csp);
  reponse.headers.set("X-Content-Type-Options", "nosniff");
  reponse.headers.set("Referrer-Policy", "same-origin");
  reponse.headers.set(
    "Permissions-Policy",
    "geolocation=(), camera=(), microphone=(), payment=(), interest-cohort=()",
  );

  /*
   * Cache-Control : différent selon que la page est publique ou privée.
   *
   * Pages publiques (`/`, `/donnees`, `/questions`, `/a-propos`, `/comment`,
   * `/parcs`, leurs variantes locales) : `public, max-age=300, s-maxage=3600,
   * stale-while-revalidate=86400`. Un crawler comme Googlebot peut mettre
   * la page en cache 5 minutes côté navigateur, 1 heure côté CDN, et
   * réutiliser la version périmée jusqu'à 24h pendant qu'il régénère. C'est
   * le standard pour un site de cette taille : le crawl budget est préservé
   * sans cacher longtemps un contenu susceptible de bouger.
   *
   * Pages privées (`/maintenant`, `/reglages`, `/connexion`, etc.) :
   * `private, no-store`. Ces pages affichent du contenu personnel, elles
   * ne doivent jamais être cachées par un proxy intermédiaire ni par le
   * back/forward cache du navigateur — sinon une autre personne connectée
   * au même proxy verrait le compte d'avant.
   *
   * Le path d'origine est dans `request.nextUrl.pathname` ; on teste
   * préfixe par préfixe, et tout ce qui n'est pas dans la liste publique
   * tombe en `private, no-store` par défaut — sécurisant.
   */
  const chemin = request.nextUrl.pathname;
  const PUBLIC = /^\/(?:$|(?:[a-z]{2}\/)?(?:donnees|questions|a-propos|comment|parcs)(?:\/.*)?$)/;
  const estPublique = PUBLIC.test(chemin);
  reponse.headers.set("Cache-Control", estPublique
    ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
    : "private, no-store, no-cache, must-revalidate");

  return reponse;
}

/**
 * Les prefetches ne sont plus sautés : une adresse française sans préfixe (/agenda) n'existe
 * qu'à travers la réécriture du proxy, et un prefetch qui la manquerait ferait un 404 pour
 * rien. Le coût d'un nonce par prefetch est le prix d'un routage juste.
 *
 * Les chemins à point (favicon.ico, sw.js, robots.txt, manifest…) restent hors langue.
 * `/icon` et `/apple-icon` n'ont pas de point dans leur URL — ce sont des routes de
 * métadonnées générées (src/app/icon.tsx) — et le routeur de langues les réécrivait en
 * /fr/icon, où le catch-all répond 404 : l'icône d'onglet et celle d'iOS étaient
 * silencieusement mortes, y compris en production. Elles sont exclues du matcher.
 */
export const config = {
  matcher: ["/((?!_next|_vercel|icon$|apple-icon$|.*\\..*).*)"],
};
