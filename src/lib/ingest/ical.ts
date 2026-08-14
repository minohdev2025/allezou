/**
 * Adaptateur iCalendar (RFC 5545).
 *
 * Plusieurs communes genevoises tiennent leur agenda sous WordPress avec le greffon « The
 * Events Calendar », qui publie l'agenda complet en `.ics` derrière `?ical=1`. C'est la
 * meilleure source qui existe pour nous : des dates déjà datées, un fuseau déclaré, un
 * identifiant stable, et pas un mot à interpréter.
 *
 * Un agenda communal contient aussi les séances du Conseil municipal et les levées de
 * ferraille. Le greffon les range en catégories : `categoriesIgnorees` s'en sert pour ne
 * pas remplir un agenda de familles avec l'ordre du jour de la mairie.
 */

import { clamp, parseAgeRange, USER_AGENT, type Adapter, type RawEvent } from "./types";

/** Les feuilles genevoises ne déclarent pas toujours leur fuseau. Ici, c'est celui-là. */
const ZONE_PAR_DEFAUT = "Europe/Zurich";

type IcalConfig = {
  /** Catégories laissées de côté, comparées sans accents ni majuscules. */
  categoriesIgnorees?: string[];
};

type Propriete = { nom: string; params: Record<string, string>; valeur: string };

/**
 * Défait les retours à la ligne de continuation. Une ligne iCalendar dépasse rarement
 * 75 caractères : au-delà, elle repart à la ligne suivante précédée d'un blanc, et une
 * description coupée en trois morceaux ne se lit pas autrement.
 */
function delier(texte: string): string[] {
  return texte.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function lireLigne(ligne: string): Propriete | null {
  const separateur = ligne.indexOf(":");
  if (separateur < 0) return null;

  const [nom, ...morceaux] = ligne.slice(0, separateur).split(";");
  const params: Record<string, string> = {};
  for (const morceau of morceaux) {
    const egal = morceau.indexOf("=");
    if (egal > 0) {
      params[morceau.slice(0, egal).toUpperCase()] = morceau.slice(egal + 1).replace(/"/g, "");
    }
  }

  return {
    nom: nom.toUpperCase(),
    params,
    // Les virgules, points-virgules et retours à la ligne voyagent échappés.
    valeur: ligne
      .slice(separateur + 1)
      .replace(/\\n/gi, " ")
      .replace(/\\([,;\\])/g, "$1")
      .trim(),
  };
}

/** Décalage d'une zone par rapport à UTC, en millisecondes, à l'instant donné. */
function decalage(instant: number, zone: string): number {
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const lire = (type: string) => Number(parties.find((p) => p.type === type)?.value ?? "0");
  const mur = Date.UTC(
    lire("year"),
    lire("month") - 1,
    lire("day"),
    lire("hour") % 24,
    lire("minute"),
    lire("second"),
  );
  return mur - instant;
}

/**
 * Ramène une heure murale à l'instant qu'elle désigne dans une zone.
 *
 * Le décalage se mesure sur un instant, et l'instant est justement ce qu'on cherche : on
 * l'approche une première fois, puis on recommence avec le résultat. La seconde passe ne
 * sert qu'aux nuits de changement d'heure, où la première tombe une heure à côté.
 */
function depuisHeureMurale(mur: number, zone: string): number {
  const premiere = mur - decalage(mur, zone);
  return mur - decalage(premiere, zone);
}

function zoneValide(zone: string | undefined): string {
  if (!zone) return ZONE_PAR_DEFAUT;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return ZONE_PAR_DEFAUT;
  }
}

/**
 * Lit `20260903T110000`, `20260903T090000Z` et `20260912`.
 *
 * Sans `Z` ni `TZID`, la date est dite flottante : elle vaut à l'heure du lieu, et le lieu
 * ici est Genève.
 */
export function dateIcal(propriete: Propriete): Date | null {
  const brut = propriete.valeur.trim();

  const journee = brut.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (journee) {
    const mur = Date.UTC(Number(journee[1]), Number(journee[2]) - 1, Number(journee[3]));
    return new Date(depuisHeureMurale(mur, zoneValide(propriete.params.TZID)));
  }

  const horodate = brut.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!horodate) return null;

  const mur = Date.UTC(
    Number(horodate[1]),
    Number(horodate[2]) - 1,
    Number(horodate[3]),
    Number(horodate[4]),
    Number(horodate[5]),
    Number(horodate[6]),
  );

  if (horodate[7] === "Z") return new Date(mur);
  return new Date(depuisHeureMurale(mur, zoneValide(propriete.params.TZID)));
}

function sansAccent(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Le nom du lieu, et rien de plus.
 *
 * `LOCATION` porte l'adresse postale complète (« La Bessonnette, Chemin de la Bessonnette 8,
 * Chêne-Bougeries, Genève, 1224, Switzerland »), qui prend trois lignes sur un téléphone.
 * Comme pour le JSON-LD, on garde la tête : c'est le nom qu'un parent genevois reconnaît.
 */
function lieu(valeur: string | undefined): string | undefined {
  if (!valeur) return undefined;
  return clamp(valeur.split(",")[0], 120);
}

/** Extrait les activités d'une feuille iCalendar. Fonction pure : les tests la verrouillent. */
export function eventsFromIcs(
  texte: string,
  sourceUrl: string,
  categoriesIgnorees: string[] = [],
): RawEvent[] {
  const ignorees = new Set(categoriesIgnorees.map(sansAccent));
  const events: RawEvent[] = [];

  let courant: Propriete[] | null = null;

  for (const ligne of delier(texte)) {
    if (ligne.startsWith("BEGIN:VEVENT")) {
      courant = [];
      continue;
    }
    if (!courant) continue;

    if (ligne.startsWith("END:VEVENT")) {
      const event = versRawEvent(courant, sourceUrl, ignorees);
      if (event) events.push(event);
      courant = null;
      continue;
    }

    const propriete = lireLigne(ligne);
    if (propriete) courant.push(propriete);
  }

  return events;
}

function versRawEvent(
  proprietes: Propriete[],
  sourceUrl: string,
  ignorees: Set<string>,
): RawEvent | null {
  const trouver = (nom: string) => proprietes.find((p) => p.nom === nom);
  const valeur = (nom: string) => trouver(nom)?.valeur || undefined;

  const titre = valeur("SUMMARY");
  const debut = trouver("DTSTART");
  if (!titre || !debut) return null;

  const startsAt = dateIcal(debut);
  if (!startsAt) return null;

  const categories = (valeur("CATEGORIES") ?? "")
    .split(",")
    .map(sansAccent)
    .filter(Boolean);
  if (categories.some((categorie) => ignorees.has(categorie))) return null;

  const fin = trouver("DTEND");
  const endsAt = fin ? dateIcal(fin) : null;
  const description = valeur("DESCRIPTION");

  return {
    // L'UID est fait pour ça : il ne bouge pas quand la commune corrige une faute de frappe.
    externalId: clamp(valeur("UID") ?? `${titre}|${startsAt.toISOString()}`, 200)!,
    title: clamp(titre, 120)!,
    description: clamp(description, 280),
    startsAt,
    endsAt: endsAt && endsAt >= startsAt ? endsAt : undefined,
    placeLabel: lieu(valeur("LOCATION")),
    url: clamp(valeur("URL") ?? sourceUrl, 500),
    ...parseAgeRange(description),
  };
}

export const icalAdapter: Adapter = async (source) => {
  const config = (source.config ?? {}) as IcalConfig;

  const reponse = await fetch(source.url, { headers: { "User-Agent": USER_AGENT } });
  if (!reponse.ok) throw new Error(`${source.url} : HTTP ${reponse.status}`);

  return eventsFromIcs(await reponse.text(), source.url, config.categoriesIgnorees ?? []);
};
