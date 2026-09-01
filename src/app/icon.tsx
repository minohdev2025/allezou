import { ImageResponse } from "next/og";

import { Marque } from "./marque";

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
        <Marque taille={330} />
      </div>
    ),
    size,
  );
}
