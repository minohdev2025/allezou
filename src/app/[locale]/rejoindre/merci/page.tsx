import { getTranslations } from "next-intl/server";

import { requireAccount } from "@/lib/session";
import { LienBouton, Titre } from "../../ui";

export default async function Merci() {
  await requireAccount();
  const t = await getTranslations("RejoindreMerci");

  return (
    <main className="apparait">
      <Titre emoji="🎉" sous={t("sousTitre")}>
        {t("titre")}
      </Titre>
      <LienBouton href="/maintenant" variante="principal">
        {t("continuerBouton")}
      </LienBouton>
    </main>
  );
}
