import { getLocale, getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { creneauxDuJour, etenduesPendant } from "@/lib/disponibilites";
import { heureDesMinutes, minutesGenevoises } from "@/lib/heure";
import { jourGenevois } from "@/lib/ingest/types";
import { vacancesDuMoment } from "@/lib/vacances";
import type { DisponibilitesVisibles } from "@/lib/visibility";
import { Carte, Jeton, nomDuJour, periodeCourte } from "./ui";

/** Ce qu'on dit d'une personne, en une ou deux lignes. */
export type ResumeDisponibilite = {
  accountId: string;
  displayName: string;
  lignes: string[];
};

/**
 * Met en mots les disponibilités d'une personne.
 *
 * Deux lectures : « jour » ne garde que les habitudes d'aujourd'hui qui ne sont pas
 * finies — c'est l'écran principal, où l'on cherche qui appeler maintenant ; « semaine »
 * les donne toutes — c'est la page du cercle, où l'on apprend à connaître les habitudes
 * de chacun. Les deux ajoutent les vacances dont on parle en ce moment, et elles seules :
 * l'été prochain n'a rien à faire sur l'écran d'un mardi d'octobre.
 */
export async function resumerDisponibilites(
  dispos: DisponibilitesVisibles[],
  lecture: "jour" | "semaine",
): Promise<ResumeDisponibilite[]> {
  const t = await getTranslations("Disponibilites");
  const locale = (await getLocale()) as Locale;
  const maintenant = new Date();
  const aujourdhui = jourGenevois(maintenant);
  const vacances = vacancesDuMoment(aujourdhui);
  const plage = (debut: number, fin: number) => `${heureDesMinutes(debut)}–${heureDesMinutes(fin)}`;

  return dispos
    .map((dispo) => {
      const lignes: string[] = [];

      if (lecture === "jour") {
        const creneaux = creneauxDuJour(dispo, aujourdhui, minutesGenevoises(maintenant));
        if (creneaux.length > 0) {
          lignes.push(
            t("ligneAujourdhui", { plages: creneaux.map((c) => plage(c.debut, c.fin)).join(", ") }),
          );
        }
      } else if (dispo.creneaux.length > 0) {
        lignes.push(
          dispo.creneaux
            .map((c) => `${nomDuJour(c.jour, locale, "short")} ${plage(c.debut, c.fin)}`)
            .join(" · "),
        );
      }

      if (vacances) {
        const { etendues, complete } = etenduesPendant(dispo.semaines, vacances, aujourdhui);
        if (etendues.length > 0) {
          const statut = (s: "present" | "absent") =>
            s === "present" ? t("statutPresent") : t("statutAbsent");
          const details = complete
            ? statut(etendues[0].statut)
            : etendues
                .map((e) =>
                  t("etendue", {
                    statut: statut(e.statut),
                    periode: periodeCourte(e.debut, e.fin, locale),
                  }),
                )
                .join(" · ");
          lignes.push(t("ligneVacances", { vacances: t(`vacances.${vacances.cle}`), details }));
        }
      }

      return { accountId: dispo.accountId, displayName: dispo.displayName, lignes };
    })
    .filter((r) => r.lignes.length > 0);
}

/**
 * Sur l'écran principal : qui est libre aujourd'hui, et qui est là ou pas pendant les
 * vacances qui approchent. Rien du tout quand personne n'a rien dit — une section vide
 * ne ferait que rappeler qu'on n'a pas été nommé.
 */
export async function DisponibilitesDuMoment({ dispos }: { dispos: DisponibilitesVisibles[] }) {
  const t = await getTranslations("Disponibilites");
  const resumes = await resumerDisponibilites(dispos, "jour");
  if (resumes.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="titre mb-2 text-lg font-bold">{t("titre")}</h2>
      <Carte className="!p-3">
        <ul className="divide-y divide-[color:var(--color-trait)]">
          {resumes.map((r) => (
            <li key={r.accountId} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <Jeton nom={r.displayName} id={r.accountId} taille={32} />
              <span className="min-w-0">
                <span className="block font-semibold leading-tight">{r.displayName}</span>
                {r.lignes.map((ligne) => (
                  <span key={ligne} className="block text-sm leading-snug text-[color:var(--color-doux)]">
                    {ligne}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Carte>
    </section>
  );
}
