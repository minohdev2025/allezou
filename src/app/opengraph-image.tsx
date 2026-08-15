import { ImageResponse } from "next/og";

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
export const alt = "Allezou : savoir qui est dehors, parmi les gens qu'on connaît déjà";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
        <svg width="150" height="150" viewBox="0 0 512 512" fill="#fffcf5">
          <path d="M256 90 140 262h60L110 396h292L312 262h60L256 90Z" />
          <rect x="228" y="396" width="56" height="60" />
        </svg>
        <div style={{ fontSize: 104, fontWeight: 700, marginTop: 24 }}>Allezou</div>
        <div style={{ marginTop: 18, opacity: 0.92 }}>
          Savoir qui est dehors, parmi les gens qu&apos;on connaît déjà
        </div>
      </div>
    ),
    size,
  );
}
