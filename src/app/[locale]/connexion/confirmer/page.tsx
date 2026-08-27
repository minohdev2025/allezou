import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { COOKIE_CONFIRMATION } from "@/lib/session";
import { verifierLien } from "@/lib/auth";
import { Carte } from "../../ui";
import { confirmerConnexion } from "../../actions";
import { BoutonConfirmer } from "./bouton-confirmer";

/**
 * La confirmation humaine avant la consommation du lien.
 *
 * Le clic sur le lien reçu par courriel ne consomme plus rien — il pose un
 * témoin COOKIE_CONFIRMATION et redirige ici. Cette page demande à l'humain
 * de cliquer explicitement sur "Me connecter". Un scanner qui pré-clique le
 * lien du courriel (antispam d'entreprise, pré-clic de webmail) atterrit ici
 * aussi, mais ne clique pas sur le bouton — il a déjà extrait ce qu'il
 * voulait du HTML de la page de connexion.
 *
 * Trois protections superposées :
 *   1. Le clic explicite — un scanner naïf s'arrête là.
 *   2. Le bouton est désactivé 3 secondes après l'arrivée (BoutonConfirmer) —
 *      un scanner très rapide qui essaierait quand même est bloqué.
 *   3. La server action revérifie le jeton, son expiration et qu'il n'a pas
 *      déjà été consommé — un cookie copié d'un autre onglet ne suffit pas.
 */

export default async function Confirmer({
  searchParams,
}: {
  searchParams: Promise<{ jeton?: string }>;
}) {
  const { jeton } = await searchParams;

  // Le jeton arrive dans l'URL (côté serveur) et dans le cookie (côté client
  // pour la server action). On lit le cookie d'abord — c'est ce qui a été posé
  // par le route handler, et c'est le seul qu'on peut comparer au témoin réel.
  const cookieJeton = (await cookies()).get(COOKIE_CONFIRMATION)?.value;
  if (!cookieJeton || cookieJeton !== jeton) {
    redirect("/connexion?erreur=lien_inconnu");
  }

  // Vérification du jeton sans le consommer. Si expiré ou déjà consommé,
  // on redirige vers la bonne erreur.
  const result = await verifierLien(jeton);
  if (!result.ok) {
    redirect(`/connexion?erreur=${result.reason}`);
  }

  const t = await getTranslations("Confirmation");

  return (
    <main className="apparait">
      <header className="mb-7 text-center">
        <div aria-hidden className="mb-3 text-5xl leading-none">🌳</div>
        <h1 className="text-3xl font-bold tracking-tight">{t("titre")}</h1>
      </header>

      <Carte className="mb-5">
        <p className="mb-1 font-bold">
          {result.isNew
            ? t("sousTitreNouveau", { email: result.email })
            : t("sousTitreConnecte", { email: result.email })}
        </p>
        <p className="mb-5 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("intro")}
        </p>

        <form action={confirmerConnexion}>
          <input type="hidden" name="jeton" value={jeton} />
          <BoutonConfirmer />
        </form>

        <p className="mt-3 text-center text-xs text-[color:var(--color-doux)]">
          {t("noteNotifications")}
        </p>
      </Carte>
    </main>
  );
}
