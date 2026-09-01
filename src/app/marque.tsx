/**
 * Le logo d'Allezou : un « A » sans barre, dont la barre est un point de rencontre.
 *
 * Un A pour le nom, un point pour le lieu où l'on se retrouve — « on se dit où ? ». Dessiné
 * en traits larges et peu nombreux : c'est un logo d'onglet avant tout, et à 16 pixels les
 * détails se brouillent. Les trois fichiers d'icône (onglet, écran d'accueil iOS, aperçu
 * WhatsApp) partagent ce glyphe pour qu'il n'y ait jamais qu'un seul endroit où le changer.
 *
 * Le viewBox est 512×512 ; `taille` ne fait que le mettre à l'échelle.
 */
export function Marque({ taille }: { taille: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 512 512" fill="#fffcf5">
      {/* Les deux jambes de l'A, épaisses, jointes au sommet. */}
      <path d="M146 392 206 392 256 178 306 392 366 392 286 116 226 116 Z" />
      {/*
        La traverse, réduite à sa plus simple expression : un point. En <path> et non
        <circle> — le moteur d'ImageResponse (satori) ne rend que path et rect.
      */}
      <path d="M256 286a30 30 0 1 0 0 60a30 30 0 1 0 0-60Z" />
    </svg>
  );
}
