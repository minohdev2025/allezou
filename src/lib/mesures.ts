/**
 * Le nombre de comptes ouverts.
 *
 * Un seul nombre, et il existe déjà en base : rien n'est collecté pour le connaître, et
 * DONNEES.md reste vraie sans qu'on y touche. Un écran de mesure grossit tout seul si on le
 * laisse faire, et ce qui s'y ajoute finit par regarder quelqu'un plutôt que compter.
 */

import { sql } from "drizzle-orm";

import { db } from "./db";

export async function comptesOuverts(): Promise<number> {
  const [ligne] = await db.execute<{ comptes: number }>(sql`
    select count(*)::int as comptes from account where deleted_at is null
  `);

  return ligne.comptes;
}
