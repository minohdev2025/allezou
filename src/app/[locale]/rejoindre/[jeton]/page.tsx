import { getTranslations } from "next-intl/server";

import { circleNameForInvite } from "@/lib/circles";
import { currentAccount } from "@/lib/session";
import { demanderAdhesion } from "../../actions";
import { Alerte, Bouton, Carte, LienBouton, Titre } from "../../ui";

/**
 * L'écran qu'on voit en suivant un lien reçu par message.
 *
 * Il nomme le cercle, et il le fait avant la connexion. Deux raisons, et la seconde compte
 * autant que la première.
 *
 * La première : celui qui arrive ici a reçu un lien d'un parent qu'il connaît, mais l'écran
 * lui répondait « quelqu'un vous a transmis une invitation » et lui demandait son adresse
 * électronique pour en savoir plus. On lui demandait de commencer par faire confiance.
 *
 * La seconde : un lien qui ne fonctionne plus se disait beaucoup trop tard. Le visiteur
 * était renvoyé vers la connexion, saisissait son adresse, attendait son courriel, cliquait,
 * et apprenait alors seulement que l'invitation avait expiré. Elle se lit maintenant tout de
 * suite, sans compte et sans attente.
 *
 * Le prix de ce choix est une page de plus avant le formulaire pour qui n'a pas de compte.
 * Elle porte le nom du cercle et ce qui va se passer : ce n'est pas une page d'attente, c'est
 * la réponse à la question qu'on se pose en cliquant.
 */
export default async function Rejoindre({
  params,
  searchParams,
}: {
  params: Promise<{ jeton: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { jeton } = await params;
  const { erreur } = await searchParams;

  const [account, nomCercle, t] = await Promise.all([
    currentAccount(),
    circleNameForInvite(jeton),
    getTranslations("Rejoindre"),
  ]);

  // Révoquée, expirée, épuisée ou jamais existé : une seule réponse pour les quatre. Qui
  // essaie des jetons au hasard n'apprend pas lesquels ont servi.
  if (!nomCercle) {
    return (
      <main className="apparait">
        <Titre emoji="🌥️" sous={t("expireeSous")}>
          {t("expireeTitre")}
        </Titre>
        <LienBouton href={account ? "/maintenant" : "/"} variante="principal">
          {account ? t("expireeRetour") : t("expireeDecouvrir")}
        </LienBouton>
      </main>
    );
  }

  return (
    <main className="apparait">
      <Titre emoji="✉️" sous={t("titreSous", { nomCercle })}>
        {t("titre")}
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">
          {t.has(`erreurs.${erreur}`) ? t(`erreurs.${erreur}`) : t("erreurGenerique")}
        </Alerte>
      ) : null}

      <Carte className="mb-6" accent="bleu">
        <p className="leading-snug">{t("explication")}</p>
      </Carte>

      {account ? (
        <>
          <form action={demanderAdhesion} className="mb-4">
            <input type="hidden" name="jeton" value={jeton} />
            <Bouton type="submit">{t("demanderBouton")}</Bouton>
          </form>
          <LienBouton href="/maintenant">{t("pasMaintenant")}</LienBouton>
        </>
      ) : (
        <>
          {/*
            `premiere` parce qu'on suit une invitation : neuf fois sur dix, c'est une
            arrivée. `suite` ramène ici après le lien reçu par courriel — sans lui, on
            revenait sur « Aucun cercle pour l'instant », l'invitation perdue en route.
          */}
          <LienBouton
            href={`/connexion?premiere=1&suite=/rejoindre/${jeton}`}
            variante="principal"
            className="mb-4"
          >
            {t("continuerBouton")}
          </LienBouton>
          <p className="text-center text-sm leading-snug text-[color:var(--color-doux)]">
            {t("sansMotDePasse")}
          </p>
        </>
      )}
    </main>
  );
}
