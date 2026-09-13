"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

/**
 * La photo d'une activité, agrandissable d'un appui.
 *
 * Sur la fiche elle est cadrée — une bande de hauteur fixe, sinon une affiche en format
 * portrait occuperait tout l'écran avant qu'on ait lu la date. L'appui ouvre l'image
 * entière, dans un `<dialog>` : c'est lui qui apporte la fermeture par Échap, le piège au
 * clavier et le fond inerte, qu'une `div` avec des gestionnaires d'événements devrait
 * réécrire à la main, moins bien.
 *
 * Pas de `next/image` : l'octet est déjà réencodé et borné par le serveur, il n'y a rien à
 * optimiser, et l'optimiseur ajouterait un aller-retour sur une image qu'on sert nous-mêmes.
 */
export function PhotoActivite({
  src,
  largeur,
  hauteur,
  titre,
}: {
  src: string;
  largeur: number;
  hauteur: number;
  titre: string;
}) {
  const t = useTranslations("AgendaActivite");
  const fenetre = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => fenetre.current?.showModal()}
        aria-label={t("photoAgrandir")}
        className="mb-5 block w-full cursor-zoom-in overflow-hidden rounded-[var(--radius-carte)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-vert)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- servie par /photo/<id>. */}
        <img
          src={src}
          alt={titre}
          width={largeur}
          height={hauteur}
          className="h-56 w-full bg-[color:var(--color-surface2)] object-cover"
        />
      </button>

      <dialog
        ref={fenetre}
        // Un appui n'importe où referme : sur un téléphone, c'est le geste attendu, et
        // l'image occupe presque tout l'espace — viser une croix serait pénible.
        onClick={() => fenetre.current?.close()}
        // `m-auto` centre : un `<dialog>` se centre seul par ses marges automatiques, que
        // la remise à zéro de Tailwind efface. Sans lui, l'image se colle en haut à gauche.
        className="m-auto max-h-[92dvh] max-w-[96vw] bg-transparent p-0 backdrop:bg-black/80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- la même image, entière. */}
        <img
          src={src}
          alt={titre}
          width={largeur}
          height={hauteur}
          className="max-h-[92dvh] w-auto rounded-[var(--radius-carte)] object-contain"
        />
      </dialog>
    </>
  );
}
