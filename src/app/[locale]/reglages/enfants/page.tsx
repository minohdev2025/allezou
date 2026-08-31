import { getLocale, getTranslations } from "next-intl/server";

import { coparents, duplicateChildren, hasPendingCoparentInvite, myChildren } from "@/lib/children";
import { requireAccount } from "@/lib/session";
import { localeSure } from "@/lib/traduire";
import {
  accepterCoparent,
  ajouterEnfantCompte,
  annulerLienCoparent,
  inviterAutreParent,
  oublierCleAcces,
  preparerCleAcces,
  enregistrerCleAcces,
  renommerEnfant,
  retirerEnfant,
  reunirEnfants,
  separerDuCoparent,
} from "../../actions";
import { AjouterCleAcces } from "../../passkey-client";
import { Bouton, Carte, Champ, Navigation } from "../../ui";
import { EnteteReglages } from "../_entete";

/**
 * Tout ce qui touche la famille : vos enfants, les doublons à fusionner,
 * la coparentalité (lier son compte à celui de l'autre parent), et les
 * clés d'accès. Les quatre ensemble parce qu'elles forment un même sujet
 * — qui fait partie de votre famille, et comment l'app vous reconnaît.
 *
 * On duplique ici le code qui vivait dans `/compte` : c'est volontaire,
 * ce seront ensuite les seuls écrans qui le possèdent.
 */
export default async function ReglagesEnfants({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; rejoindre?: string }>;
}) {
  const t = await getTranslations("Compte");
  const locale = localeSure(await getLocale());
  const account = await requireAccount();
  const { rejoindre } = await searchParams;
  const [enfants, autresParents, lienEnCours] = await Promise.all([
    myChildren(account.id),
    coparents(account.id),
    hasPendingCoparentInvite(account.id),
  ]);
  const doublons = duplicateChildren(enfants);

  return (
    <main className="apparait">
      <EnteteReglages titre={t("enfantsTitre")} />

      {rejoindre ? (
        <Carte className="mb-5" accent="ambre">
          <h2 className="titre mb-2 text-lg font-bold">{t("rejoindreTitre")}</h2>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("rejoindreTexte")}
          </p>
          <form action={accepterCoparent}>
            <input type="hidden" name="jeton" value={rejoindre} />
            <Bouton>{t("accepter")}</Bouton>
          </form>
        </Carte>
      ) : null}

      <Carte accent="violet" className="mb-5">
        <ul className="mb-4 space-y-2">
          {enfants.map((enfant) => (
            <li key={enfant.id} className="flex items-center gap-2">
              <form action={renommerEnfant} className="flex min-w-0 flex-1 gap-2">
                <input type="hidden" name="enfant" value={enfant.id} />
                <input
                  name="prenom"
                  defaultValue={enfant.firstName}
                  maxLength={40}
                  className="min-w-0 flex-1 rounded-xl bg-[color:var(--color-fond)] px-3 py-2 ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-violet)]"
                />
                <button
                  className="shrink-0 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                  style={{
                    background: "var(--color-violet-doux)",
                    color: "var(--color-violet)",
                  }}
                >
                  {t("renommer")}
                </button>
              </form>
              <form action={retirerEnfant}>
                <input type="hidden" name="enfant" value={enfant.id} />
                <button
                  title={t("retirer")}
                  className="rounded-[var(--radius-pilule)] px-3 py-2 text-sm"
                  style={{ color: "var(--color-doux)" }}
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>

        <form action={ajouterEnfantCompte} className="space-y-3">
          <Champ
            label={t("ajouterEnfantLabel")}
            name="prenom"
            required
            maxLength={40}
            placeholder={t("ajouterEnfantPlaceholder")}
          />
          <Bouton variante="second">{t("ajouter")}</Bouton>
        </form>
      </Carte>

      {doublons.length > 0 ? (
        <Carte accent="rose" className="mb-5">
          <h2 className="titre mb-2 text-lg font-bold">{t("doublonsTitre")}</h2>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("doublonsTexte")}
          </p>

          <ul className="space-y-2">
            {doublons.map((groupe) => (
              <li key={groupe[0].id}>
                <form
                  action={reunirEnfants}
                  className="flex items-center gap-3 rounded-2xl bg-[color:var(--color-fond)] px-4 py-2.5"
                >
                  <input type="hidden" name="garder" value={groupe[0].id} />
                  {groupe.slice(1).map((enfant) => (
                    <input key={enfant.id} type="hidden" name="absorber" value={enfant.id} />
                  ))}
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-bold">{groupe[0].firstName}</span>
                    <span className="text-[color:var(--color-doux)]">
                      {t("doublonsFiches", { count: groupe.length })}
                    </span>
                  </span>
                  <button
                    className="shrink-0 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                    style={{ background: "var(--color-rose-doux)", color: "var(--color-rose)" }}
                  >
                    {t("doublonsBouton")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      <Carte accent="ambre" className="mb-5">
        <h2 className="titre mb-2 text-lg font-bold">{t("autreParentTitre")}</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("autreParentTexte")}
        </p>

        {autresParents.length > 0 ? (
          <>
            <ul className="mb-3 space-y-2">
              {autresParents.map((parent) => (
                <li
                  key={parent.id}
                  className="flex items-center gap-3 rounded-2xl bg-[color:var(--color-fond)] px-4 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-sm font-bold">{parent.displayName}</span>
                  <form action={separerDuCoparent}>
                    <input type="hidden" name="parent" value={parent.id} />
                    <button
                      className="shrink-0 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                      style={{ background: "var(--color-corail-doux)", color: "var(--color-corail)" }}
                    >
                      {t("separer")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
              {t("separerAide")}
            </p>
          </>
        ) : null}

        <form action={inviterAutreParent} className="mb-4">
          <Bouton variante="second">{t("creerLien")}</Bouton>
        </form>

        {lienEnCours ? (
          <form action={annulerLienCoparent} className="mb-4">
            <Bouton variante="discret">{t("coparentAnnuler")}</Bouton>
          </form>
        ) : null}

        <form action={accepterCoparent} className="space-y-3">
          <Champ
            label={t("recuLienLabel")}
            aide={t("recuLienAide")}
            name="jeton"
            placeholder={t("recuLienPlaceholder")}
          />
          <Bouton variante="second">{t("rejoindreBouton")}</Bouton>
        </form>
      </Carte>

      <CartePasskey cles_locale={locale} />
      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />

    </main>
  );
}

/**
 * Carte des clés d'accès (passkeys). Sortie ici pour ne pas alourdir la
 * sous-page principale — elle a sa propre logique client.
 */
async function CartePasskey({ cles_locale: _locale }: { cles_locale: ReturnType<typeof localeSure> }) {
  const t = await getTranslations("Compte");
  const account = await requireAccount();
  const { jourCourt } = await import("../../ui");
  const cles = await import("@/lib/passkeys").then((m) => m.mesCles(account.id));

  return (
    <Carte accent="vert">
      <h2 className="titre mb-2 text-lg font-bold">{t("passkeyTitre")}</h2>
      <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
        {t("passkeyTexte")}
      </p>

      {cles.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {cles.map((cle) => {
            const date = cle.lastUsedAt ? jourCourt(cle.lastUsedAt, _locale) : null;
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
  );
}
