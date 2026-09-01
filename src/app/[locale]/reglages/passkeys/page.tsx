import { getLocale, getTranslations } from "next-intl/server";

import { requireAccount } from "@/lib/session";
import { localeSure } from "@/lib/traduire";

import {
  oublierCleAcces,
  preparerCleAcces,
  enregistrerCleAcces,
} from "../../actions";
import { AjouterCleAcces } from "../../passkey-client";
import { Carte, Navigation } from "../../ui";
import { EnteteReglages } from "../_entete";

/**
 * Les clés d'accès (passkeys) : revenir dans l'application sans courriel.
 *
 * Sortie de la page famille pour qu'elle reste sur la coparentalité et les
 * enfants — c'est son sujet. Ici, on enregistre de nouvelles clés et on en
 * oublie. Accessible depuis le hub /reglages, au-dessus des lieux.
 */
export default async function ReglagesPasskeys() {
  const t = await getTranslations("Compte");
  const locale = localeSure(await getLocale());
  const account = await requireAccount();
  const { jourCourt } = await import("../../ui");
  const cles = await import("@/lib/passkeys").then((m) => m.mesCles(account.id));

  return (
    <main className="apparait">
      <EnteteReglages titre={t("passkeyTitre")} />

      <Carte accent="vert" className="mb-5">
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("passkeyTexte")}
        </p>

        {cles.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {cles.map((cle) => {
              const date = cle.lastUsedAt ? jourCourt(cle.lastUsedAt, locale) : null;
              return (
                <li
                  key={cle.id}
                  className="flex items-center gap-3 rounded-2xl bg-[color:var(--color-fond)] px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-bold">{cle.label}</span>
                    <span className="text-[color:var(--color-doux)]">
                      {date
                        ? t("dernier", { date: `${date.nombre} ${date.mois}` })
                        : t("jamaisUtilise")}
                    </span>
                  </span>
                  <form action={oublierCleAcces}>
                    <input type="hidden" name="cle" value={cle.id} />
                    <button
                      className="shrink-0 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                      style={{ background: "var(--color-corail-doux)", color: "var(--color-corail)" }}
                    >
                      {t("oublier")}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : null}

        <AjouterCleAcces
          preparer={preparerCleAcces}
          enregistrer={enregistrerCleAcces}
          nomParDefaut={t("appareilParDefaut")}
        />
      </Carte>

      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />
    </main>
  );
}
