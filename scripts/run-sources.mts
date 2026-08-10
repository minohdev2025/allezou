/**
 * Passage de toutes les sources actives, puis état de santé.
 *
 *   npm run sources:run
 *
 * À brancher sur une tâche planifiée. Le rapport affiche ce qui a été trouvé, créé, mis à
 * jour, et surtout ce qui a échoué — une source muette doit se voir.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const { runAllSources, sourceHealth, pendingReview } = await import(
  "../src/lib/ingest/run.ts"
);

const rapports = await runAllSources();

for (const r of rapports) {
  const etat = r.ok ? "ok    " : "ÉCHEC ";
  console.log(
    `${etat} ${r.sourceName} — trouvés ${r.found}, créés ${r.created}, mis à jour ${r.updated}` +
      (r.error ? `\n       ${r.error}` : ""),
  );
}

console.log("\nSanté des sources :");
for (const s of await sourceHealth()) {
  const age =
    s.joursSansContenu === null
      ? "n'a jamais rien rapporté"
      : `dernier apport il y a ${s.joursSansContenu} j (${s.lastEventCount} activités)`;
  console.log(`  ${s.muette ? "!" : " "} ${s.name} — ${age}${s.lastError ? ` — ${s.lastError}` : ""}`);
}

const attente = await pendingReview();
console.log(`\nEn attente de relecture : ${attente.length}`);
for (const e of attente.slice(0, 10)) {
  console.log(`  ${e.startsAt.toISOString().slice(0, 16)} — ${e.title} (${e.sourceName})`);
}

process.exit(0);
