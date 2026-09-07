"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Champ « Photo de l'annonce » : l'input fichier natif est masqué derrière un
 * bouton maison, pour deux raisons.
 *
 * 1. Affichage : le contrôle natif mélange un bouton pilule surdimensionné et
 *    un petit texte gris « Aucun fichier choisi » calé sur la ligne de base, en
 *    rupture avec la grille label + contrôle pleine largeur du formulaire.
 * 2. Mobile : `accept="image/*"` sans attribut `capture` est ce qui fait
 *    proposer « Prendre une photo / Photothèque / Parcourir » sur iOS et
 *    Android. Ajouter `capture` forcerait la caméra seule — à ne pas faire.
 *
 * Le nom du fichier choisi s'affiche à côté du bouton une fois choisi (texte
 * `doux`, même corps que les placeholders) ; sinon rien, le bouton porte l'action.
 */
export function ChampPhoto() {
  const t = useTranslations("AgendaNouveau");
  const input = useRef<HTMLInputElement>(null);
  const [nom, setNom] = useState("");

  return (
    <div>
      <span className="mb-1 block font-bold">{t("annoncePhoto")}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="shrink-0 rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-2.5 text-sm font-bold text-[color:var(--color-encre)] ring-2 ring-[color:var(--color-trait)] transition-colors hover:ring-[color:var(--color-vert)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-vert)]"
        >
          {t("annoncePhotoChoisir")}
        </button>
        <span className="min-w-0 truncate text-sm text-[color:var(--color-doux)]">
          {nom}
        </span>
      </div>
      <input
        ref={input}
        type="file"
        name="photo"
        accept="image/*"
        className="sr-only"
        onChange={(e) => setNom(e.target.files?.[0]?.name ?? "")}
      />
    </div>
  );
}
