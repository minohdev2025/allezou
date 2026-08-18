import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { CATEGORIES_LIEU, EMOJIS_CATEGORIE } from "@/lib/categories-lieu";
import { requireAccount } from "@/lib/session";
import { ajouterLieu } from "../../actions";
import { Alerte, Bouton, Carte, Champ, Titre } from "../../ui";
import { ChoisirLaPosition } from "./position-client";

export default async function NouveauLieu({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  await requireAccount();
  const t = await getTranslations("SortirLieu");
  const tE = await getTranslations("Etiquettes");
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
          <fieldset>
            <legend className="mb-2 font-bold">{t("typeLegend")}</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES_LIEU.map((categorie) => (
                <label key={categorie}>
                  <input
                    type="radio"
                    name="categorie"
                    value={categorie}
                    required
                    className="peer sr-only"
                  />
                  <span className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-pilule)] px-3.5 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-vert)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                    {EMOJIS_CATEGORIE[categorie]} {tE(`categorie.${categorie}`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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
          <ChoisirLaPosition
            cleApi={process.env.GOOGLE_MAPS_API_KEY ?? null}
            mapId={process.env.GOOGLE_MAPS_MAP_ID ?? null}
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
