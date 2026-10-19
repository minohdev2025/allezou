/**
 * Les disponibilités : ce qu'une famille dit de ses habitudes et de ses vacances, à
 * quelques personnes choisies.
 *
 * Deux formes, comme l'a demandé le premier parent qui les a voulues :
 * - régulière : « le mercredi, de 16h à 20h » ;
 * - vacances scolaires : semaine par semaine, présent ou absent.
 *
 * Ce module écrit et relit ce qui appartient à la personne elle-même. Ce que les autres
 * voient passe par `visibleDisponibilites` (visibility.ts), et nulle part ailleurs.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "./db";
import * as s from "./db/schema";
import { jourDeSemaine, minutesDeLHeure } from "./heure";
import { jourGenevois } from "./ingest/types";
import {
  VACANCES_GENEVE,
  semaineDeVacances,
  semaineDuJour,
  semainesDe,
  type SemaineVacances,
  type Vacances,
} from "./vacances";
import { lecteursPossibles, type DisponibilitesVisibles } from "./visibility";

/** Deux par jour de la semaine : au-delà, ce n'est plus une habitude, c'est un agenda. */
export const CRENEAUX_MAX = 14;

/** Une habitude d'un quart d'heure n'en est pas une : même plancher que les sorties. */
export const CRENEAU_MIN_MINUTES = 15;

export type Statut = "present" | "absent";

export type DisponibiliteErreur =
  | "creneau_invalide"
  | "creneaux_max"
  | "semaine_inconnue"
  | "vacances_inconnues"
  | "lecteur_interdit";

type Result<T> = { ok: true; value: T } | { ok: false; reason: DisponibiliteErreur };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const ko = <T>(reason: DisponibiliteErreur): Result<T> => ({ ok: false, reason });

/* ------------------------------------------------------------------ écriture */

/**
 * Ajoute une habitude. « À 00:00 » se lit minuit le soir même — un créneau du mardi qui
 * finit à minuit est un créneau du mardi, pas du mercredi.
 */
export async function ajouterCreneau(
  actorId: string,
  saisie: { jour: string; de: string; a: string },
): Promise<Result<void>> {
  const jour = Number(saisie.jour);
  const debut = minutesDeLHeure(saisie.de);
  const finLue = minutesDeLHeure(saisie.a);
  const fin = finLue === 0 ? 1440 : finLue;

  if (
    !Number.isInteger(jour) ||
    jour < 1 ||
    jour > 7 ||
    debut === null ||
    fin === null ||
    fin - debut < CRENEAU_MIN_MINUTES
  ) {
    return ko("creneau_invalide");
  }

  const existants = await db
    .select({ jour: s.disponibiliteHebdo.jour, debut: s.disponibiliteHebdo.debut, fin: s.disponibiliteHebdo.fin })
    .from(s.disponibiliteHebdo)
    .where(eq(s.disponibiliteHebdo.accountId, actorId));

  // Le même créneau saisi deux fois — un double toucher — ne fait qu'une ligne.
  if (existants.some((c) => c.jour === jour && c.debut === debut && c.fin === fin)) {
    return ok(undefined);
  }
  if (existants.length >= CRENEAUX_MAX) return ko("creneaux_max");

  await db.insert(s.disponibiliteHebdo).values({ accountId: actorId, jour, debut, fin });
  return ok(undefined);
}

export async function retirerCreneau(actorId: string, creneauId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(creneauId)) return;
  await db
    .delete(s.disponibiliteHebdo)
    .where(and(eq(s.disponibiliteHebdo.id, creneauId), eq(s.disponibiliteHebdo.accountId, actorId)));
}

/**
 * Présent, absent, ou rien du tout pour une semaine de vacances. On ne renseigne que les
 * semaines du calendrier officiel qui ne sont pas encore finies : écrire sur le passé
 * ne servirait à personne, et fabriquerait l'historique que la maintenance efface.
 */
export async function reglerSemaine(
  actorId: string,
  lundi: string,
  statut: Statut | null,
  aujourdhui = jourGenevois(new Date()),
): Promise<Result<void>> {
  const trouvee = semaineDeVacances(lundi);
  if (!trouvee || trouvee.semaine.jusquAu < aujourdhui) return ko("semaine_inconnue");
  await ecrireSemaines(actorId, [trouvee.semaine.lundi], statut);
  return ok(undefined);
}

/** Toutes les semaines restantes d'une période d'un geste : « absents tout l'été ». */
export async function reglerVacances(
  actorId: string,
  vacancesId: string,
  statut: Statut | null,
  aujourdhui = jourGenevois(new Date()),
): Promise<Result<void>> {
  const periode = VACANCES_GENEVE.find((v) => v.id === vacancesId);
  if (!periode) return ko("vacances_inconnues");
  const lundis = semainesDe(periode)
    .filter((semaine) => semaine.jusquAu >= aujourdhui)
    .map((semaine) => semaine.lundi);
  if (lundis.length === 0) return ko("vacances_inconnues");
  await ecrireSemaines(actorId, lundis, statut);
  return ok(undefined);
}

async function ecrireSemaines(actorId: string, lundis: string[], statut: Statut | null) {
  if (statut === null) {
    await db
      .delete(s.disponibiliteVacances)
      .where(
        and(
          eq(s.disponibiliteVacances.accountId, actorId),
          inArray(s.disponibiliteVacances.semaine, lundis),
        ),
      );
    return;
  }
  await db
    .insert(s.disponibiliteVacances)
    .values(lundis.map((semaine) => ({ accountId: actorId, semaine, statut })))
    .onConflictDoUpdate({
      target: [s.disponibiliteVacances.accountId, s.disponibiliteVacances.semaine],
      set: { statut },
    });
}

/**
 * Qui voit mes disponibilités : la liste remplace la précédente, elle ne s'y ajoute pas —
 * sans quoi décocher quelqu'un ne retirerait rien.
 *
 * On ne nomme que des personnes de ses cercles, avec qui le lien n'est pas coupé : la
 * règle de visibilité l'exige déjà à la lecture, ce filtre est la seconde barrière, à
 * l'écriture, comme pour les cercles destinataires d'une sortie.
 */
export async function reglerLecteurs(
  actorId: string,
  lecteurIds: string[],
): Promise<Result<{ lecteurs: number }>> {
  const voulus = [...new Set(lecteurIds)].filter((id) => id !== actorId);
  const permis = new Set(
    (await lecteursPossibles(actorId)).flatMap((c) => c.membres.map((m) => m.accountId)),
  );
  if (voulus.some((id) => !permis.has(id))) return ko("lecteur_interdit");

  await db.transaction(async (tx) => {
    await tx.delete(s.disponibiliteLecteur).where(eq(s.disponibiliteLecteur.accountId, actorId));
    if (voulus.length > 0) {
      await tx
        .insert(s.disponibiliteLecteur)
        .values(voulus.map((lecteurId) => ({ accountId: actorId, lecteurId })));
    }
  });
  return ok({ lecteurs: voulus.length });
}

/* ------------------------------------------------------------------ relecture */

export type MesDisponibilites = {
  creneaux: { id: string; jour: number; debut: number; fin: number }[];
  /** Le statut de chaque semaine renseignée, par son lundi. */
  semaines: Record<string, Statut>;
  lecteurs: string[];
};

/** Ce que j'ai dit, pour l'écran où je le règle. */
export async function mesDisponibilites(actorId: string): Promise<MesDisponibilites> {
  const [creneaux, semaines, lecteurs] = await Promise.all([
    db
      .select({
        id: s.disponibiliteHebdo.id,
        jour: s.disponibiliteHebdo.jour,
        debut: s.disponibiliteHebdo.debut,
        fin: s.disponibiliteHebdo.fin,
      })
      .from(s.disponibiliteHebdo)
      .where(eq(s.disponibiliteHebdo.accountId, actorId))
      .orderBy(asc(s.disponibiliteHebdo.jour), asc(s.disponibiliteHebdo.debut)),
    db
      .select({ semaine: s.disponibiliteVacances.semaine, statut: s.disponibiliteVacances.statut })
      .from(s.disponibiliteVacances)
      .where(eq(s.disponibiliteVacances.accountId, actorId)),
    db
      .select({ lecteurId: s.disponibiliteLecteur.lecteurId })
      .from(s.disponibiliteLecteur)
      .where(eq(s.disponibiliteLecteur.accountId, actorId)),
  ]);

  return {
    creneaux,
    semaines: Object.fromEntries(semaines.map((r) => [r.semaine, r.statut])),
    lecteurs: lecteurs.map((r) => r.lecteurId),
  };
}

/* ------------------------------------------------------------------ maintenance */

/**
 * Efface les semaines de vacances passées. Dire qu'on était absent la semaine dernière
 * n'informe plus personne, et une suite de semaines « absent » raconterait les voyages
 * d'une famille. Les habitudes, elles, restent : elles valent pour la suite.
 */
export async function purgerSemainesPassees(): Promise<number> {
  const rows = await db.execute<{ semaine: string }>(sql`
    delete from disponibilite_vacances
    where semaine + 6 < (now() at time zone 'Europe/Zurich')::date
    returning semaine
  `);
  return rows.length;
}

/* ------------------------------------------------------------------ résumés */

/**
 * Les habitudes qui valent aujourd'hui et ne sont pas encore finies — sauf si la personne
 * a dit être absente cette semaine de vacances : « le mercredi de 16h à 20h » ne tient
 * pas quand on est à la mer.
 */
export function creneauxDuJour(
  dispo: Pick<DisponibilitesVisibles, "creneaux" | "semaines">,
  aujourdhui: string,
  minutesMaintenant: number,
): { debut: number; fin: number }[] {
  const semaine = semaineDuJour(aujourdhui);
  if (semaine && dispo.semaines.some((s) => s.lundi === semaine.lundi && s.statut === "absent")) {
    return [];
  }
  const jour = jourDeSemaine(aujourdhui);
  return dispo.creneaux
    .filter((c) => c.jour === jour && c.fin > minutesMaintenant)
    .map((c) => ({ debut: c.debut, fin: c.fin }));
}

/** Une suite de semaines au même statut : « absents du 5 au 18 juillet ». */
export type Etendue = { debut: string; fin: string; statut: Statut };

/**
 * Ce qu'une personne a dit d'une période de vacances, semaines voisines fusionnées. Les
 * semaines passées et celles qu'elle n'a pas renseignées ne s'affichent pas : on ne
 * prête pas un « présent » à qui n'a rien dit.
 *
 * `complete` dit si toute la période restante tient en une seule étendue — l'écran
 * écrit alors « Vacances d'automne : absent » sans répéter les dates.
 */
export function etenduesPendant(
  semainesRenseignees: { lundi: string; statut: Statut }[],
  periode: Vacances,
  aujourdhui: string,
): { etendues: Etendue[]; complete: boolean } {
  const statuts = new Map(semainesRenseignees.map((s) => [s.lundi, s.statut]));
  const restantes = semainesDe(periode).filter((s: SemaineVacances) => s.jusquAu >= aujourdhui);

  const etendues: Etendue[] = [];
  let precedente: SemaineVacances | null = null;
  for (const semaine of restantes) {
    const statut = statuts.get(semaine.lundi);
    const derniere = etendues.at(-1);
    if (statut && derniere && derniere.statut === statut && precedente && statuts.get(precedente.lundi) === statut) {
      derniere.fin = semaine.fin;
    } else if (statut) {
      etendues.push({ debut: semaine.debut, fin: semaine.fin, statut });
    }
    precedente = semaine;
  }

  const complete =
    etendues.length === 1 && restantes.every((semaine) => statuts.has(semaine.lundi));
  return { etendues, complete };
}
