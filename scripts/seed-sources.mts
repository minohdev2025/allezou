/**
 * Sources de l'agenda genevois — état vérifié le 14 août 2026.
 *
 *   npm run sources:seed
 *
 * La Ville de Genève expose du schema.org `Event` en JSON-LD sur chaque fiche (titre, dates,
 * lieu, adresse). Rien n'y est interprété, donc rien n'y est inventé.
 *
 * Les communes (Lancy, Onex, Carouge) n'exposent ni JSON-LD, ni iCal, ni RSS — vérifié.
 * Elles passent donc par une lecture MiniMax M3. Leurs agendas paginent en `?page=N` à partir
 * de zéro : `maxPages` dit combien de pages lire, réunies en un seul appel au modèle.
 *
 * `autoPublish: true` ne veut pas dire « publier les yeux fermés » : chaque activité passe
 * les contrôles de `src/lib/ingest/controles.ts`, et ce qui en échoue un seul retombe en
 * file. C'est ce qui a levé la limite de deux communes inscrite ici jusqu'au 14 août 2026 :
 * le coût d'une commune de plus ne se compte plus en minutes de relecture hebdomadaire.
 *
 * Une source qu'on vient d'ajouter reste à `autoPublish: false` le temps de regarder ce
 * qu'elle rapporte vraiment. C'est le seul cas où tout passe par la file.
 *
 * Plusieurs communes tiennent leur agenda sous WordPress avec le greffon « The Events
 * Calendar », qui publie tout en iCalendar derrière `?ical=1`. C'est la meilleure source
 * possible : rien à interpréter, un identifiant stable, un fuseau déclaré.
 *
 * Le tour du canton, fait le 14 août 2026, et ce qu'il a écarté :
 *
 * - Chancy et Soral exposent `?ical=1`, mais leur feuille est vide ce jour-là. À reprendre
 *   si elle se remplit ; une source qui ne rapporte rien serait signalée muette.
 * - Carouge et Meyrin composent leur agenda dans le navigateur : la page servie ne contient
 *   aucune activité, ni pour nous ni pour le modèle.
 * - Anières, Thônex et Troinex publient un flux RSS de leur agenda, mais un RSS ne porte que
 *   la date de publication de l'article, pas celle de l'activité. Rien de gagné sur du HTML.
 * - Le flux `ge.ch/rss/evenement` de l'État est institutionnel (ventes de parcelles,
 *   consultations) et ne s'adresse pas aux familles.
 */

import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

const { db } = await import("../src/lib/db/index.ts");
const s = await import("../src/lib/db/schema.ts");

const SOURCES = [
  {
    name: "Ville de Genève — agenda enfants et famille",
    url: "https://www.geneve.ch/fr/agenda?f%5B0%5D=for_who%3A167",
    kind: "jsonld" as const,
    commune: "Genève",
    autoPublish: true,
    config: { itemPattern: "/agenda/", maxPages: 3 },
  },
  {
    name: "Lancy — agenda communal",
    url: "https://www.lancy.ch/agenda",
    kind: "html_ai" as const,
    commune: "Lancy",
    autoPublish: true,
    // `itemPattern` sert à retrouver le lien de chaque fiche dans la page de liste : le
    // texte envoyé au modèle est débarrassé de ses balises, donc il n'y voit aucun `href`.
    // Lancy écrit le titre seul dans le lien, ce qui suffit à les rapprocher.
    config: { maxPages: 3, itemPattern: "/agenda/" },
  },
  {
    name: "Chêne-Bougeries — agenda communal",
    url: "https://chene-bougeries.ch/evenements/?ical=1",
    kind: "ical" as const,
    commune: "Chêne-Bougeries",
    autoPublish: true,
    // Le greffon range les séances du Conseil municipal avec le reste de l'agenda. Un
    // parent qui cherche une sortie de samedi n'a rien à faire de l'ordre du jour de la
    // mairie.
    config: { categoriesIgnorees: ["Séances Conseil municipal"] },
  },
  {
    name: "Laconnex — agenda communal",
    url: "https://www.laconnex.ch/agenda/?ical=1",
    kind: "ical" as const,
    commune: "Laconnex",
    autoPublish: true,
    // « Politique » couvre les séances du Conseil, « Ferraille » les levées d'encombrants.
    config: { categoriesIgnorees: ["Politique", "Ferraille"] },
  },
  {
    name: "Vernier — agenda communal",
    url: "https://www.vernier.ch/evenements",
    kind: "html_ai" as const,
    commune: "Vernier",
    autoPublish: true,
    // La plus grande commune du canton après la Ville, et aucun flux structuré. Quatre pages
    // de liste, qui paginent en `?page=N` comme les autres. Le lien de fiche porte le titre
    // suivi de la date, ce que la recherche par préfixe retrouve.
    config: { maxPages: 4, itemPattern: "/evenements/" },
  },
  {
    name: "Onex — agenda communal",
    url: "https://www.onex.ch/mes-loisirs/agenda/",
    kind: "html_ai" as const,
    commune: "Onex",
    autoPublish: true,
    // Treize pages de neuf entrées, dont la première ne contient guère que des cours de
    // fitness pour adultes : s'arrêter là donnait une source « ok » qui ne rapportait rien.
    // Six pages couvrent environ deux mois.
    //
    // Pas d'`itemPattern` : Onex compose ses fiches dans le navigateur, et la page servie ne
    // porte aucun lien vers elles. Ses activités renvoient donc à l'agenda de la commune, ce
    // qui est moins bien qu'un lien direct et mieux qu'un lien deviné.
    config: { maxPages: 6 },
  },
];

for (const source of SOURCES) {
  const [existing] = await db
    .select({ id: s.source.id })
    .from(s.source)
    .where(eq(s.source.url, source.url))
    .limit(1);

  if (existing) {
    await db.update(s.source).set(source).where(eq(s.source.id, existing.id));
    console.log(`mise à jour : ${source.name}`);
  } else {
    await db.insert(s.source).values(source);
    console.log(`ajoutée     : ${source.name}`);
  }
}

process.exit(0);
