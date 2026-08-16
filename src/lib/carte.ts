/**
 * Ce qu'il faut pour poser des lieux sur une carte, sans rien envoyer nulle part.
 *
 * Tout ici est du calcul pur, utilisable côté client comme côté serveur : le cadrage
 * initial d'une carte, la distance entre deux points, le lien d'itinéraire. La carte
 * elle-même vit dans `src/app/carte-client.tsx` ; le géocodage, lui, reste dans `geo.ts`,
 * côté serveur, et rien n'y change.
 */

export type PointCarte = {
  id: string;
  nom: string;
  /** La commune, l'adresse, l'heure — ce qui se lit sous le nom dans la bulle. */
  sousTitre?: string | null;
  lat: number;
  lon: number;
  /** La fiche interne à ouvrir depuis la bulle, quand il y en a une. */
  href?: string;
};

/** Le centre du canton, pour une carte qui n'a encore rien à montrer. */
export const GENEVE = { lat: 46.2044, lng: 6.1432 };

/**
 * L'itinéraire vers un point, dans l'application de cartes que le parent a déjà.
 *
 * Le lien officiel de Google Maps ouvre l'application sur téléphone et le site sinon,
 * avec le trafic et les horaires de bus que la famille connaît. Les coordonnées valent
 * mieux qu'une recherche : « Maison de quartier » existe dans dix communes.
 */
export function lienItineraire(coord: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coord.lat}%2C${coord.lon}`;
}

/**
 * Le cadrage de départ : tous les points visibles, sans que personne n'ait à pincer.
 *
 * Un seul point se regarde de près, un canton entier se regarde en entier. Les valeurs
 * rendues correspondent aux props `defaultCenter`/`defaultZoom`/`defaultBounds` de la
 * carte, calculées d'avance pour être testables sans navigateur.
 */
export function cadrageInitial(points: { lat: number; lon: number }[]):
  | { defaultCenter: { lat: number; lng: number }; defaultZoom: number }
  | { defaultBounds: { north: number; south: number; east: number; west: number; padding: number } } {
  if (points.length === 0) return { defaultCenter: GENEVE, defaultZoom: 12 };

  if (points.length === 1) {
    return { defaultCenter: { lat: points[0].lat, lng: points[0].lon }, defaultZoom: 15 };
  }

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return {
    defaultBounds: {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lons),
      west: Math.min(...lons),
      padding: 56,
    },
  };
}

/*
  Pas de calcul de distance « depuis ma position » ici, et ce n'est pas un manque :
  la géolocalisation est bloquée pour tout Allezou par `Permissions-Policy` (proxy.ts),
  promesse de PRODUIT.md. Une distance sans point de départ n'a rien à mesurer.
*/
