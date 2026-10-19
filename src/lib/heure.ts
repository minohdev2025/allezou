/**
 * Lecture d'une heure saisie à l'écran.
 *
 * Un champ `datetime-local` renvoie une heure murale sans fuseau (« 2026-08-15T15:00 »).
 * L'interpréter avec `new Date(...)` la rattacherait au fuseau du **serveur** : une sortie
 * annoncée pour 15 h à Genève tomberait à 13 h si le serveur était en UTC. On l'interprète
 * donc explicitement à l'heure de Genève, quel que soit l'endroit où tourne l'application.
 */

import { jourGenevois } from "./ingest/types";

const ZONE = "Europe/Zurich";

/** Décalage de Genève, en millisecondes, à un instant donné (gère l'heure d'été). */
function decalage(instant: Date): number {
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const lire = (type: string) => Number(parties.find((p) => p.type === type)?.value ?? 0);
  const commeSiUtc = Date.UTC(
    lire("year"),
    lire("month") - 1,
    lire("day"),
    lire("hour") % 24,
    lire("minute"),
    lire("second"),
  );

  return commeSiUtc - instant.getTime();
}

/** « 2026-08-15T15:00 » lu comme 15 h à Genève. Null si la saisie est vide ou mal formée. */
export function heureDeGeneve(valeur: string | null | undefined): Date | null {
  if (!valeur || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valeur)) return null;

  const naif = new Date(`${valeur}:00Z`);
  if (Number.isNaN(naif.getTime())) return null;

  // Deux passes : la première approche le bon instant, la seconde corrige le cas où
  // l'approximation tombait de l'autre côté d'un changement d'heure.
  const approche = new Date(naif.getTime() - decalage(naif));
  return new Date(naif.getTime() - decalage(approche));
}

/**
 * Une heure de fin saisie seule (« 18:30 ») devient une durée en minutes.
 *
 * Le jour est celui du départ annoncé, sinon celui d'aujourd'hui à Genève. Passer
 * minuit n'est pas interprété comme « le lendemain » : la durée devient négative et
 * le serveur la refuse — une sortie s'annonce pour la journée, pas à cheval.
 *
 * Null si la saisie est vide ou illisible : l'appelant retombe alors sur la durée
 * choisie par ailleurs, comme une heure de début illisible retombe sur « maintenant ».
 */
export function minutesJusquAHeurePrecise(
  finSaisie: string | null | undefined,
  debut: Date | null,
  maintenant: Date,
): number | null {
  if (!finSaisie || !/^\d{2}:\d{2}$/.test(finSaisie)) return null;

  const jour = jourGenevois(debut ?? maintenant);
  const fin = heureDeGeneve(`${jour}T${finSaisie}`);
  if (!fin) return null;

  const reference = debut ?? maintenant;
  return Math.round((fin.getTime() - reference.getTime()) / 60_000);
}

/**
 * Le jour qui suit, en clair : « 2026-10-31 » → « 2026-11-01 ».
 *
 * Calculé sur le calendrier et non en ajoutant vingt-quatre heures à un instant : le jour
 * du changement d'heure en compte vingt-trois ou vingt-cinq, et l'on tomberait à côté.
 */
export function jourSuivant(jour: string): string {
  return decalerJour(jour, 1);
}

/** Un jour en clair, déplacé de `n` jours sur le calendrier (négatif pour reculer). */
export function decalerJour(jour: string, n: number): string {
  const [annee, mois, quantieme] = jour.split("-").map(Number);
  return new Date(Date.UTC(annee, mois - 1, quantieme + n)).toISOString().slice(0, 10);
}

/** Minuit à Genève, au début de ce jour. Null si le jour est mal formé. */
export function minuitDeGeneve(jour: string): Date | null {
  return heureDeGeneve(`${jour}T00:00`);
}

/** Le jour de la semaine d'un jour en clair, à la norme ISO : 1 pour lundi, 7 pour dimanche. */
export function jourDeSemaine(jour: string): number {
  const dimancheZero = new Date(`${jour}T00:00:00Z`).getUTCDay();
  return dimancheZero === 0 ? 7 : dimancheZero;
}

/**
 * « 16:00 » → 960 minutes depuis minuit. Null si la saisie n'est pas une heure de la
 * journée : « 24:00 » ou « 7:5 » ne passent pas, plutôt que de déborder en silence sur
 * le lendemain.
 */
export function minutesDeLHeure(saisie: string | null | undefined): number | null {
  const lu = /^(\d{2}):(\d{2})$/.exec(saisie ?? "");
  if (!lu) return null;
  const heures = Number(lu[1]);
  const minutes = Number(lu[2]);
  if (heures > 23 || minutes > 59) return null;
  return heures * 60 + minutes;
}

/** L'inverse : 960 → « 16:00 », et 1440 → « 24:00 » pour une fin à minuit. */
export function heureDesMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** L'heure qu'il est à Genève, en minutes depuis minuit. */
export function minutesGenevoises(instant: Date): number {
  const parties = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const lire = (type: string) => Number(parties.find((p) => p.type === type)?.value ?? 0);
  return (lire("hour") % 24) * 60 + lire("minute");
}
