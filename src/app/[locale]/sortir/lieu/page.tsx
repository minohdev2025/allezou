import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { requireAccount } from "@/lib/session";
import { ajouterLieu } from "../../actions";
import { Alerte, Bouton, Carte, Champ, Titre } from "../../ui";

export default async function NouveauLieu({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  await requireAccount();
  const t = await getTranslations("SortirLieu");
  const { erreur } = await searchParams;

  return (
    <main className="apparait">
      <Titre emoji="📍" sous={t("sousTitre")}>
        {t("titre")}
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">
          {erreur === "adresse_invalide"
            ? t("erreurs.adresse_invalide")
            : erreur === "position_invalide"
              ? t("erreurs.position_invalide")
              : t("erreurGenerique")}
        </Alerte>
      ) : null}

      <Carte accent="violet">
        <form action={ajouterLieu} className="space-y-5">
          <Champ
            label={t("labelNom")}
            name="nom"
            required
            maxLength={80}
            placeholder={t("placeholderNom")}
          />
          <Champ
            label={t("labelCommune")}
            name="commune"
            maxLength={60}
            placeholder={t("placeholderCommune")}
          />
          <Champ
            label={t("labelAdresse")}
            aide={t("aideAdresse")}
            name="adresse"
            maxLength={160}
            placeholder={t("placeholderAdresse")}
          />
          <Bouton type="submit">{t("ajouter")}</Bouton>
        </form>
      </Carte>

      <p className="mt-7 text-center">
        <Link href="/sortir" className="text-[color:var(--color-doux)] underline underline-offset-4">
          {t("retour")}
        </Link>
      </p>
    </main>
  );
}
