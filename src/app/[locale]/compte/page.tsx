import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LANGUES, routing } from "@/i18n/routing";

import { myChildren } from "@/lib/children";
import { mesCles } from "@/lib/passkeys";
import { estRelecteur, requireAccount } from "@/lib/session";
import { localeSure } from "@/lib/traduire";
import {
  accepterCoparent,
  ajouterEnfantCompte,
  changerLangue,
  changerNom,
  enregistrerCleAcces,
  inviterAutreParent,
  oublierCleAcces,
  preparerCleAcces,
  renommerEnfant,
  retirerEnfant,
  seDeconnecter,
  supprimerCompte,
} from "../actions";
import { AjouterCleAcces } from "../passkey-client";
import { CodeQR } from "../qr";
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  LienBouton,
  Navigation,
  Titre,
  jourCourt,
  teinte,
} from "../ui";

export default async function Compte({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; coparent?: string; rejoindre?: string }>;
}) {
  const t = await getTranslations("Compte");
  const locale = localeSure(await getLocale());
  const account = await requireAccount();
  const { erreur, coparent, rejoindre } = await searchParams;
  const [enfants, cles] = await Promise.all([myChildren(account.id), mesCles(account.id)]);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const relecteur = estRelecteur(account);

  return (
    <main className="apparait">
      <Titre emoji="🙂" sous={account.email}>
        {t("titre")}
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">
          {erreur === "confirmation"
            ? t("erreurs.confirmation", { mot: "SUPPRIMER" })
            : t.has(`erreurs.${erreur}`)
              ? t(`erreurs.${erreur}`)
              : t("erreurGenerique")}
        </Alerte>
      ) : null}

      {coparent ? (
        <Alerte ton="succes">
          <strong className="mb-1 block">{t("coparentTitre")}</strong>
          <p className="mb-2 text-sm leading-snug">{t("coparentTexte")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <CodeQR valeur={`${appUrl}/compte?rejoindre=${coparent}`} />
            <code className="min-w-0 flex-1 break-all rounded-xl bg-[color:var(--color-surface)] p-3 text-sm">
              {appUrl}/compte?rejoindre={coparent}
            </code>
          </div>
        </Alerte>
      ) : null}

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

      <Carte className="mb-5" accent="bleu">
        <form action={changerNom} className="space-y-4">
          <Champ
            label={t("nomLabel")}
            aide={t("nomAide")}
            name="nom"
            defaultValue={account.displayName}
            required
            maxLength={60}
          />
          <Bouton variante="second">{t("enregistrer")}</Bouton>
        </form>
      </Carte>

      <Carte className="mb-5" accent="vert">
        <h2 className="titre mb-2 text-lg font-bold">{t("langueTitre")}</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("langueTexte")}
        </p>
        <form action={changerLangue} className="flex flex-wrap gap-2">
          {routing.locales.map((langue) =>
            langue === account.locale ? (
              <span
                key={langue}
                aria-current="true"
                className="rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                style={{ background: "var(--color-vert-doux)", color: "var(--color-vert)" }}
              >
                {LANGUES[langue]}
              </span>
            ) : (
              <button
                key={langue}
                name="langue"
                value={langue}
                className="rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
              >
                {LANGUES[langue]}
              </button>
            ),
          )}
        </form>
      </Carte>

      <Carte className="mb-5" accent="violet">
        <h2 className="titre mb-3 text-lg font-bold">{t("enfantsTitre")}</h2>

        <ul className="mb-4 space-y-2">
          {enfants.map((enfant) => (
            <li key={enfant.id} className="flex items-center gap-2">
              {/*
                `min-w-0` sur le formulaire, pas seulement sur le champ : la largeur
                intrinsèque d'un champ (size=20) remonte en minimum à travers un flex
                imbriqué, et sur 360 px le rang débordait — le ✕ vivait hors de l'écran.
              */}
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
                    background: `var(--color-${teinte(enfant.id)}-doux)`,
                    color: `var(--color-${teinte(enfant.id)})`,
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

      <Carte className="mb-5" accent="ambre">
        <h2 className="titre mb-2 text-lg font-bold">{t("autreParentTitre")}</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("autreParentTexte")}
        </p>

        <form action={inviterAutreParent} className="mb-4">
          <Bouton variante="second">{t("creerLien")}</Bouton>
        </form>

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

      <Carte className="mb-5" accent="vert">
        <h2 className="titre mb-2 text-lg font-bold">{t("passkeyTitre")}</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("passkeyTexte")}
        </p>

        {cles.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {cles.map((cle) => (
              <li
                key={cle.id}
                className="flex items-center gap-3 rounded-2xl bg-[color:var(--color-fond)] px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-bold">{cle.label}</span>
                  <span className="text-[color:var(--color-doux)]">
                    {cle.lastUsedAt
                      ? t("dernier", {
                          date: `${jourCourt(cle.lastUsedAt, locale).nombre} ${jourCourt(cle.lastUsedAt, locale).mois}`,
                        })
                      : t("jamaisUtilise")}
                  </span>
                </span>
                <form action={oublierCleAcces}>
                  <input type="hidden" name="cle" value={cle.id} />
                  <button
                    className="shrink-0 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                    style={{
                      background: "var(--color-corail-doux)",
                      color: "var(--color-corail)",
                    }}
                  >
                    {t("oublier")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        <AjouterCleAcces
          preparer={preparerCleAcces}
          enregistrer={enregistrerCleAcces}
          nomParDefaut={t("appareilParDefaut")}
        />
      </Carte>

      {/*
        Les réglages vivaient sous la liste des cercles, où rien ne laissait deviner qu'ils
        s'y trouvaient. Ils sont ici, derrière l'onglet qui porte leur nom.
      */}
      <div className="mb-5 space-y-3">
        <LienBouton href="/reglages">{t("lienNotifications")}</LienBouton>
        <LienBouton href="/lieux">{t("lienLieux")}</LienBouton>
        {relecteur ? <LienBouton href="/relecture">{t("lienRelecture")}</LienBouton> : null}
        {relecteur ? <LienBouton href="/mesures">{t("lienMesures")}</LienBouton> : null}
      </div>

      <Carte accent="corail">
        <h2 className="titre mb-2 text-lg font-bold">{t("supprimerTitre")}</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("supprimerTexte")}
        </p>

        <form action={supprimerCompte} className="space-y-3">
          <Champ
            label={t("confirmerLabel", { mot: "SUPPRIMER" })}
            name="confirmation"
            autoComplete="off"
            placeholder="SUPPRIMER"
          />
          <Bouton variante="second">{t("supprimerBouton")}</Bouton>
        </form>
      </Carte>

      <div className="mt-10 space-y-4 text-center text-sm">
        <p>
          <Link
            href="/donnees"
            className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            {t("donneesLien")}
          </Link>
        </p>
        <p>
          <a
            href="mailto:contact@allezou.ch"
            className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            {t("nousEcrire")}
          </a>
        </p>
        <form action={seDeconnecter}>
          <button className="text-[color:var(--color-doux)] underline underline-offset-4">
            {t("deconnexion")}
          </button>
        </form>
      </div>

      <Navigation actif="vous" />
    </main>
  );
}
