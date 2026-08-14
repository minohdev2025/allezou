/**
 * Applique les migrations en production, sans drizzle-kit.
 *
 *   node scripts/migrer.mjs
 *
 * `drizzle-kit` est un outil de développement : le garder dans l'image d'exécution y faisait
 * entrer toute la chaîne de construction, et les avertissements qui vont avec. Le migrateur
 * de `drizzle-orm` fait le même travail, lit le même dossier `drizzle/` et le même journal,
 * et c'est une dépendance de production.
 *
 * Volontairement en JavaScript et non en TypeScript : il tourne dans une image où il n'y a
 * plus ni `tsx` ni `typescript`.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant : impossible d'appliquer les migrations.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("migrations appliquées");
} catch (erreur) {
  console.error("migrations en échec :", erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
} finally {
  await sql.end();
}
