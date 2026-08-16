"use client";

import { useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  ColorScheme,
  Map as CarteGoogle,
  Pin,
} from "@vis.gl/react-google-maps";

import { GENEVE } from "@/lib/carte";

/**
 * Poser le point d'un nouveau lieu, du doigt, sur la carte.
 *
 * Sans lui, un lieu ajouté attend le géocodage Nominatim — qui devine à partir du nom
 * et se trompe sur un préau sans adresse. Or la personne qui ajoute un lieu y est
 * souvent, ou en revient : son doigt sur la carte est la meilleure source de position
 * que l'application verra jamais. Le point part dans le formulaire, en champs cachés.
 *
 * Facultatif et voilé, comme les autres cartes : rien ne se charge sans un toucher,
 * et sans point posé le lieu vivra très bien — Nominatim tentera sa chance. Pas de
 * « ma position » pour aider : la géolocalisation est bloquée par Permissions-Policy
 * (proxy.ts), promesse de PRODUIT.md — on se repère en pinçant la carte, comme sur un
 * plan papier.
 */

type Point = { lat: number; lon: number };

export function ChoisirLaPosition({
  cleApi,
  mapId,
}: {
  cleApi?: string | null;
  mapId?: string | null;
}) {
  const [visible, setVisible] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);

  return (
    <div>
      {/* Le point voyage avec le formulaire ; vide, il n'existe pas. */}
      <input type="hidden" name="lat" value={point?.lat ?? ""} />
      <input type="hidden" name="lon" value={point?.lon ?? ""} />

      {/* Un nom qui dit le geste, sans mode d'emploi : le bouton se suffit. */}
      {!visible ? (
        <button
          type="button"
          onClick={() => setVisible(true)}
          className="w-full rounded-[var(--radius-pilule)] bg-[color:var(--color-fond)] px-5 py-3 text-left font-bold shadow-[inset_0_0_0_2px_var(--color-trait)]"
        >
          🗺️ Géolocaliser sur la carte
        </button>
      ) : !cleApi ? (
        <div className="rounded-[var(--radius-carte)] bg-[color:var(--color-fond)] p-4 text-sm leading-snug text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]">
          La carte n&apos;est pas encore branchée : il manque{" "}
          <code className="font-mono">GOOGLE_MAPS_API_KEY</code> (voir{" "}
          <code className="font-mono">docs/google-maps.md</code>). Sans point posé, le
          lieu sera géocodé depuis son nom et son adresse — moins précis, mais rien n&apos;est
          bloqué.
        </div>
      ) : (
        <div>
          <div className="h-72 overflow-hidden rounded-[var(--radius-carte)] shadow-[inset_0_0_0_2px_var(--color-trait)]">
            <APIProvider apiKey={cleApi}>
              <CarteGoogle
                className="h-full w-full"
                mapId={mapId || "DEMO_MAP_ID"}
                colorScheme={ColorScheme.FOLLOW_SYSTEM}
                gestureHandling="cooperative"
                defaultCenter={{ lat: GENEVE.lat, lng: GENEVE.lng }}
                defaultZoom={12}
                onClick={(e) => {
                  const ll = e.detail.latLng;
                  if (ll) setPoint({ lat: ll.lat, lon: ll.lng });
                }}
              >
                {point ? (
                  <AdvancedMarker position={{ lat: point.lat, lng: point.lon }}>
                    <Pin background="#17784f" borderColor="#0f5236" glyphColor="#ffffff" />
                  </AdvancedMarker>
                ) : null}
              </CarteGoogle>
            </APIProvider>
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm leading-snug text-[color:var(--color-doux)]">
            {point ? (
              <>
                <span>
                  Point posé : {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
                </span>
                <button
                  type="button"
                  onClick={() => setPoint(null)}
                  className="font-bold underline underline-offset-4"
                >
                  Retirer
                </button>
              </>
            ) : (
              "Touchez l'endroit exact."
            )}
          </p>
        </div>
      )}
    </div>
  );
}
