/**
 * Effacement automatique quotidien.
 *
 *   npm run maintenance
 *
 * À brancher sur une tâche planifiée. Ce qui est effacé ici est exactement ce que la page
 * d'information promet aux parents.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const { purgeAll } = await import("../src/lib/maintenance.ts");

const rapport = await purgeAll();

console.log("Effacements :");
for (const [quoi, combien] of Object.entries(rapport)) {
  console.log(`  ${combien.toString().padStart(5)} ${quoi}`);
}

process.exit(0);
