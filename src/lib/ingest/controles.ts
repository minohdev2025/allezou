/**
 * Les contrôles qui remplacent la relecture humaine.
 *
 * Une lecture par le modèle peut se tromper de trois façons : recopier de travers, résumer
 * au lieu de citer, ou inventer. Un œil humain attrapait les trois en ouvrant la page
 * d'origine à côté. Ces contrôles font le même geste, activité par activité : ils relisent
 * la page et vérifient que chaque valeur annoncée s'y trouve vraiment.
 *
 * Ce qui échoue n'est pas jeté, il retombe dans la file de relecture. La file existe donc
 * toujours, mais elle ne reçoit plus que ce qui résiste, au lieu de tout.
 *
 * Les sources structurées (JSON-LD, iCal) ne passent pas les contrôles de fidélité : rien
 * n'y est interprété, il n'y a donc rien à confronter. Elles gardent ceux qui ne dépendent
 * pas du texte de la page : domaine, durée, doublon, titre de rubrique.
 */

import { contient, normaliser } from "../texte";
import type { RawEvent, Source } from "./types";

export type CodeControle =
  | "date_absente"
  | "heure_absente"
  | "titre_reformule"
  | "titre_generique"
  | "lieu_absent"
  | "age_absent"
  | "description_inventee"
  | "url_hors_domaine"
  | "duree_invraisemblable"
  | "doublon";

/** Un contrôle qui n'est pas passé, écrit pour être lu sur l'écran de relecture. */
export type Echec = { code: CodeControle; detail: string };

const MOIS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];

/** Au-delà, ce n'est plus une activité mais une rubrique laissée ouverte par erreur. */
const DUREE_MAX_JOURS = 366;

/**
 * Titres qu'on retrouve sur toutes les pages d'agenda et qui ne désignent aucune activité.
 * Le modèle les remonte quand la page ne contient rien d'autre à remonter.
 */
const TITRES_DE_RUBRIQUE = new Set([
  "agenda",
  "agenda communal",
  "evenements",
  "evenement",
  "manifestations",
  "manifestation",
  "animations",
  "actualites",
  "actualite",
  "sortir",
  "loisirs",
  "culture",
  "accueil",
  "newsletter",
  "toutes les activites",
  "prochainement",
  "a venir",
]);

/** Mots trop courants pour dire quoi que ce soit de la fidélité d'un champ. */
const MOTS_VIDES = new Set([
  "ans",
  "aussi",
  "aux",
  "avec",
  "cette",
  "chez",
  "dans",
  "des",
  "elle",
  "entre",
  "les",
  "leur",
  "leurs",
  "nous",
  "notre",
  "plus",
  "pour",
  "sans",
  "sous",
  "tous",
  "tout",
  "toute",
  "toutes",
  "une",
  "votre",
  "vous",
]);

/**
 * Part des mots significatifs d'un extrait qu'on retrouve dans la page.
 *
 * Sert là où exiger la citation exacte serait faux : une page écrit le lieu sur deux
 * lignes, le modèle le rend sur une seule. Ce qui compte est qu'aucun mot ne sorte de
 * nulle part.
 */
export function couverture(extrait: string, page: string): number {
  const mots = [...new Set(normaliser(extrait).split(" "))].filter(
    (mot) => mot.length >= 3 && !MOTS_VIDES.has(mot),
  );
  if (mots.length === 0) return 1;

  return mots.filter((mot) => contient(page, mot)).length / mots.length;
}

type PartiesDeDate = {
  jour: number;
  mois: number;
  annee: number;
  heure: number;
  minute: number;
};

/** Les parties d'une date, à l'heure de Genève et non à celle du serveur. */
function partiesGenevoises(date: Date): PartiesDeDate {
  const parties = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const lire = (type: string) => Number(parties.find((p) => p.type === type)?.value ?? "0");
  return {
    jour: lire("day"),
    mois: lire("month"),
    annee: lire("year"),
    // fr-CH écrit minuit « 24 » plutôt que « 00 » : sans ce modulo, aucune écriture de
    // l'heure ne correspondrait jamais pour les activités sans horaire.
    heure: lire("hour") % 24,
    minute: lire("minute"),
  };
}

/**
 * Toutes les façons dont une page communale écrit une date. On en cherche une seule : la
 * question n'est pas de savoir comment la page l'écrit, mais si elle l'écrit.
 */
export function ecrituresDeLaDate(date: Date): string[] {
  const { jour, mois, annee } = partiesGenevoises(date);
  const nom = MOIS[mois - 1];
  const jj = String(jour).padStart(2, "0");
  const mm = String(mois).padStart(2, "0");

  const ecritures = [
    `${jour} ${nom}`,
    `${jj} ${nom}`,
    `${jour} ${nom.slice(0, 4)}`,
    `${jj} ${mm} ${annee}`,
    `${jour} ${mois} ${annee}`,
    `${jj} ${mm} ${String(annee).slice(2)}`,
    `${annee} ${mm} ${jj}`,
  ];

  // « 1er février », que personne n'écrit « 1 février ».
  if (jour === 1) ecritures.push(`1er ${nom}`, `1er ${nom.slice(0, 4)}`);

  return ecritures;
}

/** Les façons d'écrire une heure : « 14h », « 14 h 30 », « 14:00 ». */
export function ecrituresDeLHeure(date: Date): string[] {
  const { heure, minute } = partiesGenevoises(date);
  const hh = String(heure).padStart(2, "0");
  const mn = String(minute).padStart(2, "0");

  const ecritures = [`${heure}h${mn}`, `${hh}h${mn}`, `${heure} h ${mn}`, `${heure} ${mn}`];

  if (minute === 0) ecritures.push(`${heure}h`, `${hh}h`, `${heure} h`, `${heure} heures`);
  if (heure === 0) ecritures.push("minuit");
  if (heure === 12 && minute === 0) ecritures.push("midi");

  return ecritures;
}

/** Le domaine d'une URL, sans le `www.` qui ne distingue rien. */
function domaine(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Vrai si la fiche appartient au site de la source. Un sous-domaine passe
 * (`agenda.onex.ch` pour `www.onex.ch`) : c'est le même éditeur, et les communes rangent
 * volontiers leur agenda ailleurs que sur leur page d'accueil.
 */
export function memeDomaine(urlFiche: string, urlSource: string): boolean {
  const fiche = domaine(urlFiche);
  const source = domaine(urlSource);
  if (!fiche || !source) return false;
  return fiche === source || fiche.endsWith(`.${source}`) || source.endsWith(`.${fiche}`);
}

export type ContexteControle = {
  source: Pick<Source, "url" | "kind">;
  /** Le texte de la page tel qu'il a été envoyé au modèle. Absent pour un flux structuré. */
  texteSource?: string;
};

/**
 * Les contrôles qui ne demandent que l'activité et sa page. Fonction pure : c'est elle que
 * les tests verrouillent, et c'est elle qui décide si une activité se publie seule.
 */
export function controler(event: RawEvent, contexte: ContexteControle): Echec[] {
  const echecs: Echec[] = [];

  /* --------------------------------------------- contrôles de toutes les sources */

  if (TITRES_DE_RUBRIQUE.has(normaliser(event.title))) {
    echecs.push({
      code: "titre_generique",
      detail: `« ${event.title} » est un titre de rubrique, pas une activité.`,
    });
  }

  if (event.url && !memeDomaine(event.url, contexte.source.url)) {
    echecs.push({
      code: "url_hors_domaine",
      detail: `${event.url} n'appartient pas au site de la source.`,
    });
  }

  if (event.endsAt) {
    const jours = (event.endsAt.getTime() - event.startsAt.getTime()) / 86_400_000;
    if (jours < 0) {
      echecs.push({ code: "duree_invraisemblable", detail: "La fin précède le début." });
    } else if (jours > DUREE_MAX_JOURS) {
      echecs.push({
        code: "duree_invraisemblable",
        detail: `L'activité durerait ${Math.round(jours)} jours.`,
      });
    }
  }

  if (contexte.source.kind !== "html_ai") return echecs;

  /* ------------------------------------- contrôles des pages lues par le modèle */

  const page = normaliser(contexte.texteSource ?? "");
  if (!page) {
    echecs.push({
      code: "date_absente",
      detail: "La page lue n'a pas été conservée : il n'y a rien à confronter.",
    });
    return echecs;
  }

  const dates = ecrituresDeLaDate(event.startsAt);
  if (!dates.some((forme) => contient(page, forme))) {
    echecs.push({
      code: "date_absente",
      detail: `Aucune trace du ${dates[0]} sur la page d'origine.`,
    });
  }

  const heures = ecrituresDeLHeure(event.startsAt);
  if (!heures.some((forme) => contient(page, forme))) {
    echecs.push({
      code: "heure_absente",
      detail: `Aucune heure lisible sur la page : l'activité ressort à ${heures[0]}.`,
    });
  }

  if (!contient(page, normaliser(event.title))) {
    echecs.push({
      code: "titre_reformule",
      detail: `« ${event.title} » n'apparaît pas tel quel sur la page.`,
    });
  }

  if (event.placeLabel && couverture(event.placeLabel, page) < 0.8) {
    echecs.push({
      code: "lieu_absent",
      detail: `« ${event.placeLabel} » ne se retrouve pas sur la page.`,
    });
  }

  if (event.description && couverture(event.description, page) < 0.75) {
    echecs.push({
      code: "description_inventee",
      detail: "La description contient des mots absents de la page.",
    });
  }

  for (const age of [event.minAge, event.maxAge]) {
    if (age === undefined) continue;
    // « 5 ans » comme « 5 a 10 ans » : la page annonce l'âge d'une façon ou d'une autre.
    if (!contient(page, `${age} ans`) && !contient(page, `${age} a`)) {
      echecs.push({ code: "age_absent", detail: `La page n'écrit nulle part « ${age} ans ».` });
      break;
    }
  }

  return echecs;
}
