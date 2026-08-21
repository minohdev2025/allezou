import { defineRouting } from "next-intl/routing";

/**
 * Les langues de l'application, dans l'ordre où un sélecteur les propose.
 *
 * Le choix des langues vient de qui vit réellement à Genève : l'anglais des familles
 * internationales, l'espagnol et le portugais des communautés ibériques et latino-américaines,
 * l'albanais parlé dans beaucoup de familles de Suisse romande. Pas d'allemand : ce n'est pas
 * la langue des familles d'ici, et celles qui le parlent lisent l'anglais.
 *
 * `localePrefix: "as-needed"` : le français vit aux adresses d'origine, sans préfixe.
 * Tous les liens qui circulent déjà — invitations dans WhatsApp, liens magiques dans les
 * boîtes mail, sorties partagées — continuent de mener exactement où ils menaient.
 * Les autres langues vivent sous /en, /es, /pt et /sq.
 */
/**
 * Le cookie qui retient la langue. Par défaut next-intl ne le fait vivre que la session du
 * navigateur ; un an, parce que la langue d'une famille ne change pas d'une visite à
 * l'autre, et que les redirections sans préfixe (actions serveur) s'appuient sur lui pour
 * retomber dans la bonne langue. Le même cookie est posé à la connexion depuis la langue
 * du compte — une seule définition pour les deux écritures.
 */
export const LOCALE_COOKIE = {
  name: "NEXT_LOCALE",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  path: "/",
} as const;

export const routing = defineRouting({
  locales: ["fr", "en", "es", "pt", "sq"],
  defaultLocale: "fr",
  localePrefix: "as-needed",
  localeCookie: { maxAge: LOCALE_COOKIE.maxAge },
});

export type Locale = (typeof routing.locales)[number];

/**
 * Le nom de chaque langue, écrit dans cette langue et jamais traduit : une famille
 * albanophone devant une page en français doit pouvoir reconnaître « Shqip ».
 */
export const LANGUES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  pt: "Português",
  sq: "Shqip",
};

/**
 * Les langues que les sélecteurs proposent.
 *
 * L'albanais n'y est pas tant qu'il n'a pas été relu : proposer une langue, c'est promettre
 * qu'elle est écrite par quelqu'un qui la parle. Elle reste servie — `/sq` répond, un compte
 * qui l'a choisie la garde, et le sélecteur la montre alors pour qu'on puisse en sortir —
 * mais rien n'y envoie plus personne.
 */
export const LANGUES_PROPOSEES: readonly Locale[] = ["fr", "en", "es", "pt"];

/** Les langues à montrer à quelqu'un, la sienne comprise même si on ne la propose plus. */
export function languesVisibles(actuelle: string): Locale[] {
  const proposees = [...LANGUES_PROPOSEES];
  return routing.locales.filter(
    (langue) => proposees.includes(langue) || langue === actuelle,
  );
}

/**
 * L'étiquette BCP 47 de chaque langue pour `Intl` : noms de jours, de mois, relatifs.
 *
 * `pt-PT` et non `pt` tout court : la communauté lusophone de Genève est portugaise,
 * pas brésilienne, et les deux variantes ne s'écrivent pas pareil. `fr-CH` et `en-CH`
 * gardent les conventions suisses (24 heures, formats de date).
 */
export const LOCALE_BCP47: Record<Locale, string> = {
  fr: "fr-CH",
  en: "en-CH",
  es: "es",
  pt: "pt-PT",
  sq: "sq",
};
