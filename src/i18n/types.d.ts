import type { routing } from "./routing";

/**
 * Le type de locale que next-intl fait circuler : notre union, pas `string`.
 *
 * Sans cette déclaration, `getLocale()` renvoie une chaîne quelconque et chaque appelant
 * doit la resserrer lui-même (`localeSure`, cast). Avec elle, ce qui sort de next-intl est
 * déjà une des cinq langues servies.
 *
 * Les clés de messages, elles, restent volontairement non typées : les écrans consultent
 * des clés dynamiques (`erreurs.${code}`) gardées par `t.has`, et un typage strict des
 * clés se paierait en contorsions à chaque code d'erreur. La parité des catalogues est
 * déjà tenue par catalogues.test.ts et par le type Catalogue de lib/traduire.ts.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
  }
}
