/**
 * Prépare la base de test une fois pour toutes : schéma détruit, recréé, migrations appliquées.
 * La base de test est distincte de la base de développement (TEST_DATABASE_URL).
 */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local" });

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL manquant — copier .env.example vers .env.local");
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL ne doit pas pointer sur la base de développement");
  }

  const sql = postgres(url, { max: 1 });
  try {
    await sql`drop schema if exists public cascade`;
    // Le journal des migrations vit dans son propre schéma : sans ça, drizzle croirait
    // la migration déjà appliquée et ne recréerait aucune table.
    await sql`drop schema if exists drizzle cascade`;
    await sql`create schema public`;
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  } finally {
    await sql.end();
  }
}
