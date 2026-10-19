import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LOCALE_BCP47, type Locale } from "@/i18n/routing";
import { VERSION_DONNEES } from "@/lib/donnees";
import { lireDonnees } from "../actions";

/*
 * L'annonce d'un changement de /donnees (src/lib/donnees.ts).
 *
 * Rendue côté serveur, sans JavaScript : la promesse tient même si le script n'a pas
 * fini de charger, et ce qui a été lu se retient sur le compte, pas dans un navigateur.
 * L'annonce nomme ce qui change en une ligne ; la page dit le reste. Elle reste là
 * jusqu'au « J'ai lu » — « Plus tard » n'a pas de sens pour une promesse.
 */
export async function AnnonceDonnees() {
  const t = await getTranslations("AnnonceDonnees");
  const locale = (await getLocale()) as Locale;
  const date = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${VERSION_DONNEES}T00:00:00Z`));

  const bouton =
    "rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-2 font-bold shadow-[inset_0_0_0_2px_var(--color-trait)] active:translate-y-[1px]";

  return (
    <div
      role="region"
      aria-label={t("titre", { date })}
      className="mb-6 rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] p-4 shadow-[inset_0_0_0_2px_var(--color-trait)]"
    >
      <p className="mb-1 font-bold text-[color:var(--color-encre)]">{t("titre", { date })}</p>
      <p className="mb-3 text-sm leading-snug text-[color:var(--color-doux)]">
        {t("ceQuiChange")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/donnees" className={`${bouton} flex-1 text-center`}>
          {t("lire")}
        </Link>
        <form action={lireDonnees}>
          <button className={bouton}>{t("jaiLu")}</button>
        </form>
      </div>
    </div>
  );
}
