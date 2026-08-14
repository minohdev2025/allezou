/** Contrat commun à tous les adaptateurs de source. */

import type * as s from "../db/schema";

export type Source = typeof s.source.$inferSelect;

/** Un événement tel qu'il sort d'une source, avant d'entrer au calendrier. */
export type RawEvent = {
  /** Identifiant stable chez la source — l'URL de la fiche fait très bien l'affaire. */
  externalId: string;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt?: Date;
  placeLabel?: string;
  url?: string;
  /** Tranche d'âge, uniquement si la source l'annonce explicitement. */
  minAge?: number;
  maxAge?: number;
  /**
   * Le texte de la page d'où l'activité a été lue, tel qu'il a été donné au modèle.
   *
   * Il ne va pas en base : il sert le temps d'un passage, aux contrôles qui vérifient que
   * chaque valeur annoncée figure bien sur la page. Un flux structuré ne le renseigne pas,
   * il n'interprète rien.
   */
  texteSource?: string;
};

/** Lit « dès 5 ans », « 3-6 ans », « 7 à 12 ans » tels que les sources les écrivent. */
export function parseAgeRange(text: string | undefined): {
  minAge?: number;
  maxAge?: number;
} {
  if (!text) return {};

  const intervalle = text.match(/(\d{1,2})\s*(?:-|–|à)\s*(\d{1,2})\s*ans/i);
  if (intervalle) {
    const min = Number(intervalle[1]);
    const max = Number(intervalle[2]);
    if (min <= max && max <= 18) return { minAge: min, maxAge: max };
  }

  const depuis = text.match(/(?:dès|à partir de)\s*(\d{1,2})\s*ans/i);
  if (depuis) {
    const min = Number(depuis[1]);
    if (min <= 18) return { minAge: min };
  }

  const jusqu = text.match(/jusqu'?à\s*(\d{1,2})\s*ans/i);
  if (jusqu) {
    const max = Number(jusqu[1]);
    if (max <= 18) return { maxAge: max };
  }

  return {};
}

export type Adapter = (source: Source) => Promise<RawEvent[]>;

export const USER_AGENT = "Allezou/0.1 (agenda familial genevois)";

/** Coupe une chaîne à la longueur admise en base, sans couper au milieu d'un mot si possible. */
export function clamp(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean || undefined;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}
