import { ImageResponse } from "next/og";

/**
 * L'icône de l'application, dessinée plutôt qu'embarquée.
 *
 * Next la rend en PNG au moment du build : le dépôt reste lisible, et changer la couleur
 * ou la forme se fait ici, pas dans un fichier binaire qu'on ne peut pas relire en diff.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#17784f",
        }}
      >
        <svg width="330" height="330" viewBox="0 0 512 512" fill="#fffcf5">
          <path d="M256 90 140 262h60L110 396h292L312 262h60L256 90Z" />
          <rect x="228" y="396" width="56" height="60" />
        </svg>
      </div>
    ),
    size,
  );
}
