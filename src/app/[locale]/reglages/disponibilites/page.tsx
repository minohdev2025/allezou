import { getLocale, getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { mesDisponibilites, type Statut } from "@/lib/disponibilites";
import { heureDesMinutes } from "@/lib/heure";
import { jourGenevois } from "@/lib/ingest/types";
import { requireAccount } from "@/lib/session";
import { semainesDe, vacancesAVenir } from "@/lib/vacances";
import { lecteursPossibles } from "@/lib/visibility";
import {
  ajouterDisponibilite,
  choisirLecteursDisponibilites,
  reglerSemaineVacances,
  reglerVacancesEntieres,
  retirerDisponibilite,
} from "../../actions";
import { Alerte, Carte, Navigation, Pastille, nomDuJour, periodeCourte } from "../../ui";
import { BoutonEnregistrer, EnteteReglages } from "../_entete";
import { ChoixLecteurs } from "./choix-lecteurs-client";

/**
 * Ce qu'on dit de ses habitudes et de ses vacances, et à qui.
 *
 * Trois cartes, dans l'ordre où l'on s'en sert : l'habitude de la semaine (« le mercredi
 * de 16h à 20h »), les vacances scolaires semaine par semaine, puis les personnes qui
 * voient tout cela. La dernière est la seule qui engage quelqu'un d'autre ; elle est en
 * bas, mais son compteur est en évidence : « Personne » tant qu'on n'a nommé personne,
 * et c'est la valeur de départ.
 *
 * Les semaines se règlent d'un toucher, sans bouton « Enregistrer » : présent, absent,
 * et toucher le choix déjà pris l'efface. Une période de plusieurs semaines a en plus sa
 * ligne « Toutes », pour l'été où l'on part deux semaines sur huit.
 */
export default async function ReglagesDisponibilites({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const t = await getTranslations("Disponibilites");
  const locale = (await getLocale()) as Locale;
  const account = await requireAccount();
  const { erreur } = await searchParams;

  const [mes, cercles] = await Promise.all([
    mesDisponibilites(account.id),
    lecteursPossibles(account.id),
  ]);

  const aujourdhui = jourGenevois(new Date());
  const vacances = vacancesAVenir(aujourdhui).map((v) => ({
    ...v,
    semaines: semainesDe(v).filter((s) => s.jusquAu >= aujourdhui),
  }));

  const MESSAGES: Record<string, string> = {
    creneau_invalide: t("erreurs.creneau_invalide"),
    creneaux_max: t("erreurs.creneaux_max"),
    lecteur_interdit: t("erreurs.lecteur_interdit"),
  };

  const champ =
    "rounded-2xl bg-[color:var(--color-surface)] px-3 py-3 text-base font-bold ring-2 ring-[color:var(--color-trait)] outline-none [color-scheme:light] focus:ring-[color:var(--color-vert)]";

  return (
    <main className="apparait">
      <EnteteReglages titre={t("titre")} />

      {erreur ? (
        <Alerte ton="erreur">
          {Object.hasOwn(MESSAGES, erreur) ? MESSAGES[erreur] : t("erreurGenerique")}
        </Alerte>
      ) : null}

      <Carte className="mb-4">
        <p className="mb-3 font-bold">{t("hebdoTitre")}</p>

        {mes.creneaux.length > 0 ? (
          <ul className="mb-4 flex flex-wrap gap-2">
            {mes.creneaux.map((creneau) => (
              <li key={creneau.id}>
                <form action={retirerDisponibilite}>
                  <input type="hidden" name="creneau" value={creneau.id} />
                  <button
                    className="flex items-center gap-1.5 rounded-[var(--radius-pilule)] px-3 py-1.5 text-sm font-bold"
                    style={{ background: "var(--color-vert-doux)", color: "var(--color-vert)" }}
                  >
                    {capitale(nomDuJour(creneau.jour, locale))}{" "}
                    {heureDesMinutes(creneau.debut)}–{heureDesMinutes(creneau.fin)}
                    <span aria-hidden>✕</span>
                    <span className="sr-only">{t("retirer")}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        <form action={ajouterDisponibilite} className="space-y-3">
          <select
            name="jour"
            aria-label={t("jour")}
            defaultValue="3"
            className={`w-full ${champ}`}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((jour) => (
              <option key={jour} value={jour}>
                {capitale(nomDuJour(jour, locale))}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            {[
              { name: "de", libelle: t("de"), valeur: "16:00" },
              { name: "a", libelle: t("a"), valeur: "18:00" },
            ].map((heure) => (
              <label
                key={heure.name}
                className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-3 font-bold shadow-[inset_0_0_0_2px_var(--color-trait)]"
              >
                <span className="shrink-0 text-[color:var(--color-doux)]">{heure.libelle}</span>
                <input
                  type="time"
                  name={heure.name}
                  defaultValue={heure.valeur}
                  required
                  className="w-[5.2rem] bg-transparent text-center font-bold outline-none [color-scheme:light]"
                />
              </label>
            ))}
          </div>
          <BoutonEnregistrer>{t("ajouter")}</BoutonEnregistrer>
        </form>
      </Carte>

      <Carte className="mb-4">
        <p className="mb-1 font-bold">{t("vacancesTitre")}</p>
        {vacances.map((periode) => {
          const tous = (statut: Statut) =>
            periode.semaines.every((s) => mes.semaines[s.lundi] === statut);
          return (
            <section
              key={periode.id}
              className="border-t border-[color:var(--color-trait)] py-3 first-of-type:border-t-0"
            >
              <h3 className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-bold">{t(`vacances.${periode.cle}`)}</span>
                {/* Une seule semaine : ses dates sont déjà sur la ligne juste en dessous. */}
                {periode.semaines.length > 1 ? (
                  <span className="text-sm text-[color:var(--color-doux)]">
                    {periodeCourte(periode.debut, periode.fin, locale)}
                  </span>
                ) : null}
              </h3>
              <ul className="space-y-2">
                {periode.semaines.length > 1 ? (
                  <LigneStatut
                    libelle={t("toutes")}
                    action={reglerVacancesEntieres}
                    cache={{ name: "vacances", value: periode.id }}
                    actuel={tous("present") ? "present" : tous("absent") ? "absent" : null}
                    present={t("present")}
                    absent={t("absent")}
                    discret
                  />
                ) : null}
                {periode.semaines.map((semaine) => (
                  <LigneStatut
                    key={semaine.lundi}
                    libelle={periodeCourte(semaine.debut, semaine.fin, locale)}
                    action={reglerSemaineVacances}
                    cache={{ name: "semaine", value: semaine.lundi }}
                    actuel={mes.semaines[semaine.lundi] ?? null}
                    present={t("present")}
                    absent={t("absent")}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </Carte>

      <Carte>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="font-bold">{t("lecteursTitre")}</span>
          <Pastille couleur={mes.lecteurs.length > 0 ? "vert" : "ambre"}>
            {mes.lecteurs.length > 0
              ? t("lecteursNombre", { n: mes.lecteurs.length })
              : t("lecteursPersonne")}
          </Pastille>
        </div>
        {cercles.length === 0 ? (
          <p className="text-sm leading-snug text-[color:var(--color-doux)]">
            {t("aucunCercle")}
          </p>
        ) : (
          <form action={choisirLecteursDisponibilites} className="space-y-4">
            <ChoixLecteurs cercles={cercles} initiaux={mes.lecteurs} />
            <BoutonEnregistrer>{t("enregistrer")}</BoutonEnregistrer>
          </form>
        )}
      </Carte>

      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />
    </main>
  );
}

/** « mercredi » → « Mercredi » : Intl rend les jours en minuscules en français. */
function capitale(texte: string): string {
  return texte.charAt(0).toLocaleUpperCase() + texte.slice(1);
}

/**
 * Une semaine (ou « Toutes ») et ses deux choix. Toucher le choix déjà pris l'efface :
 * le bouton envoie alors « aucun », et la semaine redevient non renseignée.
 */
function LigneStatut({
  libelle,
  action,
  cache,
  actuel,
  present,
  absent,
  discret = false,
}: {
  libelle: string;
  action: (formData: FormData) => Promise<void>;
  cache: { name: string; value: string };
  actuel: Statut | null;
  present: string;
  absent: string;
  discret?: boolean;
}) {
  const choix = [
    { statut: "present" as const, libelle: present, teinte: "vert" },
    { statut: "absent" as const, libelle: absent, teinte: "corail" },
  ];
  return (
    <li className="flex items-center justify-between gap-3">
      <span className={discret ? "text-sm text-[color:var(--color-doux)]" : "text-sm font-semibold"}>
        {libelle}
      </span>
      <form action={action} className="flex shrink-0 gap-2">
        <input type="hidden" name={cache.name} value={cache.value} />
        {choix.map((c) => {
          const actif = actuel === c.statut;
          return (
            <button
              key={c.statut}
              name="statut"
              value={actif ? "aucun" : c.statut}
              aria-pressed={actif}
              className="rounded-[var(--radius-pilule)] px-3 py-1.5 text-sm font-bold"
              style={
                actif
                  ? { background: `var(--color-${c.teinte}-doux)`, color: `var(--color-${c.teinte})` }
                  : { color: "var(--color-doux)", boxShadow: "inset 0 0 0 2px var(--color-trait)" }
              }
            >
              {c.libelle}
            </button>
          );
        })}
      </form>
    </li>
  );
}
