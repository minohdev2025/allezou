/**
 * Repasser le tri famille sur des activités déjà en base.
 *
 * Le tri ne tourne aujourd'hui qu'à l'ingestion, et seulement sur les sources structurées
 * (`filtreFamille: true`) : les communes lues par le modèle n'y passent pas, et l'agenda
 * s'est retrouvé avec des séances du Conseil municipal et des soirées salsa. Ce script
 * rejoue exactement le même tri — même consigne, même modèle — sur un lot exporté de la
 * base, et rend un verdict par activité. Il ne touche à rien : ce qu'on fait des verdicts
 * se décide après, en SQL, en connaissance de cause.
 *
 *   npx tsx scripts/tri-famille.mts entree.json sortie.json
 *
 * L'entrée est un tableau de `{ id, title, description, placeLabel }` — ce que le trieur
 * regarde, et rien de plus.
 */

import { readFile, writeFile } from "node:fs/promises";

import type { RawEvent } from "../src/lib/ingest/types";
import { reserveeAuxAines, trierPourFamilles } from "../src/lib/ingest/verification";

type Entree = {
  id: string;
  title: string;
  description: string | null;
  placeLabel: string | null;
};

const [, , fichierEntree, fichierSortie] = process.argv;
if (!fichierEntree || !fichierSortie) {
  console.error("usage: tsx scripts/tri-famille.mts <entree.json> <sortie.json>");
  process.exit(1);
}

const entrees: Entree[] = JSON.parse(await readFile(fichierEntree, "utf8"));

/* Le trieur lit des RawEvent : on n'en remplit que ce qu'il regarde. La date est
   obligatoire dans le type et n'entre dans aucune décision — d'où l'époque. */
const events: RawEvent[] = entrees.map((e) => ({
  externalId: e.id,
  title: e.title,
  description: e.description ?? undefined,
  placeLabel: e.placeLabel ?? undefined,
  startsAt: new Date(0),
}));

const verdicts = await trierPourFamilles(events);

/* La garde des aînés s'applique après le modèle, comme à l'ingestion : un mot d'aînés
   dans le titre ou le lieu vaut « non », sauf si le texte appelle aussi les familles. */
const resultats = entrees.map((entree, rang) => ({
  id: entree.id,
  titre: entree.title,
  verdict: reserveeAuxAines(events[rang]) ? "non" : verdicts[rang],
}));

await writeFile(fichierSortie, JSON.stringify(resultats, null, 2), "utf8");

const compte = (v: string) => resultats.filter((r) => r.verdict === v).length;
console.log(
  `${resultats.length} activités : ${compte("oui")} oui, ${compte("non")} non, ${compte("doute")} doute`,
);
