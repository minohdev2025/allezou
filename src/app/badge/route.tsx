import { ImageResponse } from "next/og";

import { Marque } from "../marque";

/**
 * Le badge des notifications Android : le glyphe seul, sur fond transparent.
 *
 * Dans la barre d'état, Android ne garde d'une image que son canal alpha et le peint en
 * blanc. Donné l'icône de l'application, carré vert opaque, il n'en restait qu'un carré
 * blanc. Ici le fond est transparent et seul le « A » est opaque : c'est lui qui apparaît.
 * 96 pixels, la taille que Chrome recommande pour un badge.
 */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <Marque taille={96} />
      </div>
    ),
    { width: 96, height: 96 },
  );
}
