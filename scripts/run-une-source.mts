/**
 * Passage d'une seule source, désignée par un morceau de son nom.
 *
 *   npx tsx scripts/run-une-source.mts onex
 *
 * C'est l'outil du tour d'essai : une source qu'on vient de brancher se regarde seule,
 * sans payer le passage des dix-huit autres ni attendre le planificateur. Le rapport
 * détaille ce qui est entré, et la file de relecture ce qui attend, avec ses motifs.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const { eq } = await import("drizzle-orm");
const { db } = await import("../src/lib/db/index.ts");
const s = await import("../src/lib/db/schema.ts");
const { runSource, pendingReview } = await import("../src/lib/ingest/run.ts");

const motif = (process.argv[2] ?? "").toLowerCase();
if (!motif) {
  console.error("Usage : npx tsx scripts/run-une-source.mts <morceau du nom>");
  process.exit(1);
}

const sources = await db
  .select({ id: s.source.id, name: s.source.name })
  .from(s.source)
  .where(eq(s.source.active, true));

const cibles = sources.filter((source) => source.name.toLowerCase().includes(motif));
if (cibles.length === 0) {
  console.error(`Aucune source active ne contient « ${motif} ». Sources connues :`);
  for (const source of sources) console.error(`  - ${source.name}`);
  process.exit(1);
}

for (const cible of cibles) {
  console.log(`--- ${cible.name}`);
  const debut = Date.now();
  const r = await runSource(cible.id);
  const duree = Math.round((Date.now() - debut) / 1000);
  console.log(
    `${r.ok ? "ok" : "ÉCHEC"} en ${duree}s — trouvés ${r.found}, créés ${r.created}, ` +
      `mis à jour ${r.updated}, publiées ${r.published}, en file ${r.held}, retirées ${r.withdrawn}` +
      (r.error ? `\n${r.error}` : ""),
  );
}

const attente = await pendingReview(30);
console.log(`\nEn attente de relecture : ${attente.length}`);
for (const e of attente) {
  const motifs = e.controles.map((c) => c.code).join(", ") || "envoi manuel";
  console.log(`  ${e.startsAt.toISOString().slice(0, 16)} — ${e.title} (${e.sourceName})`);
  console.log(`      ${motifs} — ${e.url ?? "sans lien"}`);
}

process.exit(0);
