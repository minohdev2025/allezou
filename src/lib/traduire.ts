/**
 * Traduire hors de toute requête.
 *
 * Les écrans passent par next-intl et son cycle de requête. Mais un courriel de connexion,
 * une notification, un message d'invitation se rendent ailleurs : dans une action différée,
 * dans le passage des sources toutes les six heures, dans un script. Là, il n'y a ni URL ni
 * en-tête — seulement la langue enregistrée du destinataire. D'où ce traducteur pur, sans
 * contexte : les mêmes catalogues, la même syntaxe ICU, mais une simple fonction.
 */

import { createTranslator } from "next-intl";

import { LOCALE_BCP47, routing, type Locale } from "@/i18n/routing";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import pt from "../../messages/pt.json";
import sq from "../../messages/sq.json";

/**
 * Tous les catalogues ont la structure du français : le typer ainsi fait vérifier la
 * parité des clés par le compilateur, en plus du test qui la vérifie à l'exécution.
 */
type Catalogue = typeof fr;
const CATALOGUES: Record<Locale, Catalogue> = { fr, en, es, pt, sq };

/** Ce qui sort de la base est une chaîne ; ce qui entre ici est une langue servie. */
export function localeSure(valeur: string | null | undefined): Locale {
  return (routing.locales as readonly string[]).includes(valeur ?? "")
    ? (valeur as Locale)
    : routing.defaultLocale;
}

/** Un t() pour un destinataire précis, quelle que soit la requête en cours. */
export function traducteur<N extends keyof Catalogue>(locale: string, namespace: N) {
  const sure = localeSure(locale);
  return createTranslator({
    locale: sure,
    messages: CATALOGUES[sure],
    namespace,
  });
}

/**
 * Le chemin d'une URL pour cette langue. Reflète `localePrefix: "as-needed"` de
 * routing.ts : le français vit sans préfixe, les autres langues sous le leur. Sert aux
 * URL qui partent de l'application — notifications, courriels — sans dépendre du
 * contexte de rendu de next-intl.
 */
export function cheminLocalise(locale: string, chemin: string): string {
  const sure = localeSure(locale);
  return sure === routing.defaultLocale ? chemin : `/${sure}${chemin}`;
}

/** « 22 août », « 22 August », « 22 gusht » — à l'heure de Genève, dans la langue donnée. */
export function jourLong(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(LOCALE_BCP47[localeSure(locale)], {
    timeZone: "Europe/Zurich",
    day: "numeric",
    month: "long",
  }).format(date);
}
