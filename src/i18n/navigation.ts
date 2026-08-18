import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Les portes de navigation de l'application. Toujours importer d'ici, jamais de `next/link`
 * ni `next/navigation` : ce sont les mêmes API, mais elles écrivent le préfixe de langue
 * (`/en/agenda` pour qui lit en anglais, `/agenda` en français) sans que personne n'y pense.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
