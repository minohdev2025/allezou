"use client";

import Link from "next/link";
import { useState } from "react";

import { type PointCarte } from "@/lib/carte";
import { CarteDesLieux } from "../carte-client";
import { Bouton, IconePlus, teinte } from "../ui";

/**
 * Choisir le lieu, puis confirmer — en deux gestes qui se voient.
 *
 * La première version publiait au toucher du lieu : le geste le plus rapide possible,
 * mais aussi le plus glissant — un pouce qui dérape publiait une sortie au mauvais parc,
 * vers de vraies familles. Et la carte ne pouvait rien proposer : toucher un marqueur
 * pour « voir » et toucher un lieu pour « publier » auraient été le même geste avec deux
 * effets sans commune mesure.
 *
 * Désormais choisir et confirmer sont deux gestes distincts : liste et carte font le
 * premier, le bouton du bas — qui nomme le lieu choisi — fait le second. Rien ne part
 * avant lui.
 *
 * Sans JavaScript, tout tient : des boutons radio, leur mise en valeur en CSS pur
 * (`peer-checked`), et `required` qui retient une confirmation sans lieu. Seule la
 * carte et le libellé vivant du bouton demandent du script — ce sont des plus.
 */

export type LieuChoix = {
  id: string;
  name: string;
  commune: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
};

export function ChoixDuLieu({
  lieux,
  cleApi,
  mapId,
}: {
  lieux: LieuChoix[];
  cleApi?: string | null;
  mapId?: string | null;
}) {
  const [choisi, setChoisi] = useState<string | null>(null);
  const lieuChoisi = lieux.find((l) => l.id === choisi) ?? null;

  const points = lieux.flatMap((lieu): PointCarte[] =>
    lieu.lat != null && lieu.lon != null
      ? [
          {
            id: lieu.id,
            nom: lieu.name,
            sousTitre: [lieu.address, lieu.commune].filter(Boolean).join(", "),
            lat: lieu.lat,
            lon: lieu.lon,
          },
        ]
      : [],
  );

  return (
    <>
      <p className="mb-2 font-bold">
        Choisissez un lieu :{" "}
        <span className="font-normal text-[color:var(--color-doux)]">
          dans la liste ou sur la carte — rien ne part avant la confirmation
        </span>
      </p>

      <ul className="space-y-3">
        {lieux.map((lieu) => (
          <li key={lieu.id}>
            <label className="block">
              <input
                type="radio"
                name="lieu"
                value={lieu.id}
                required
                checked={choisi === lieu.id}
                onChange={() => setChoisi(lieu.id)}
                className="peer sr-only"
              />
              {/*
                L'accent de couleur vit en style inline (la teinte est calculée), donc la
                mise en valeur du choix passe par `outline` : un box-shadow de classe
                perdrait toujours contre le style inline.
              */}
              <span
                className="flex w-full cursor-pointer items-center gap-4 rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] px-5 py-4 text-left transition-transform active:translate-y-[2px] peer-checked:outline peer-checked:outline-[3px] peer-checked:-outline-offset-[3px] peer-checked:outline-[color:var(--color-vert)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--color-bleu)]"
                style={{
                  boxShadow: `inset 0 0 0 2px var(--color-${teinte(lieu.id)}-doux)`,
                }}
              >
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
                  style={{ background: `var(--color-${teinte(lieu.id)}-doux)` }}
                >
                  {choisi === lieu.id ? "✅" : "📍"}
                </span>
                <span className="min-w-0">
                  <span className="titre block text-lg font-bold leading-tight">
                    {lieu.name}
                  </span>
                  {lieu.commune ? (
                    <span className="block text-sm text-[color:var(--color-doux)]">
                      {lieu.commune}
                    </span>
                  ) : null}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {/*
        « Pas dans la liste » se lit juste sous la liste : c'est en la finissant sans
        trouver qu'on en a besoin. Placé après la confirmation, il ne se découvrait
        qu'une fois le bouton d'envoi dépassé — trop tard pour servir.
      */}
      <p className="mt-3">
        <Link
          href="/sortir/lieu"
          className="inline-flex items-center gap-1 font-bold text-[color:var(--color-vert)] underline underline-offset-4"
        >
          <IconePlus className="h-5 w-5" />
          Le lieu n&apos;est pas dans la liste
        </Link>
      </p>

      {/*
        La carte est sous la liste, jamais au-dessus : le premier lieu doit rester au
        premier écran. « Choisir ce lieu » dans une bulle coche le même bouton radio que
        la liste — même choix, même confirmation, aucun raccourci qui publierait.
      */}
      <div className="mt-4">
        <CarteDesLieux
          points={points}
          sansPosition={lieux.length - points.length}
          autourDeMoi
          cleApi={cleApi}
          mapId={mapId}
          choisiId={choisi}
          onChoisir={(point) => setChoisi(point.id)}
        />
      </div>

      <div className="mt-5">
        <Bouton>
          {lieuChoisi ? (
            <>
              Nous sortons : <strong>{lieuChoisi.name}</strong>
            </>
          ) : (
            "Confirmer la sortie"
          )}
        </Bouton>
        <p className="mt-2 text-center text-sm leading-snug text-[color:var(--color-doux)]">
          {lieuChoisi
            ? "La sortie part vers les cercles cochés plus haut."
            : "Elle partira une fois un lieu choisi, vers les cercles cochés plus haut."}
        </p>
      </div>
    </>
  );
}
