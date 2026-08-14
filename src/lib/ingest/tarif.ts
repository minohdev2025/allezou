/**
 * Ce qu'une page dit du prix et de l'inscription.
 *
 * Un parent ne cherche pas la même chose selon son budget et selon son samedi : « c'est
 * gratuit ? » et « faut-il s'inscrire ? » sont deux questions posées avant de sortir, et
 * l'agenda ne savait répondre ni à l'une ni à l'autre.
 *
 * La lecture est faite de mots exacts, jamais d'un modèle : on cherche « gratuit », « CHF »,
 * « sur inscription » dans le texte que la source a elle-même écrit. Ce qui ne dit rien reste
 * **inconnu**, et inconnu n'est pas gratuit. Sur une page communale, l'absence de prix affiché
 * veut dire que personne ne l'a écrit, pas que l'activité est offerte.
 */

import * as s from "../db/schema";

export const TARIFS = s.eventTarif.enumValues;
export const ACCES = s.eventAcces.enumValues;

export type Tarif = (typeof TARIFS)[number];
export type Acces = (typeof ACCES)[number];

export const LIBELLES_TARIF: Record<Tarif, string> = {
  gratuit: "Gratuit",
  payant: "Payant",
  inconnu: "Prix non défini",
};

export const LIBELLES_ACCES: Record<Acces, string> = {
  libre: "Entrée libre",
  inscription: "Sur inscription",
  inconnu: "Inscription non définie",
};

/** Minuscules et sans accents, mais la ponctuation reste : « 12.- » n'est un prix qu'avec. */
function aplati(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const DIT_GRATUIT = [/\bgratuit/, /entree libre/, /sans frais/, /\boffert\b/];

const DIT_PAYANT = [
  /\bpayant/,
  /\bchf\b/,
  /\btarifs?\b/,
  /\bbillet/,
  /\d+\s*\.\s*-/,
  /\d+\s*(?:frs?\.?|francs)\b/,
  /\bplein tarif\b/,
  /\bprix d(?:'|e l)?\s*entree\b/,
];

const DIT_INSCRIPTION = [
  /\bsur inscription\b/,
  /\binscriptions?\s+(?:obligatoire|requise|necessaire|souhaitee|prealable)/,
  /\bs'inscrire\b/,
  /\binscrivez[- ]vous\b/,
  /\bsur reservation\b/,
  /\breservations?\s+(?:obligatoire|requise|necessaire|souhaitee|prealable)/,
  /\bbilletterie\b/,
  /\bplaces limitees\b/,
];

const DIT_LIBRE = [
  /entree libre/,
  /\bsans inscription\b/,
  /\bsans reservation\b/,
  /\b(?:en )?libre acces\b/,
  /\bacces libre\b/,
];

function dit(texte: string, motifs: RegExp[]): boolean {
  return motifs.some((motif) => motif.test(texte));
}

/**
 * Lit le prix et l'inscription dans ce que la source a écrit.
 *
 * Les deux conflits possibles se tranchent du côté de la mauvaise surprise évitée. Une page
 * qui dit « gratuit jusqu'à 12 ans, CHF 15 dès 16 ans » est **payante** : quelqu'un paie, et
 * l'apprendre à la caisse est pire que de payer en le sachant. Une page qui dit à la fois
 * « entrée libre » et « sur inscription » est **sur inscription** : arriver devant une porte
 * pleine coûte la sortie, s'inscrire pour rien coûte une minute.
 */
export function lireTarifEtAcces(...textes: (string | null | undefined)[]): {
  tarif: Tarif;
  acces: Acces;
} {
  const texte = aplati(textes.filter(Boolean).join(" ⋅ "));

  const payant = dit(texte, DIT_PAYANT);
  const gratuit = dit(texte, DIT_GRATUIT);
  const inscription = dit(texte, DIT_INSCRIPTION);
  const libre = dit(texte, DIT_LIBRE);

  return {
    tarif: payant ? "payant" : gratuit ? "gratuit" : "inconnu",
    acces: inscription ? "inscription" : libre ? "libre" : "inconnu",
  };
}
