/**
 * Les vacances scolaires du canton de Genève, recopiées du calendrier officiel.
 *
 * Source : https://www.ge.ch/vacances-scolaires-jours-feries — pages 2026-2027, 2027-2028
 * et 2028-2029, relevées le 19 octobre 2026. Le canton publie ses dates des années à
 * l'avance et ne les change pas : une table écrite à la main est plus sûre qu'une source
 * lue à chaque passage, qui pourrait tomber en panne la veille des vacances.
 *
 * Elle s'épuise, en revanche. `vacances.test.ts` échoue quand il lui reste moins de six
 * mois devant elle : c'est le signal pour recopier l'année suivante, avant que l'écran des
 * réglages ne se vide en silence.
 *
 * Les jours sont des jours en clair (« 2026-10-19 »), sans heure ni fuseau : une semaine
 * de vacances commence un lundi à Genève, et nulle part ailleurs.
 */

import { decalerJour, jourDeSemaine } from "./heure";

export type CleVacances = "automne" | "noel" | "fevrier" | "paques" | "ete";

export type Vacances = {
  /** « automne-2026 » : stable, lisible dans une adresse ou un formulaire. */
  id: string;
  cle: CleVacances;
  /** Premier jour sans école, tel que le canton l'écrit. */
  debut: string;
  /** Dernier jour sans école. */
  fin: string;
};

function vacances(cle: CleVacances, debut: string, fin: string): Vacances {
  return { id: `${cle}-${debut.slice(0, 4)}`, cle, debut, fin };
}

export const VACANCES_GENEVE: readonly Vacances[] = [
  // 2026-2027 — rentrée le lundi 17 août 2026.
  vacances("automne", "2026-10-19", "2026-10-23"),
  vacances("noel", "2026-12-24", "2027-01-08"),
  vacances("fevrier", "2027-02-15", "2027-02-19"),
  vacances("paques", "2027-03-26", "2027-04-09"),
  vacances("ete", "2027-07-05", "2027-08-25"),
  // 2027-2028 — rentrée le jeudi 26 août 2027 (nouveau calendrier scolaire).
  vacances("automne", "2027-10-25", "2027-10-29"),
  vacances("noel", "2027-12-24", "2028-01-07"),
  vacances("fevrier", "2028-02-21", "2028-02-25"),
  vacances("paques", "2028-04-13", "2028-04-21"),
  vacances("ete", "2028-07-03", "2028-08-23"),
  // 2028-2029 — rentrée le jeudi 24 août 2028.
  vacances("automne", "2028-10-23", "2028-10-27"),
  vacances("noel", "2028-12-25", "2029-01-05"),
  vacances("fevrier", "2029-02-19", "2029-02-23"),
  vacances("paques", "2029-03-29", "2029-04-06"),
  vacances("ete", "2029-07-02", "2029-08-22"),
];

/**
 * Une semaine de vacances : la part d'une semaine du lundi au dimanche qui tombe dans
 * les vacances. Noël 2026 en compte trois — du jeudi 24 au dimanche 27, la semaine du
 * 28, puis du 4 au 8 janvier.
 */
export type SemaineVacances = {
  /** Le lundi de la semaine : c'est lui que la base enregistre. */
  lundi: string;
  /** Les jours sans école de cette semaine, tels qu'on les affiche : « 19–23 oct. ». */
  debut: string;
  fin: string;
  /**
   * Jusqu'où l'on est « en vacances » cette semaine-là, pour décider si une famille absente
   * l'est aujourd'hui : le week-end qui suit un vendredi de vacances en fait partie — on
   * ne rentre pas le vendredi soir — mais pas le jeudi d'une rentrée.
   */
  jusquAu: string;
};

/** Le lundi de la semaine d'un jour en clair. */
export function lundiDe(jour: string): string {
  return decalerJour(jour, 1 - jourDeSemaine(jour));
}

export function semainesDe(periode: Vacances): SemaineVacances[] {
  const semaines: SemaineVacances[] = [];
  for (let lundi = lundiDe(periode.debut); lundi <= periode.fin; lundi = decalerJour(lundi, 7)) {
    const dimanche = decalerJour(lundi, 6);
    const debut = periode.debut > lundi ? periode.debut : lundi;
    const fin = periode.fin < dimanche ? periode.fin : dimanche;
    const finAvecWeekEnd = jourDeSemaine(fin) === 5 ? decalerJour(fin, 2) : fin;
    semaines.push({ lundi, debut, fin, jusquAu: finAvecWeekEnd });
  }
  return semaines;
}

/** Les vacances qui ne sont pas finies et commencent d'ici `horizonJours`. */
export function vacancesAVenir(aujourdhui: string, horizonJours = 365): Vacances[] {
  const limite = decalerJour(aujourdhui, horizonJours);
  return VACANCES_GENEVE.filter((v) => finAvecWeekEnd(v) >= aujourdhui && v.debut <= limite);
}

/**
 * Les vacances dont on parle en ce moment : celles qu'on vit, sinon celles qui commencent
 * dans les trois semaines. Au-delà, l'écran principal n'a pas à en parler — les réglages,
 * eux, les montrent toutes.
 */
export function vacancesDuMoment(aujourdhui: string, avanceJours = 21): Vacances | null {
  return vacancesAVenir(aujourdhui, avanceJours)[0] ?? null;
}

/** La semaine de vacances qui commence ce lundi-là, et les vacances dont elle fait partie. */
export function semaineDeVacances(
  lundi: string,
): { vacances: Vacances; semaine: SemaineVacances } | null {
  for (const v of VACANCES_GENEVE) {
    const semaine = semainesDe(v).find((s) => s.lundi === lundi);
    if (semaine) return { vacances: v, semaine };
  }
  return null;
}

/** La semaine de vacances dans laquelle tombe ce jour, s'il en est une. */
export function semaineDuJour(jour: string): SemaineVacances | null {
  const trouvee = semaineDeVacances(lundiDe(jour));
  if (!trouvee) return null;
  const { semaine } = trouvee;
  return jour >= semaine.debut && jour <= semaine.jusquAu ? semaine : null;
}

function finAvecWeekEnd(v: Vacances): string {
  return jourDeSemaine(v.fin) === 5 ? decalerJour(v.fin, 2) : v.fin;
}
