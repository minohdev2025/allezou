/**
 * Lecture d'une heure saisie à l'écran.
 *
 * Un champ `datetime-local` renvoie une heure murale sans fuseau (« 2026-08-15T15:00 »).
 * L'interpréter avec `new Date(...)` la rattacherait au fuseau du **serveur** : une sortie
 * annoncée pour 15 h à Genève tomberait à 13 h si le serveur était en UTC. On l'interprète
 * donc explicitement à l'heure de Genève, quel que soit l'endroit où tourne l'application.
 */

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
