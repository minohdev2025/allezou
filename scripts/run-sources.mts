/**
 * Passage de toutes les sources actives, puis état de santé.
 *
 *   npm run sources:run
 *
 * À brancher sur une tâche planifiée. Le rapport affiche ce qui a été trouvé, créé, mis à
 * jour, et surtout ce qui a échoué — une source muette doit se voir.
 *
 * « publiées » et « en file » se lisent ensemble : c'est le rapport entre les deux qui dit
 * si les contrôles font leur travail ou s'ils retiennent tout.
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
    `${etat} ${r.sourceName} — trouvés ${r.found}, créés ${r.created}, ` +
      `mis à jour ${r.updated}, publiées ${r.published}, en file ${r.held}` +
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
  const motifs = e.controles.map((c) => c.code).join(", ") || "envoi manuel";
  console.log(`  ${e.startsAt.toISOString().slice(0, 16)} — ${e.title} (${e.sourceName})`);
  console.log(`      ${motifs}`);
}

process.exit(0);
