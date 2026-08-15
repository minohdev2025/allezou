/** Contrat commun à tous les adaptateurs de source. */

import type * as s from "../db/schema";
import type { Acces, Tarif } from "./tarif";

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
  /** Ce que la page dit du prix et de l'inscription. « inconnu » quand elle n'en dit rien. */
  tarif?: Tarif;
  acces?: Acces;
  /** Aucun horaire annoncé : l'activité tient la journée, elle ne commence pas à minuit. */
  allDay?: boolean;
  /** Le rythme, recopié tel que la page l'écrit : « les mercredis ». */
  recurrence?: string;
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

/**
 * Ce qu'on accepte de lire d'un site qu'on ne tient pas.
 *
 * Deux mégaoctets : la plus grosse feuille communale rencontrée en fait quarante. Le
 * planificateur tourne dans le processus du serveur web, et le conteneur n'a pas de mémoire
 * infinie : une commune dont le flux enfle, ou dont le site est repris par quelqu'un d'autre,
 * ne doit pas pouvoir emporter Allezou avec elle.
 */
export const TAILLE_MAX_REPONSE = 2_000_000;

/**
 * Lit le corps d'une réponse en s'arrêtant à `max` caractères, et coupe la connexion.
 *
 * `reponse.text()` charge tout avant de rendre la main : la taille se découvre une fois qu'il
 * est trop tard. Ici on lit par morceaux et on referme dès qu'on en a assez, ce qui borne
 * aussi le temps passé.
 */
export async function lireTexte(
  reponse: Response,
  max = TAILLE_MAX_REPONSE,
): Promise<string> {
  const corps = reponse.body;
  if (!corps) return (await reponse.text()).slice(0, max);

  const lecteur = corps.getReader();
  const decodeur = new TextDecoder();
  let texte = "";

  try {
    while (texte.length < max) {
      const { done, value } = await lecteur.read();
      if (done) break;
      texte += decodeur.decode(value, { stream: true });
    }
  } finally {
    // Referme la connexion : sans ça, le reste du corps continue d'arriver pour rien.
    await lecteur.cancel().catch(() => undefined);
  }

  return texte.slice(0, max);
}

/** Coupe une chaîne à la longueur admise en base, sans couper au milieu d'un mot si possible. */
export function clamp(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean || undefined;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}
