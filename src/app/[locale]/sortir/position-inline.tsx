"use client";

import { useTranslations } from "next-intl";
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
 * Mini-carte pour poser ou déplacer le repère d'un lieu, depuis la liste de sélection.
 *
 * Deux modes : lecture (le pin est posé, on le voit, on ne le bouge pas) et édition
 * (un clic sur la carte le déplace, deux boutons Enregistrer / Annuler ferment
 * l'édition). La carte est *voilée* : elle ne se charge que lorsque le parent
 * l'ouvre — sans cette garde, ouvrir `/sortir` pèserait une carte Google complète
 * pour les vingt lieux du catalogue, alors que la plupart des parents n'en ont
 * rien à faire.
 *
 * Réutilise `APIProvider` / `CarteGoogle` de `@vis.gl/react-google-maps`, comme
 * l'écran d'ajout d'un lieu le faisait avant que la position ne soit plus que
 * devinée par Nominatim, pour rester lisible par qui connaît déjà l'écran.
 */

type Point = { lat: number; lon: number };

export function PositionInline({
  initialLat,
  initialLon,
  cleApi,
  mapId,
  onSave,
  onCancel,
}: {
  initialLat?: number | null;
  initialLon?: number | null;
  cleApi?: string | null;
  mapId?: string | null;
  onSave: (lat: number, lon: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Position");
  const [edite, setEdite] = useState(initialLat == null || initialLon == null);
  const [point, setPoint] = useState<Point | null>(
    initialLat != null && initialLon != null
      ? { lat: initialLat, lon: initialLon }
      : null,
  );

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-carte)] bg-[color:var(--color-fond)] p-4 shadow-[inset_0_0_0_2px_var(--color-trait)]">
      {/*
        Mode lecture : la carte est centrée sur le pin existant. Un bouton « Déplacer »
        passe en mode édition, où le clic sur la carte change le pin.
       */}
      {!edite && point ? (
        <div>
          {!cleApi ? (
            <p className="text-sm text-[color:var(--color-doux)]">
              {t("carteNonBranchee")}
            </p>
          ) : (
            <div className="h-56 overflow-hidden rounded-[var(--radius-carte)]">
              <APIProvider apiKey={cleApi}>
                <CarteGoogle
                  className="h-full w-full"
                  mapId={mapId || "DEMO_MAP_ID"}
                  colorScheme={ColorScheme.FOLLOW_SYSTEM}
                  gestureHandling="cooperative"
                  defaultCenter={{ lat: point.lat, lng: point.lon }}
                  defaultZoom={15}
                >
                  <AdvancedMarker position={{ lat: point.lat, lng: point.lon }}>
                    <Pin background="#17784f" borderColor="#0f5236" glyphColor="#ffffff" />
                  </AdvancedMarker>
                </CarteGoogle>
              </APIProvider>
            </div>
          )}
          {/*
            Trois actions en mode lecture : les coordonnées du pin, le bouton
            Déplacer (passe en édition) et le bouton Itinéraire (ouvre Google
            Maps avec le point comme destination). L'itinéraire est un simple
            lien externe vers maps/dir, qui ouvre l'app Google Maps native
            sur mobile si elle est installée.
          */}
          <p className="mt-2 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("pointPose", {
              lat: point.lat.toFixed(5),
              lon: point.lon.toFixed(5),
            })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm leading-snug">
            <button
              type="button"
              onClick={() => setEdite(true)}
              className="font-bold underline underline-offset-4"
            >
              {t("deplacer")}
            </button>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline underline-offset-4"
            >
              {t("itineraire")}
            </a>
          </div>
        </div>
      ) : null}

      {/*
        Mode édition : la carte attend un clic pour placer le pin. Si le parent n'a
        jamais posé de repère, on centre sur Genève.
       */}
      {edite ? (
        <div>
          {!cleApi ? (
            <p className="text-sm text-[color:var(--color-doux)]">
              {t("carteNonBranchee")}
            </p>
          ) : (
            <div className="h-56 overflow-hidden rounded-[var(--radius-carte)]">
              <APIProvider apiKey={cleApi}>
                <CarteGoogle
                  className="h-full w-full"
                  mapId={mapId || "DEMO_MAP_ID"}
                  colorScheme={ColorScheme.FOLLOW_SYSTEM}
                  gestureHandling="cooperative"
                  defaultCenter={
                    point
                      ? { lat: point.lat, lng: point.lon }
                      : { lat: GENEVE.lat, lng: GENEVE.lng }
                  }
                  defaultZoom={point ? 15 : 12}
                  onClick={(e) => {
                    const ll = e.detail.latLng;
                    if (ll) setPoint({ lat: ll.lat, lon: ll.lng });
                  }}
                >
                  {point ? (
                    <AdvancedMarker
                      position={{ lat: point.lat, lng: point.lon }}
                    >
                      <Pin background="#17784f" borderColor="#0f5236" glyphColor="#ffffff" />
                    </AdvancedMarker>
                  ) : null}
                </CarteGoogle>
              </APIProvider>
            </div>
          )}
          <p className="mt-2 text-sm leading-snug text-[color:var(--color-doux)]">
            {point
              ? t("pointPropose", {
                  lat: point.lat.toFixed(5),
                  lon: point.lon.toFixed(5),
                })
              : t("touchezEndroit")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!point}
              onClick={() => point && onSave(point.lat, point.lon)}
              className="flex-1 rounded-[var(--radius-pilule)] bg-[color:var(--color-vert)] px-4 py-2 font-bold text-[color:var(--color-fond)] shadow-[0_3px_0_0_var(--color-socle-vert)] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              {t("enregistrer")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-2 font-semibold shadow-[inset_0_0_0_2px_var(--color-trait)]"
            >
              {t("annuler")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
