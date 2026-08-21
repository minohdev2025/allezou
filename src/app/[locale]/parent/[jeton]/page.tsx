import { getTranslations } from "next-intl/server";

import { parentNameForInvite } from "@/lib/children";
import { currentAccount } from "@/lib/session";
import { accepterCoparent } from "../../actions";
import { Alerte, Bouton, Carte, LienBouton, Titre } from "../../ui";

/**
 * L'écran qu'on voit en suivant le lien de l'autre parent.
 *
 * Ce lien menait auparavant sur l'écran du compte, derrière la connexion. Or celui qui le
 * reçoit n'a le plus souvent pas encore de compte : il arrivait sur le formulaire de
 * connexion sans savoir de quoi il s'agissait, et le jeton se perdait en route — la
 * destination gardée le temps du courriel n'acceptait que les liens de cercle. Il fallait
 * retourner dans la messagerie et recliquer, en espérant.
 *
 * Comme pour l'invitation d'un cercle, la page nomme la personne avant la connexion. Celui
 * qui arrive ici a reçu ce lien de quelqu'un qu'il connaît ; lui demander son adresse
 * électronique d'abord, c'est lui demander de commencer par faire confiance.
 */
export default async function InvitationParent({
  params,
  searchParams,
}: {
  params: Promise<{ jeton: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { jeton } = await params;
  const { erreur } = await searchParams;

  const [account, nomDuParent, t] = await Promise.all([
    currentAccount(),
    parentNameForInvite(jeton),
    getTranslations("Parent"),
  ]);

  // Révoqué, expiré, déjà servi ou jamais existé : une seule réponse pour les quatre.
  if (!nomDuParent) {
    return (
      <main className="apparait">
        <Titre emoji="🌥️" sous={t("expireeSous")}>
          {t("expireeTitre")}
        </Titre>
        <LienBouton href={account ? "/compte" : "/"} variante="principal">
          {account ? t("expireeRetour") : t("expireeDecouvrir")}
        </LienBouton>
      </main>
    );
  }

  return (
    <main className="apparait">
      <Titre emoji="👨‍👩‍👧" sous={t("titreSous", { nom: nomDuParent })}>
        {t("titre")}
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">
          {t.has(`erreurs.${erreur}`) ? t(`erreurs.${erreur}`) : t("erreurGenerique")}
        </Alerte>
      ) : null}

      <Carte className="mb-6" accent="ambre">
        {/*
          Le nom reste en position de sujet : « que {nom} » donnerait « que Alice » là où le
          français écrit « qu'Alice », et un prénom saisi par un parent peut commencer par
          n'importe quelle lettre.
        */}
        <p className="mb-3 leading-snug">{t("explication", { nom: nomDuParent })}</p>
        <p className="leading-snug text-[color:var(--color-doux)]">{t("comptesSepares")}</p>
      </Carte>

      {account ? (
        <>
          <form action={accepterCoparent} className="mb-4">
            <input type="hidden" name="jeton" value={jeton} />
            <Bouton type="submit">{t("accepter")}</Bouton>
          </form>
          <LienBouton href="/maintenant">{t("pasMaintenant")}</LienBouton>
        </>
      ) : (
        <>
          {/*
            `premiere` parce qu'on suit une invitation : neuf fois sur dix, c'est une
            arrivée. `suite` ramène ici après le lien reçu par courriel.
          */}
          <LienBouton
            href={`/connexion?premiere=1&suite=/parent/${jeton}`}
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
