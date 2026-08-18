import { getTranslations } from "next-intl/server";

import { requireAccount } from "@/lib/session";
import { enregistrerNom } from "../actions";
import { Alerte, Bouton, Carte, Champ, Titre } from "../ui";

export default async function Bienvenue({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  await requireAccount();
  const { erreur } = await searchParams;
  const t = await getTranslations("Bienvenue");

  return (
    <main className="apparait">
      <Titre emoji="👋" sous={t("sousTitre")}>
        {t("titre")}
      </Titre>

      {erreur ? <Alerte ton="erreur">{t("erreur")}</Alerte> : null}

      <Carte accent="bleu">
        <form action={enregistrerNom} className="space-y-5">
          <Champ
            label={t("label")}
            aide={t("aide")}
            name="nom"
            required
            maxLength={60}
            autoComplete="off"
            placeholder={t("placeholder")}
          />
          <Bouton type="submit">{t("continuer")}</Bouton>
        </form>
      </Carte>
    </main>
  );
}
