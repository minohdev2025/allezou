import type { MetadataRoute } from "next";
import { sql } from "drizzle-orm";

import { routing } from "@/i18n/routing";
import { db } from "@/lib/db";
import { asDate } from "@/lib/db/rows";

/**
 * Le plan de site, généré pour que les moteurs et les LLM puissent découvrir
 * chaque URL sans avoir à crawler le site entier.
 *
 * Deux familles d'adresses, en cinq langues :
 *
 * - les pages fixes du site public — l'accueil (« Nous sortons »), l'agenda, les
 *   lieux, données, questions, à propos, comment ;
 * - une fiche par activité publiée à l'agenda et pas encore terminée. C'est là que
 *   vit la matière qu'un parent cherche sur un moteur (« atelier poterie Lancy
 *   samedi »), et chaque fiche est une page publique depuis le 7 septembre 2026.
 *   Ce qui est retiré ou passé n'y figure pas : on n'envoie pas un moteur vers une
 *   page qui dit « cette activité n'est plus annoncée ».
 *
 * Le reste (compte, sorties, cercles…) renvoie vers `/connexion` ou est
 * strictement personnel, et `robots.txt` le bloque déjà — on ne le liste pas ici.
 *
 * `lastmod` des pages fixes est la date du jour, pour signaler aux moteurs que le
 * sitemap est vivant sans mensonge : elle évolue à chaque déploiement, et Google
 * accepte cette approximation tant qu'elle est monotonement croissante. Les fiches,
 * elles, portent leur vraie date de mise à jour.
 *
 * Chaque URL porte ses variantes `<xhtml:link rel="alternate" hreflang="…">`
 * : c'est la forme recommandée par Google pour signaler les langues
 * soeurs sans dupliquer le sitemap.
 */

const PAGES_PUBLIQUES = [
  "",
  "/agenda",
  "/lieux",
  "/donnees",
  "/questions",
  "/a-propos",
  "/comment",
] as const;

const LOCALES = routing.locales;
const ORIGINE = "https://allezou.ch";

/** Une entrée par langue pour un chemin, avec ses sœurs en `alternates`. */
function entrees(
  chemin: string,
  lastModified: Date,
  priority: number,
  changeFrequency: "daily" | "weekly",
): MetadataRoute.Sitemap {
  const langues = Object.fromEntries(
    LOCALES.map((l) => [
      l,
      `${l === routing.defaultLocale ? ORIGINE : `${ORIGINE}/${l}`}${chemin || "/"}`,
    ]),
  );
  // x-default pointe vers la version française (langue du marché principal).
  langues["x-default"] = `${ORIGINE}${chemin || "/"}`;

  return LOCALES.map((locale) => ({
    url:
      locale === routing.defaultLocale
        ? `${ORIGINE}${chemin || "/"}`
        : `${ORIGINE}/${locale}${chemin}`,
    lastModified,
    changeFrequency,
    priority,
    alternates: { languages: langues },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const aujourdHui = new Date();

  const fixes = PAGES_PUBLIQUES.flatMap((chemin) =>
    entrees(chemin, aujourdHui, chemin === "" ? 1 : chemin === "/agenda" ? 0.8 : 0.6, "weekly"),
  );

  // Les activités publiées, encore à venir ou en cours, retirées exclues. Le plafond
  // garde le plan de site sous la taille que les moteurs lisent d'un trait.
  const activites = await db.execute<{ id: string; updated_at: Date }>(sql`
    select e.id, e.updated_at
    from event e
    where e.published_at is not null
      and e.withdrawn_at is null
      and e.rejected_at is null
      and coalesce(e.ends_at, e.starts_at + interval '2 hours') >= now()
    order by e.starts_at asc
    limit 2000
  `);

  const fiches = activites.flatMap((a) =>
    entrees(`/agenda/${a.id}`, asDate(a.updated_at), 0.5, "daily"),
  );

  return [...fixes, ...fiches];
}
