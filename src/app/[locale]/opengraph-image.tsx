import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";

import { localeSure } from "@/lib/traduire";
import { Marque } from "../marque";

/**
 * L'image qui apparaît quand on colle le lien dans WhatsApp.
 *
 * Dessinée ici plutôt qu'embarquée en binaire, comme l'icône : changer la couleur ou le mot
 * se fait dans un fichier qu'on relit en diff.
 *
 * C'est un lien qui circule entre parents, par message, et souvent avant qu'on ait rien
 * expliqué. L'aperçu doit donc porter le nom et la promesse, pas une capture d'écran de
 * l'application que personne ne déchiffrera sur une vignette.
 */
export const alt = "Allezou : pour que nos enfants se retrouvent dehors";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // Le segment est une chaîne quelconque ; une valeur inconnue dessine l'image en français.
  const t = await getTranslations({ locale: localeSure(locale), namespace: "Metadata" });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#17784f",
          color: "#fffcf5",
          fontSize: 44,
          textAlign: "center",
          padding: "0 90px",
        }}
      >
        <Marque taille={150} />
        <div style={{ fontSize: 104, fontWeight: 700, marginTop: 24 }}>Allezou</div>
        <div style={{ marginTop: 18, opacity: 0.92 }}>{t("accroche")}</div>
      </div>
    ),
    size,
  );
}
