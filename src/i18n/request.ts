import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * D'où vient la langue d'une requête.
 *
 * 1. `locale`, quand un appel la donne explicitement — les e-mails et notifications sont
 *    rendus dans la langue du destinataire, pas dans celle de la requête en cours.
 * 2. `requestLocale`, sinon : le segment [locale] de l'URL, transmis par le proxy dans un
 *    en-tête. C'est le seul canal qui atteigne aussi les actions serveur — les lecteurs de
 *    `next/root-params` n'y existent pas, on ne peut donc pas s'en servir ici, et next-intl
 *    maintient `requestLocale` précisément pour ce cas.
 * 3. Le français, à défaut : un chemin à point (/inconnu.txt) contourne le proxy et fait de
 *    son premier segment une fausse locale ; le layout répond déjà 404 à ces valeurs, il
 *    faut seulement que la page « n'existe pas » ait une langue pour se rendre.
 */
export default getRequestConfig(async ({ locale, requestLocale }) => {
  const candidate = locale ?? (await requestLocale);
  const resolved = hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;

  return {
    locale: resolved,
    messages: (await import(`../../messages/${resolved}.json`)).default,
  };
});
