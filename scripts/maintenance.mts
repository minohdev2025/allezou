/**
 * Exécution manuelle des tâches planifiées.
 *
 *   npm run maintenance          les tâches dues
 *   npm run maintenance -- tout  toutes, sans attendre leur tour
 *
 * En marche normale, le serveur les lance lui-même (voir src/lib/scheduler.ts). Ce script
 * sert à les déclencher à la main : au premier démarrage, après un incident, ou pour voir
 * ce qu'elles font.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const { tick, jobStatus } = await import("../src/lib/scheduler.ts");

const force = process.argv[2] === "tout";
const faites = await tick(force);

console.log(faites.length > 0 ? `Exécutées : ${faites.join(", ")}` : "Aucune tâche due.");
console.log("");

for (const job of await jobStatus()) {
  const quand = job.lastOkAt
    ? job.lastOkAt.toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })
    : "jamais";
  console.log(`${job.enRetard ? "⚠ " : "  "}${job.libelle.padEnd(32)} ${quand}`);
  if (job.lastError) console.log(`   dernière erreur : ${job.lastError}`);
}

process.exit(0);
