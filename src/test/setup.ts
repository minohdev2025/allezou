/**
 * Exécuté dans chaque worker de test avant l'import des modules applicatifs.
 * Redirige DATABASE_URL vers la base de test : aucun test ne peut toucher la base de dev.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL manquant — copier .env.example vers .env.local");
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
