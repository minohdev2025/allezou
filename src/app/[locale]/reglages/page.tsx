import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import {
  coparents,
  duplicateChildren,
  hasPendingCoparentInvite,
  myChildren,
} from "@/lib/children";
import { estRelecteur, requireAccount } from "@/lib/session";
import { alerteInscriptionActive, mesMotsCles, prefsParCercle } from "@/lib/notifications";
import { mesCles } from "@/lib/passkeys";
import { seDeconnecter } from "../actions";
import { Navigation, Titre } from "../ui";

/**
 * Page d'accueil des réglages. Tout doit être lisible sans scroller : trois
 * grandes tuiles en haut pour les paramètres courants, puis en bas les actions
 * secondaires (lieux, données, aide, contact, déconnexion) et — visible
 * uniquement pour le contact qui relit — les outils d'administration.
 *
 * On avait essayé un code couleur par tuile, puis plusieurs étages de
 * catégories typographiques ; rien n'aidait à se retrouver. Le gris neutre
 * avec un filet entre les éléments fait le travail : la hiérarchie est dans
 * la position sur la page (paramètres, admin, actions), pas dans la couleur.
 */
export default async function Reglages() {
  const t = await getTranslations("Reglages");
  const account = await requireAccount();
  const [
    enfants,
    cles,
    autresParents,
    lienEnCours,
    cercles,
    motsCles,
    surInscription,
  ] = await Promise.all([
    myChildren(account.id),
    mesCles(account.id),
    coparents(account.id),
    hasPendingCoparentInvite(account.id),
    prefsParCercle(account.id),
    mesMotsCles(account.id),
    alerteInscriptionActive(account.id),
  ]);
  const relecteur = estRelecteur(account);
  const doublons = duplicateChildren(enfants);

  return (
    <main className="apparait">
      <Titre sous={account.email}>{t("titre")}</Titre>

      {/* Hauts — paramètres qu'on ajuste le plus souvent.
          Grille 2 colonnes : assez large pour qu'un titre tienne, assez
          étroite pour que les libellés génériques ne débordent pas. */}
      <section aria-labelledby="reglages-parametres">
        <h2 id="reglages-parametres" className="sr-only">
          {t("sectionParametres")}
        </h2>
        <ul className="divide-y divide-[color:var(--color-trait)]">
          <Tuile
            href="/reglages/profil"
            titre={t("tuileProfilTitre")}
            sous={
              <>
                <span>{t("profilGenerique")}</span>
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
            sous={
              <>
                <span>
                  {cles.length > 0 ? t("tuilePushActif") : t("tuilePushInactif")}
                </span>
                <span className="ml-2 text-[color:var(--color-doux)]">
                  · {motsCles.length} {t("tuileMots")}
                </span>
                <span className="ml-2 text-[color:var(--color-doux)]">
                  · {surInscription ? t("etatActif") : t("etatCoupe")}
                </span>
              </>
            }
          />

          <Tuile
            href="/reglages/cercles"
            titre={t("tuileCerclesTitre")}
            sous={
              <>
                <span>{t("tuileCerclesGenerique")}</span>
                <span className="ml-2 text-[color:var(--color-doux)]">
                  · {cercles.length}{" "}
                  {cercles.length === 1
                    ? t("tuileCerclesUnSingulier")
                    : t("tuileCerclesUnPluriel")}
                </span>
              </>
            }
          />
        </ul>
      </section>

      {/* Outils d'administration — réservés au contact qui relit l'agenda. */}
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
              sous={<span>{t("tuileRelectureGenerique")}</span>}
            />
            <Tuile
              href="/mesures"
              titre={t("tuileMesuresTitre")}
              sous={<span>{t("tuileMesuresGenerique")}</span>}
            />
          </ul>
        </section>
      ) : null}

      {/* Actions — opérations qu'on fait rarement et qu'on ne règle pas. */}
      <section aria-labelledby="reglages-actions" className="mt-8">
        <h2
          id="reglages-actions"
          className="mb-2 text-xs font-bold uppercase tracking-wide text-[color:var(--color-doux)]"
        >
          {t("sectionActions")}
        </h2>

        <Tuile
          href="/lieux"
          titre={t("tuileLieuxTitre")}
          sous={<span>{t("tuileLieuxGenerique")}</span>}
        />

        <Tuile
          href="/donnees"
          titre={t("tuileDonneesTitre")}
          sous={<span>{t("tuileDonneesGenerique")}</span>}
        />

        <Tuile
          href="/questions"
          titre={t("tuileQuestionsTitre")}
          sous={<span>{t("tuileQuestionsGenerique")}</span>}
        />

        <a href="mailto:contact@allezou.ch" className="block active:translate-y-[1px]">
          <TuileBrute
            titre={t("tuileContactTitre")}
            sous={<span>contact@allezou.ch</span>}
          />
        </a>

        <Tuile
          href="/reglages/supprimer"
          titre={t("tuileSupprimerTitre")}
          sous={<span>{t("tuileSupprimerGenerique")}</span>}
        />

        <form action={seDeconnecter} className="px-1 pb-2 pt-3 text-center">
          <button className="text-sm text-[color:var(--color-doux)] underline underline-offset-4 active:opacity-70">
            {t("deconnexion")}
          </button>
        </form>
      </section>

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
 */
function Tuile({
  href,
  titre,
  sous,
}: {
  href: string;
  titre: string;
  sous: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="block active:translate-y-[1px]">
        <TuileBrute titre={titre} sous={sous} />
      </Link>
    </li>
  );
}

/** Variante sans le wrapper Link (pour les liens externes comme mailto). */
function TuileBrute({ titre, sous }: { titre: string; sous: React.ReactNode }) {
  return (
    <div className="bg-[color:var(--color-fond)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block font-bold leading-tight">{titre}</span>
          <span className="mt-1 block text-sm leading-snug text-[color:var(--color-doux)]">
            {sous}
          </span>
        </div>
        <span aria-hidden className="shrink-0 text-xl leading-none text-[color:var(--color-doux)]">
          ›
        </span>
      </div>
    </div>
  );
}
