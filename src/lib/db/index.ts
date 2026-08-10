import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL manquant — copier .env.example vers .env.local");
  }
  return url;
}

// En développement, Next recharge les modules à chaque édition : sans ce cache on ouvrirait
// une nouvelle réserve de connexions à chaque fois.
const globalForDb = globalThis as unknown as {
  totirSql?: ReturnType<typeof postgres>;
};

export const sql = globalForDb.totirSql ?? postgres(connectionString(), { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.totirSql = sql;
}

export const db = drizzle(sql, { schema, casing: "snake_case" });

export type Db = typeof db;

/**
 * La base, ou une transaction en cours. Les fonctions qui doivent pouvoir s'exécuter
 * dans une transaction acceptent ce type plutôt que `Db`.
 */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export { schema };
