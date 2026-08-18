import QRCode from "qrcode";

/**
 * Le code QR d'un lien à partager.
 *
 * Rendu sur le serveur, en SVG, sans aucun appel extérieur : envoyer un lien d'invitation à
 * un service de génération d'images reviendrait à lui confier la clé d'entrée d'un cercle.
 *
 * Les couleurs sont fixes, noir sur blanc, et ne suivent pas le thème sombre : un lecteur de
 * code a besoin de contraste, et un carré clair sur fond sombre ne se lit pas toujours.
 */
export async function CodeQR({ valeur, taille = 176 }: { valeur: string; taille?: number }) {
  const svg = await QRCode.toString(valeur, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#1b1a22ff", light: "#ffffffff" },
  });

  return (
    <div
      className="shrink-0 rounded-2xl bg-white p-2"
      style={{ width: taille, height: taille }}
      aria-hidden
      dangerouslySetInnerHTML={{
        __html: svg.replace("<svg", '<svg width="100%" height="100%"'),
      }}
    />
  );
}
