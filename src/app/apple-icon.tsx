import { ImageResponse } from "next/og";

/**
 * iOS ignore le manifeste pour l'icône d'écran d'accueil : il lui faut celle-ci.
 * Sans elle, l'application installée porterait une capture d'écran de la page.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        <svg width="116" height="116" viewBox="0 0 512 512" fill="#fffcf5">
          <path d="M256 90 140 262h60L110 396h292L312 262h60L256 90Z" />
          <rect x="228" y="396" width="56" height="60" />
        </svg>
      </div>
    ),
    size,
  );
}
