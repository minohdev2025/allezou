"use client";

import { useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  ColorScheme,
  InfoWindow,
  Map as CarteGoogle,
  Pin,
} from "@vis.gl/react-google-maps";

import { cadrageInitial, lienItineraire, type PointCarte } from "@/lib/carte";
import { Bouton } from "./ui";

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
 * Pas de géolocalisation ici, et ce n'est pas un oubli : `Permissions-Policy` (proxy.ts)
 * la bloque pour tout Allezou — c'est la promesse de PRODUIT.md, opposable au code même.
 *
 * La clé arrive en prop depuis la page, qui la lit dans l'environnement du serveur à
 * chaque requête — jamais par `NEXT_PUBLIC_`, que `next build` figerait dans l'image
 * Docker au moment précis où `.dockerignore` en écarte les secrets. Ainsi, remplir la
 * clé sur le serveur et redémarrer suffit, sans reconstruire.
 */

type PropsCarte = {
  points: PointCarte[];
  /** Combien de lieux la carte ne peut pas montrer, faute de géocodage abouti. */
  sansPosition?: number;
  /** `GOOGLE_MAPS_API_KEY` lue par la page côté serveur. Absente, la carte s'explique. */
  cleApi?: string | null;
  /** `GOOGLE_MAPS_MAP_ID`, facultatif — style de carte. */
  mapId?: string | null;
  /**
   * La carte peut servir à choisir, pas seulement à regarder : la bulle propose alors
   * « Choisir ce lieu », et c'est l'écran d'à côté qui décide de ce que choisir veut
   * dire. Ici, personne ne publie rien : choisir n'est pas confirmer.
   */
  onChoisir?: (point: PointCarte) => void;
  /** Le lieu déjà choisi, pour peindre son marqueur aux couleurs de la maison. */
  choisiId?: string | null;
};

export function CarteDesLieux({
  points,
  sansPosition = 0,
  cleApi,
  mapId,
  onChoisir,
  choisiId,
}: PropsCarte) {
  const [visible, setVisible] = useState(false);

  // Rien à montrer et rien à voiler : une carte vide n'aide personne, on n'affiche
  // que la raison de son absence.
  if (points.length === 0) {
    return sansPosition > 0 ? <NoteSansPosition n={sansPosition} seuls /> : null;
  }

  if (!visible) {
    return (
      <div className="mb-6">
        {/*
          Le libellé seul : le pourquoi du voile est écrit sur /donnees, pas ici.

          Et la brique commune plutôt qu'un bouton réécrit : celui d'ici était aligné à
          gauche quand tous les autres sont centrés, et l'écart se voyait sous « Proposer
          une activité », posé juste au-dessus.
        */}
        <Bouton type="button" variante="second" onClick={() => setVisible(true)}>
          🗺️ Voir sur la carte
        </Bouton>
      </div>
    );
  }

  return (
    <CarteOuverte
      points={points}
      sansPosition={sansPosition}
      cleApi={cleApi}
      mapId={mapId}
      onChoisir={onChoisir}
      choisiId={choisiId}
    />
  );
}

function CarteOuverte({
  points,
  sansPosition = 0,
  cleApi,
  mapId,
  onChoisir,
  choisiId,
}: PropsCarte) {
  const [selection, setSelection] = useState<PointCarte | null>(null);

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

  return (
    <div className="mb-6">
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
                {/* Le lieu choisi porte le vert de la maison ; PinElement ne résout pas
                    les variables CSS, la valeur de globals.css est donc recopiée. */}
                {point.id === choisiId ? (
                  <Pin background="#17784f" borderColor="#0f5236" glyphColor="#ffffff" />
                ) : (
                  <Pin />
                )}
              </AdvancedMarker>
            ))}

            {selection ? (
              <InfoWindow
                position={{ lat: selection.lat, lng: selection.lon }}
                pixelOffset={[0, -36]}
                headerContent={
                  <strong className="pr-2 text-[color:var(--color-encre)]">{selection.nom}</strong>
                }
                onCloseClick={() => setSelection(null)}
              >
                {/* La bulle porte ses propres couleurs au lieu de les hériter de la
                    page : le fond, lui, vient de Google, et reste blanc la nuit sur les
                    styles de carte qui ignorent le thème sombre. globals.css reprend cette
                    bulle ; ces deux classes-ci font que le texte reste lisible même le jour
                    où les sélecteurs de Google changeraient de nom. */}
                <div className="flex flex-col gap-1 bg-[color:var(--color-surface)] text-[color:var(--color-encre)]">
                  {selection.sousTitre ? <span>{selection.sousTitre}</span> : null}
                  {onChoisir ? (
                    <button
                      type="button"
                      onClick={() => {
                        onChoisir(selection);
                        setSelection(null);
                      }}
                      className="mt-1 rounded-full px-3 py-1.5 text-left font-bold text-white [background:#17784f]"
                    >
                      {selection.id === choisiId ? "✓ Choisi" : "Choisir ce lieu"}
                    </button>
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

/** Dire ce que la carte ne montre pas : un lieu absent en silence semble ne pas exister. */
function NoteSansPosition({ n, seuls = false }: { n: number; seuls?: boolean }) {
  return (
    <p className="mt-2 text-sm leading-snug text-[color:var(--color-doux)]">
      {`${n} lieu${n > 1 ? "x" : ""} sans position connue${seuls ? " — la carte viendra avec le géocodage." : "."}`}
    </p>
  );
}
