import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import {
  coparents,
  duplicateChildren,
  hasPendingCoparentInvite,
  myChildren,
} from "@/lib/children";
import { estRelecteur, requireAccount } from "@/lib/session";
import { seDeconnecter } from "../actions";
import { Navigation, Titre } from "../ui";

/**
 * Page d'accueil des réglages. Tout doit être lisible sans scroller : quatre
 * grandes tuiles en haut pour les paramètres courants, puis en bas les actions
 * secondaires (lieux, données, aide, contact) et — en tout dernier, visible
 * uniquement pour le contact qui relit — les outils d'administration.
 *
 * On avait essayé un code couleur par tuile, puis plusieurs étages de
 * catégories typographiques ; rien n'aidait à se retrouver. Le gris neutre
 * avec un filet entre les éléments fait le travail : la hiérarchie est dans
 * la position sur la page (paramètres, actions, admin), pas dans la couleur.
 *
 * Les sous-titres des tuiles restent génériques — la valeur courante d'un
 * réglage vit dans la sous-page. Seules les pastilles de la tuile Famille
 * (co-parents, doublons, invitation en cours) font exception : ce sont des
 * signaux d'attention, pas des valeurs, et elles n'ont de sens que depuis le
 * hub, là où l'on décide quoi ouvrir.
 */
export default async function Reglages() {
  const t = await getTranslations("Reglages");
  const account = await requireAccount();
  const [enfants, autresParents, lienEnCours] = await Promise.all([
    myChildren(account.id),
    coparents(account.id),
    hasPendingCoparentInvite(account.id),
  ]);
  const relecteur = estRelecteur(account);
  const doublons = duplicateChildren(enfants);

  return (
    <main className="apparait">
      <Titre sous={account.email}>{t("titre")}</Titre>

      {/* Hauts — paramètres qu'on ajuste le plus souvent.
          Sous-titres génériques partout ; les pastilles d'attention
          (co-parents, doublons, invitation) vivent sur la tuile Famille. */}
      <section aria-labelledby="reglages-parametres">
        <h2 id="reglages-parametres" className="sr-only">
          {t("sectionParametres")}
        </h2>
        <ul className="divide-y divide-[color:var(--color-trait)]">
          <Tuile
            href="/reglages/profil"
            titre={t("tuileProfilTitre")}
            sous={t("profilGenerique")}
          />

          <Tuile
            href="/reglages/enfants"
            titre={t("tuileFamilleTitre")}
            sous={t("tuileFamilleGenerique")}
            etat={
              <>
                {autresParents.length > 0 ? (
                  <span className="ml-2 inline-block rounded-[var(--radius-pilule)] bg-[color:var(--color-ambre-doux)] px-2 py-0.5 text-xs font-bold text-[color:var(--color-ambre)]">
                    {autresParents.length}{" "}
                    {autresParents.length === 1
                      ? t("tuileFamilleCoparentsUn")
                      : t("tuileFamilleCoparentsPluriel")}
                  </span>
                ) : null}
                {doublons.length > 0 ? (
                  <span className="ml-2 inline-block rounded-[var(--radius-pilule)] bg-[color:var(--color-corail-doux)] px-2 py-0.5 text-xs font-bold text-[color:var(--color-corail)]">
                    {doublons.length}{" "}
                    {doublons.length === 1
                      ? t("tuileFamilleDoublonsUn")
                      : t("tuileFamilleDoublonsPluriel")}
                  </span>
                ) : null}
                {lienEnCours ? (
                  <span className="ml-2 inline-block rounded-[var(--radius-pilule)] bg-[color:var(--color-ambre-doux)] px-2 py-0.5 text-xs font-bold text-[color:var(--color-ambre)]">
                    {t("attributLienEnCoursCourt")}
                  </span>
                ) : null}
              </>
            }
          />

          <Tuile
            href="/reglages/notifications"
            titre={t("tuileNotificationsTitre")}
            sous={t("tuileNotificationsGenerique")}
          />

          <Tuile
            href="/reglages/cercles"
            titre={t("tuileCerclesTitre")}
            sous={t("tuileCerclesGenerique")}
          />
        </ul>
      </section>

      {/* Actions — opérations qu'on fait rarement et qu'on ne règle pas.
          Titre invisible comme pour les paramètres : l'ordre suffit à les faire
          passer en second plan. */}
      <section aria-labelledby="reglages-actions" className="mt-8">
        <h2 id="reglages-actions" className="sr-only">
          {t("sectionActions")}
        </h2>

        <ul className="divide-y divide-[color:var(--color-trait)]">
          <Tuile
            href="/lieux"
            titre={t("tuileLieuxTitre")}
            sous={t("tuileLieuxGenerique")}
          />

          <Tuile
            href="/donnees"
            titre={t("tuileDonneesTitre")}
            sous={t("tuileDonneesGenerique")}
          />

          <Tuile
            href="/questions"
            titre={t("tuileQuestionsTitre")}
            sous={t("tuileQuestionsGenerique")}
          />

          <li>
            <a href="mailto:contact@allezou.ch" className="block active:translate-y-[1px]">
              <TuileBrute
                titre={t("tuileContactTitre")}
                sous="contact@allezou.ch"
              />
            </a>
          </li>
        </ul>

        {/* Supprimer et se déconnecter ne sont pas des réglages : deux liens
            texte en bas, hors liste, pour ne pas ressembler à des tuiles.
            Supprimer passe par sa page de confirmation (/reglages/supprimer). */}
        <div className="px-1 pb-2 pt-4 space-y-2 text-center">
          <Link
            href="/reglages/supprimer"
            className="block text-sm text-[color:var(--color-corail)] underline underline-offset-4 active:opacity-70"
          >
            {t("tuileSupprimerTitre")}
          </Link>
          <form action={seDeconnecter} className="contents">
            <button className="text-sm text-[color:var(--color-doux)] underline underline-offset-4 active:opacity-70">
              {t("deconnexion")}
            </button>
          </form>
        </div>
      </section>

      {/* Outils d'administration — en tout dernier : visibles uniquement par le
          contact qui relit l'agenda, jamais une destination depuis le hub. */}
      {relecteur ? (
        <section aria-labelledby="reglages-admin" className="mt-8">
          <h2
            id="reglages-admin"
            className="mb-2 text-xs font-bold uppercase tracking-wide text-[color:var(--color-doux)]"
          >
            {t("sectionAdmin")}
          </h2>
          <ul className="divide-y divide-[color:var(--color-trait)]">
            <Tuile
              href="/relecture"
              titre={t("tuileRelectureTitre")}
              sous={t("tuileRelectureGenerique")}
            />
            <Tuile
              href="/mesures"
              titre={t("tuileMesuresTitre")}
              sous={t("tuileMesuresGenerique")}
            />
          </ul>
        </section>
      ) : null}

      {/* Sur une page plus longue que l'écran, ce div ne fait rien ; sur une page courte, il
          pousse le menu vers le bas plutôt que de le laisser flotter au milieu de rien. */}
      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />
    </main>
  );
}

/**
 * Carte cliquable à fond gris uniforme, avec une ligne fine entre les éléments
 * (le filet vient du `divide-y` du parent, on n'en met pas ici). Le titre gras
 * annonce ce qu'on fait en cliquant, le sous-titre rappelle la catégorie du
 * réglage sans afficher sa valeur courante — la valeur vit dans la sous-page.
 * `etat` : pastilles d'attention optionnelles, affichées à la suite du
 * sous-titre.
 */
function Tuile({
  href,
  titre,
  sous,
  etat,
}: {
  href: string;
  titre: string;
  sous: string;
  etat?: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="block active:translate-y-[1px]">
        <TuileBrute titre={titre} sous={sous} etat={etat} />
      </Link>
    </li>
  );
}

/** Variante sans le wrapper Link (pour les liens externes comme mailto). */
function TuileBrute({
  titre,
  sous,
  etat,
}: {
  titre: string;
  sous: React.ReactNode;
  etat?: React.ReactNode;
}) {
  return (
    <div className="bg-[color:var(--color-fond)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block font-bold leading-tight">{titre}</span>
          <span className="mt-1 block text-sm leading-snug text-[color:var(--color-doux)]">
            <span>{sous}</span>
            {etat}
          </span>
        </div>
        <span aria-hidden className="shrink-0 text-xl leading-none text-[color:var(--color-doux)]">
          ›
        </span>
      </div>
    </div>
  );
}
