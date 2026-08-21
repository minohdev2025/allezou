import { getTranslations } from "next-intl/server";

import { myChildren } from "@/lib/children";
import { lireSuite, requireAccount } from "@/lib/session";
import { ajouterEnfant, terminerBienvenue } from "../../actions";
import { Alerte, Bouton, Carte, Champ, IconePlus, Pastille, Titre, teinte } from "../../ui";

export default async function Enfants({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const account = await requireAccount();
  const { erreur } = await searchParams;
  const [enfants, suite, t] = await Promise.all([
    myChildren(account.id),
    lireSuite(),
    getTranslations("BienvenueEnfants"),
  ]);

  // Qui arrive par le lien d'un autre parent va recevoir ses enfants à l'étape suivante.
  // Le lui taire, c'est le laisser taper « Léa » ici et découvrir deux Léa juste après.
  const parLienDeCoparent = suite?.startsWith("/parent/") ?? false;

  return (
    <main className="apparait">
      <Titre emoji="🧒" sous={t("sousTitre")}>
        {t("titre")}
      </Titre>

      {erreur ? <Alerte ton="erreur">{t("erreur")}</Alerte> : null}

      {parLienDeCoparent ? <Alerte>{t("viaCoparent")}</Alerte> : null}

      {enfants.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {enfants.map((enfant) => (
            <Pastille key={enfant.id} couleur={teinte(enfant.id)}>
              {enfant.firstName}
            </Pastille>
          ))}
        </div>
      ) : null}

      <Carte accent="ambre" className="mb-6">
        <form action={ajouterEnfant} className="space-y-4">
          <Champ label={t("label")} name="prenom" required maxLength={40} placeholder="Matéo" />
          <Bouton type="submit" variante="second">
            <IconePlus className="h-5 w-5" />
            {t("ajouter")}
          </Bouton>
        </form>
      </Carte>

      {/*
        Un formulaire et non un lien : c'est ici que se consomme le témoin de reprise, et un
        témoin ne s'efface que depuis une action. Quelqu'un venu suivre une invitation la
        retrouve donc à la dernière marche, au lieu d'atterrir sur une liste de cercles vide.
      */}
      <form action={terminerBienvenue}>
        <Bouton type="submit">{enfants.length > 0 ? t("terminer") : t("passer")}</Bouton>
      </form>
    </main>
  );
}
