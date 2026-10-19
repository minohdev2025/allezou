/**
 * La version de la page /donnees, et qui ne l'a pas encore lue.
 *
 * DONNEES.md promet : « Toute modification vous sera annoncée dans l'application avant de
 * prendre effet. » Ce fichier est ce qui rend cette phrase vraie. Changer la page, c'est
 * changer `VERSION_DONNEES` (sa date de mise à jour) et le libellé `AnnonceDonnees.ceQuiChange`
 * des cinq catalogues : chaque compte qui n'a pas lu cette version voit alors l'annonce sur
 * /maintenant jusqu'à ce qu'il touche « J'ai lu ». Un test lie cette date à la dernière ligne
 * de DONNEES.md, pour qu'on ne change pas l'une sans l'autre.
 */

import { eq } from "drizzle-orm";

import { db } from "./db";
import * as s from "./db/schema";

/** Date de la dernière mise à jour de /donnees, au format AAAA-MM-JJ. */
export const VERSION_DONNEES = "2026-10-19";

/**
 * Faut-il annoncer la page à ce compte ? Les dates AAAA-MM-JJ se comparent comme des
 * chaînes ; une version lue plus récente que le code (retour en arrière d'un déploiement)
 * ne réveille pas une annonce déjà lue.
 */
export function donneesAAnnoncer(lue: string | null): boolean {
  return (lue ?? "") < VERSION_DONNEES;
}

export async function marquerDonneesLues(accountId: string): Promise<void> {
  await db
    .update(s.account)
    .set({ donneesLues: VERSION_DONNEES })
    .where(eq(s.account.id, accountId));
}
