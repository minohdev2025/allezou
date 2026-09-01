import { ImageResponse } from "next/og";

import { Marque } from "./marque";

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
        <Marque taille={116} />
      </div>
    ),
    size,
  );
}
