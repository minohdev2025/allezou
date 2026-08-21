import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LANGUES, languesVisibles } from "@/i18n/routing";

/**
 * La rangée de langues des pages publiques : accueil, connexion, invitation.
 *
 * Des liens, pas un menu : la page reste lisible sans JavaScript, et chaque langue mène à
 * la même page dans sa langue — le proxy retient le choix dans le cookie au passage.
 * Après connexion, c'est la langue du compte qui fait foi ; elle se change sur /compte.
 */
export async function ChoixLangue({ href }: { href: string }) {
  const [actuelle, t] = await Promise.all([getLocale(), getTranslations("ChoixLangue")]);

  return (
    <nav
      aria-label={t("label")}
      className="mb-6 flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm"
    >
      {languesVisibles(actuelle).map((langue) =>
        langue === actuelle ? (
          <span key={langue} className="font-bold" aria-current="true">
            {LANGUES[langue]}
          </span>
        ) : (
          <Link
            key={langue}
            href={href}
            locale={langue}
            className="text-[color:var(--color-doux)] underline underline-offset-4"
          >
            {LANGUES[langue]}
          </Link>
        ),
      )}
    </nav>
  );
}
