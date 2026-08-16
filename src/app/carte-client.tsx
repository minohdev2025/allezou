"use client";

import { useEffect, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  ColorScheme,
  InfoWindow,
  Map as CarteGoogle,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";

import {
  cadrageInitial,
  distanceMetres,
  formatDistance,
  lienItineraire,
  type PointCarte,
} from "@/lib/carte";

/**
 * La carte des lieux, voilée tant qu'on ne la demande pas.
 *
 * Elle vient de Google Maps, et c'est un choix pesé : c'est la carte que les parents
 * savent déjà lire. Mais un service tiers chargé d'office regarderait par-dessus l'épaule
 * de chaque visiteur — alors rien n'est chargé tant que personne n'a touché le bouton,
 * dans l'esprit de `lienCarte` : ce qui part vers Google part parce qu'on l'a voulu.
 *
 * Sans JavaScript, le bouton ne fait rien et la liste au-dessus reste l'écran entier :
 * la carte est un plus, jamais un préalable.
 *
 * La clé arrive en prop depuis la page, qui la lit dans l'environnement du serveur à
 * chaque requête — jamais par `NEXT_PUBLIC_`, que `next build` figerait dans l'image
 * Docker au moment précis où `.dockerignore` en écarte les secrets. Ainsi, remplir la
 * clé sur le serveur et redémarrer suffit, sans reconstruire.
 */

type Position = { lat: number; lon: number };

export function CarteDesLieux({
  points,
  sansPosition = 0,
  autourDeMoi = false,
  cleApi,
  mapId,
}: {
  points: PointCarte[];
  /** Combien de lieux la carte ne peut pas montrer, faute de géocodage abouti. */
  sansPosition?: number;
  /** Propose « Autour de moi » : utile pour choisir un parc, pas pour lire un agenda. */
  autourDeMoi?: boolean;
  /** `GOOGLE_MAPS_API_KEY` lue par la page côté serveur. Absente, la carte s'explique. */
  cleApi?: string | null;
  /** `GOOGLE_MAPS_MAP_ID`, facultatif — style de carte. */
  mapId?: string | null;
}) {
  const [visible, setVisible] = useState(false);

  // Rien à montrer et rien à voiler : une carte vide n'aide personne, on n'affiche
  // que la raison de son absence.
  if (points.length === 0) {
    return sansPosition > 0 ? <NoteSansPosition n={sansPosition} seuls /> : null;
  }

  if (!visible) {
    return (
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setVisible(true)}
          className="w-full rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-5 py-3 text-left font-bold shadow-[inset_0_0_0_2px_var(--color-trait)]"
        >
          🗺️ Voir sur la carte
          <span className="block text-sm font-normal text-[color:var(--color-doux)]">
            La carte vient de Google Maps ; rien n&apos;est chargé avant que vous la demandiez.
          </span>
        </button>
      </div>
    );
  }

  return (
    <CarteOuverte
      points={points}
      sansPosition={sansPosition}
      autourDeMoi={autourDeMoi}
      cleApi={cleApi}
      mapId={mapId}
    />
  );
}

function CarteOuverte({
  points,
  sansPosition,
  autourDeMoi,
  cleApi,
  mapId,
}: {
  points: PointCarte[];
  sansPosition: number;
  autourDeMoi: boolean;
  cleApi?: string | null;
  mapId?: string | null;
}) {
  const [selection, setSelection] = useState<PointCarte | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [positionRefusee, setPositionRefusee] = useState(false);

  /*
    La clé manque : le dire à l'écran plutôt que d'afficher un cadre gris. Ce message
    s'adresse à qui installe l'application (docs/google-maps.md), et les liens ↗ vers
    Google Maps, eux, marchent sans aucune clé.
  */
  if (!cleApi) {
    return (
      <div className="mb-6 rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] p-4 text-sm leading-snug text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]">
        La carte n&apos;est pas encore branchée : il manque{" "}
        <code className="font-mono">GOOGLE_MAPS_API_KEY</code> — la marche à suivre est
        dans <code className="font-mono">docs/google-maps.md</code>. Les liens ↗ vers
        Google Maps fonctionnent déjà, eux.
      </div>
    );
  }

  const demanderPosition = () => {
    setPositionRefusee(false);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setPosition({ lat: coords.latitude, lon: coords.longitude }),
      () => setPositionRefusee(true),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="mb-6">
      {autourDeMoi ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={demanderPosition}
            className="rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold shadow-[inset_0_0_0_2px_var(--color-trait)]"
          >
            📍 Autour de moi
          </button>
          <span className="text-sm text-[color:var(--color-doux)]">
            {positionRefusee
              ? "Position refusée ou introuvable — la carte reste utilisable."
              : "Votre position n'est jamais envoyée à Allezou."}
          </span>
        </div>
      ) : null}

      <div className="h-[26rem] overflow-hidden rounded-[var(--radius-carte)] shadow-[inset_0_0_0_2px_var(--color-trait)]">
        <APIProvider apiKey={cleApi}>
          <CarteGoogle
            className="h-full w-full"
            mapId={mapId || "DEMO_MAP_ID"}
            colorScheme={ColorScheme.FOLLOW_SYSTEM}
            gestureHandling="cooperative"
            onClick={() => setSelection(null)}
            {...cadrageInitial(points)}
          >
            {points.map((point) => (
              <AdvancedMarker
                key={point.id}
                position={{ lat: point.lat, lng: point.lon }}
                title={point.nom}
                onClick={() => setSelection(point)}
              >
                <Pin />
              </AdvancedMarker>
            ))}

            {position ? (
              <>
                <Recadrage position={position} />
                <AdvancedMarker
                  position={{ lat: position.lat, lng: position.lon }}
                  title="Vous êtes ici"
                >
                  {/* Le point bleu que toutes les cartes ont appris aux gens. */}
                  <span className="block h-4 w-4 rounded-full border-2 border-white bg-[#4285f4] shadow-md" />
                </AdvancedMarker>
              </>
            ) : null}

            {selection ? (
              <InfoWindow
                position={{ lat: selection.lat, lng: selection.lon }}
                pixelOffset={[0, -36]}
                headerContent={<strong className="pr-2">{selection.nom}</strong>}
                onCloseClick={() => setSelection(null)}
              >
                <div className="flex flex-col gap-1">
                  {selection.sousTitre ? <span>{selection.sousTitre}</span> : null}
                  {position ? (
                    <span>à {formatDistance(distanceMetres(position, selection))} à vol d&apos;oiseau</span>
                  ) : null}
                  {selection.href ? (
                    <a href={selection.href} className="font-bold underline underline-offset-2">
                      Voir la fiche
                    </a>
                  ) : null}
                  <a
                    href={lienItineraire(selection)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold underline underline-offset-2"
                  >
                    Itinéraire ↗
                  </a>
                </div>
              </InfoWindow>
            ) : null}
          </CarteGoogle>
        </APIProvider>
      </div>

      {sansPosition > 0 ? <NoteSansPosition n={sansPosition} /> : null}
    </div>
  );
}

/**
 * Recentre la carte quand la position arrive — et seulement là. Le reste du temps, la
 * main reste à la personne : une carte qui se recadre toute seule est une carte qu'on lâche.
 */
function Recadrage({ position }: { position: Position }) {
  const carte = useMap();

  useEffect(() => {
    if (!carte) return;
    carte.panTo({ lat: position.lat, lng: position.lon });
    if ((carte.getZoom() ?? 0) < 14) carte.setZoom(14);
  }, [carte, position]);

  return null;
}

/** Dire ce que la carte ne montre pas : un lieu absent en silence semble ne pas exister. */
function NoteSansPosition({ n, seuls = false }: { n: number; seuls?: boolean }) {
  return (
    <p className="mt-2 text-sm leading-snug text-[color:var(--color-doux)]">
      {seuls
        ? `${n} lieu${n > 1 ? "x" : ""} sans position connue : la carte viendra quand le géocodage les aura trouvés.`
        : `${n} lieu${n > 1 ? "x" : ""} de cette liste n'${n > 1 ? "ont" : "a"} pas encore de position connue et manque${n > 1 ? "nt" : ""} à la carte.`}
    </p>
  );
}
