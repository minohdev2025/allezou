/**
 * Les quelques nombres qui disent si Allezou sert à quelque chose.
 *
 * Trois, et sur les familles seulement. Tout ce qui est compté existe déjà en base pour une
 * autre raison — un compte, un enfant déclaré — et rien n'est collecté pour la mesure. C'est
 * la condition pour que DONNEES.md reste vraie sans qu'on y touche.
 *
 * Ce qui n'y est pas, et pourquoi :
 *
 * - **Les familles actives.** Elles se liraient dans `account.last_seen_at`, qui existe en
 *   base mais n'est pas déclarée dans DONNEES.md. Tant que la page ne l'annonce pas, ce
 *   nombre ne s'affiche pas : la page et le code changent ensemble, ou ils ne changent pas.
 * - **Le total des sorties.** Une sortie est effacée vingt-quatre heures après sa fin, y
 *   compris pour le responsable. « Depuis le début » n'existe nulle part, et un compteur qui
 *   le reconstituerait serait une décision, pas un détail d'affichage.
 * - **Les cercles, un par un.** La page données promet qu'on n'apprend pas qui est dans quel
 *   cercle. Un écran d'administration qui les listerait tous ferait exception à une phrase
 *   écrite pour des parents, et rien n'oblige à cette exception.
 */

import { sql } from "drizzle-orm";

import { db } from "./db";

export type Mesures = {
  /** Comptes non supprimés. */
  comptes: number;
  /** Arrivés dans les sept derniers jours. */
  comptesNouveaux7j: number;
  /** Ceux qui ont fini d'arriver : au moins un enfant déclaré. */
  comptesAvecEnfant: number;
};

export async function mesures(): Promise<Mesures> {
  const [familles] = await db.execute<{
    comptes: number;
    nouveaux: number;
    avec_enfant: number;
  }>(sql`
    select
      count(*)::int as comptes,
      count(*) filter (where a.created_at > now() - interval '7 days')::int as nouveaux,
      count(*) filter (
        where exists (
          select 1 from child_parent cp
          join child c on c.id = cp.child_id and c.deleted_at is null
          where cp.account_id = a.id
        )
      )::int as avec_enfant
    from account a
    where a.deleted_at is null
  `);

  return {
    comptes: familles.comptes,
    comptesNouveaux7j: familles.nouveaux,
    comptesAvecEnfant: familles.avec_enfant,
  };
}
