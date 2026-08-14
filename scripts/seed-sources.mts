/**
 * Sources de l'agenda genevois — état vérifié le 9 août 2026.
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
    config: { maxPages: 3 },
  },
  {
    name: "Onex — agenda communal",
    url: "https://www.onex.ch/mes-loisirs/agenda/",
    kind: "html_ai" as const,
    commune: "Onex",
    autoPublish: true,
    // Treize pages de neuf entrées, dont la première ne contient guère que des cours de
    // fitness pour adultes : s'arrêter là donnait une source « ok » qui ne rapportait rien.
    // Six pages couvrent environ deux mois, ce que la relecture hebdomadaire peut absorber.
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
