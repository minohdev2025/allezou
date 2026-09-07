import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

import { lireAnnonceCookie } from "@/lib/annonce";
import { myChildren } from "@/lib/children";
import { searchPlaces } from "@/lib/places";
import { defaultAudience } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { contient, normaliser } from "@/lib/texte";
import { readerCircles } from "@/lib/visibility";
import { lireAnnonce, proposerActivite } from "../../actions";
import { Alerte, Bouton, Carte, Champ, PUCE_COCHEE, Titre, teinte } from "../../ui";
import { BoutonLireAnnonce } from "./bouton-lire-annonce";
import { ChampPhoto } from "./champ-photo";

const champ =
  "w-full rounded-2xl bg-[color:var(--color-surface)] px-4 py-3.5 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]";

/**
 * Proposer une activité à l'agenda.
 *
 * Un seul geste crée l'entrée du calendrier *et* y inscrit son auteur : quelqu'un qui
 * signale une activité y va, sinon il ne la signalerait pas. L'activité elle-même est
 * publique ; c'est l'inscription qui choisit ses cercles.
 *
 * Une annonce déjà écrite (photo d'affiche, lien ou texte collé) peut être lue en
 * amont : `lireAnnonce` pose le résultat dans un témoin, cette page le relit et
 * pré-remplit les champs. Rien n'est publié sans relecture du parent.
 */
export default async function NouvelleActivite({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; annonce?: string }>;
}) {
  const t = await getTranslations("AgendaNouveau");
  const account = await requireAccount();
  const { erreur, annonce } = await searchParams;
  const MESSAGES: Record<string, string> = {
    titre_invalide: t("erreurs.titre_invalide"),
    dates_invalides: t("erreurs.dates_invalides"),
    aucun_destinataire: t("erreurs.aucun_destinataire"),
    cercle_interdit: t("erreurs.cercle_interdit"),
  };
  const MESSAGES_ANNONCE: Record<string, string> = {
    image_invalide: t("annonceErreurs.image_invalide"),
    lien_invalide: t("annonceErreurs.lien_invalide"),
    texte_trop_court: t("annonceErreurs.texte_trop_court"),
    rien_trouve: t("annonceErreurs.rien_trouve"),
    date_invraisemblable: t("annonceErreurs.date_invraisemblable"),
    indisponible: t("annonceErreurs.indisponible"),
  };
  // `Object.hasOwn` et non un accès direct : la clé vient de l'URL, et `?erreur=__proto__`
  // rendrait un objet que React refuse d'afficher.
  const message = (table: Record<string, string>, cle: string, defaut: string) =>
    Object.hasOwn(table, cle) ? table[cle] : defaut;

  // `annonce=1` : la lecture a abouti, le témoin porte les champs. Sinon la valeur
  // est la raison de l'échec, affichée en alerte.
  const annonceLue = annonce === "1" ? await lireAnnonceCookie() : undefined;
  const annonceEchec = annonce && annonce !== "1" ? annonce : undefined;

  const [lieux, cercles, enfants, defauts] = await Promise.all([
    searchPlaces("", 50),
    readerCircles(account.id),
    myChildren(account.id),
    defaultAudience(account.id),
  ]);

  const cochesParDefaut = new Set(defauts.map((c) => c.id));

  /*
    Le lieu lu sur l'annonce : s'il nomme un lieu du catalogue (sans accents ni casse,
    « Parc La Grange, Genève » contient « parc la grange »), il est présélectionné ;
    sinon il part dans le champ libre, que le parent complète ou corrige.
  */
  const lieuAnnonce = annonceLue?.lieu ? normaliser(annonceLue.lieu) : "";
  const lieuReconnu = lieuAnnonce
    ? lieux.find((lieu) => contient(lieuAnnonce, normaliser(lieu.name)))
    : undefined;

  return (
    <main className="apparait">
      <Titre>
              {t("titre")}
            </Titre>

      {erreur ? (
        <Alerte ton="erreur">{message(MESSAGES, erreur, t("erreurGenerique"))}</Alerte>
      ) : null}

      {annonceEchec ? (
        <Alerte ton="erreur">
          {message(MESSAGES_ANNONCE, annonceEchec, t("annonceErreurs.rien_trouve"))}
        </Alerte>
      ) : null}

      {cercles.length === 0 ? (
        <Carte>
          <p className="text-[color:var(--color-doux)]">{t("rejoindreCercle")}</p>
        </Carte>
      ) : (
        <div className="space-y-5">
          {/*
            La lecture d'annonce est un raccourci, pas le chemin principal : repliée par
            défaut, elle ne prend pas de place à qui remplit le formulaire à la main. Elle
            se rouvre seule quand la dernière tentative a échoué, pour corriger et relancer
            sans chercher l'entrée.
          */}
          <details
            open={annonceEchec !== undefined}
            className="rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
          >
            <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-[color:var(--color-encre)]">
              {t("annonceTitre")}
            </summary>
            <div className="border-t border-[color:var(--color-trait)] px-5 py-4">
              <form action={lireAnnonce} className="space-y-4">
                <p className="text-sm leading-snug text-[color:var(--color-doux)]">
                  {t("annonceAide")}
                </p>
                <ChampPhoto />
                <label className="block">
                  <span className="mb-1 block font-bold">{t("annonceLien")}</span>
                  <input
                    type="url"
                    name="lien"
                    placeholder="https://"
                    className={champ}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-bold">{t("annonceTexte")}</span>
                  <textarea
                    name="texte"
                    rows={4}
                    placeholder={t("annonceTextePlaceholder")}
                    className={`${champ} resize-y`}
                  />
                </label>
                <BoutonLireAnnonce />
              </form>
            </div>
          </details>

          <Carte>
            <form action={proposerActivite} className="space-y-5">
              {annonceLue ? (
                <div className="apparait rounded-2xl bg-[color:var(--color-vert-doux)] px-4 py-3">
                  <p className="font-bold">{t("annonceTermineeTitre")}</p>
                  <p className="mt-1 text-sm leading-snug">{t("annonceRelue")}</p>
                </div>
              ) : null}
              <Champ
                label={t("labelQuoi")}
                name="titre"
                required
                maxLength={120}
                defaultValue={annonceLue?.titre}
                placeholder={t("placeholderTitre")}
              />

              {/*
                Deux colonnes en grille, avec `min-w-0` : un champ `datetime-local` a une
                largeur intrinsèque que `flex-1` ne sait pas réduire, et « Fin » sortait de
                la carte sur un écran de 375 px.
              */}
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0">
                  <span className="mb-1 block font-bold">{t("debut")}</span>
                  <input
                    type="datetime-local"
                    name="debut"
                    required
                    defaultValue={annonceLue?.debut}
                    className={`${champ} min-w-0`}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block font-bold">{t("fin")}</span>
                  <input
                    type="datetime-local"
                    name="fin"
                    defaultValue={annonceLue?.fin}
                    className={`${champ} min-w-0`}
                  />
                </label>
              </div>

            <label className="block">
              <span className="mb-1 block font-bold">{t("ou")}</span>
              <span className="mb-2 block text-sm text-[color:var(--color-doux)]">
                {t("aideLieu")}
              </span>
              <select name="lieu" className={champ} defaultValue={lieuReconnu?.id ?? ""}>
                <option value="">{t("choisirLieu")}</option>
                {lieux.map((lieu) => (
                  <option key={lieu.id} value={lieu.id}>
                    {lieu.name}
                    {lieu.commune ? ` · ${lieu.commune}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <input
              name="lieuLibre"
              maxLength={120}
              defaultValue={lieuReconnu ? undefined : annonceLue?.lieu}
              placeholder={t("placeholderLieuLibre")}
              className={champ}
            />

            <fieldset>
              <legend className="mb-2 font-bold">{t("visiblePar")}</legend>
              <div className="flex flex-wrap gap-2">
                {cercles.map((cercle) => (
                  <label key={cercle.id}>
                    <input
                      type="checkbox"
                      name="cercle"
                      value={cercle.id}
                      defaultChecked={cochesParDefaut.has(cercle.id)}
                      className="peer sr-only"
                    />
                    <span
                      className={`inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none ${PUCE_COCHEE[teinte(cercle.id)]}`}
                    >
                      {cercle.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {enfants.length > 0 ? (
              <fieldset>
                <legend className="mb-2 font-bold">{t("vousYAllezAvec")}</legend>
                <div className="flex flex-wrap gap-2">
                  {enfants.map((enfant) => (
                    <label key={enfant.id}>
                      <input
                        type="checkbox"
                        name="enfant"
                        value={enfant.id}
                        defaultChecked
                        className="peer sr-only"
                      />
                      <span className="inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-violet)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none">
                        {enfant.firstName}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <Bouton type="submit">{t("proposerEtSInscrire")}</Bouton>
            </form>
          </Carte>
        </div>
      )}

      <p className="mt-6 text-center">
        <Link href="/agenda" className="text-[color:var(--color-doux)] underline underline-offset-4">
          {t("retourAgenda")}
        </Link>
      </p>
    </main>
  );
}
