"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Champ « Photo de l'activité » : celle qui restera sur la fiche.
 *
 * À ne pas confondre avec `ChampPhoto`, au-dessus du formulaire, qui sert à *lire* une
 * affiche pour pré-remplir les champs et dont l'image n'est pas gardée. Ici, la photo est
 * le contenu.
 *
 * Le fichier est réduit dans le navigateur avant l'envoi. Une photo de téléphone pèse
 * couramment entre trois et douze mégaoctets, dont le serveur ne garde de toute façon que
 * seize cents pixels de côté : les envoyer entiers ferait attendre une minute sur un réseau
 * mobile pour un résultat identique. Le serveur réencode quand même ce qu'il reçoit — c'est
 * lui qui garantit le format et l'effacement des métadonnées, jamais le navigateur.
 *
 * `accept="image/*"` sans `capture` : c'est ce qui fait proposer « Prendre une photo /
 * Photothèque / Parcourir » sur iOS et Android. Ajouter `capture` forcerait la caméra.
 */

/** Le plus grand côté à l'envoi. Au-delà de ce que le serveur garde, pour lui laisser la main. */
const COTE_MAX = 2000;
const QUALITE = 0.85;

async function reduire(fichier: File): Promise<File> {
  // Un format que le navigateur ne sait pas décoder part tel quel : c'est au serveur de
  // dire non, avec un message, plutôt qu'au champ de refuser en silence.
  const image = await createImageBitmap(fichier).catch(() => null);
  if (!image) return fichier;

  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const largeur = Math.round(image.width * echelle);
  const hauteur = Math.round(image.height * echelle);

  const toile = document.createElement("canvas");
  toile.width = largeur;
  toile.height = hauteur;
  const contexte = toile.getContext("2d");
  if (!contexte) return fichier;
  contexte.drawImage(image, 0, 0, largeur, hauteur);
  image.close();

  const reduit = await new Promise<Blob | null>((resoudre) =>
    toile.toBlob(resoudre, "image/jpeg", QUALITE),
  );
  // Une réduction qui alourdirait le fichier n'a pas lieu d'être : on garde l'original.
  if (!reduit || reduit.size >= fichier.size) return fichier;

  return new File([reduit], "photo.jpg", { type: "image/jpeg" });
}

export function ChampPhotoActivite() {
  const t = useTranslations("AgendaNouveau");
  const input = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState("");
  const [occupe, setOccupe] = useState(false);

  // L'URL d'aperçu tient de la mémoire tant qu'on ne la relâche pas.
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);

  async function choisir(evenement: React.ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0];
    if (!fichier) {
      setApercu((precedent) => { if (precedent) URL.revokeObjectURL(precedent); return ""; });
      return;
    }

    setOccupe(true);
    const reduit = await reduire(fichier);

    /*
      Le champ porte le fichier réduit, et non l'original : c'est lui que le formulaire
      enverra. `DataTransfer` est la seule façon de remplacer le contenu d'un champ
      fichier — sa propriété `files` ne s'écrit pas autrement.
    */
    if (input.current) {
      const porteur = new DataTransfer();
      porteur.items.add(reduit);
      input.current.files = porteur.files;
    }

    setApercu((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent);
      return URL.createObjectURL(reduit);
    });
    setOccupe(false);
  }

  function retirer() {
    if (input.current) input.current.value = "";
    setApercu((precedent) => { if (precedent) URL.revokeObjectURL(precedent); return ""; });
  }

  return (
    <div>
      <span className="mb-1 block font-bold">{t("photoActivite")}</span>
      <p className="mb-2 text-sm leading-snug text-[color:var(--color-doux)]">
        {t("photoActiviteAide")}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="shrink-0 rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-2.5 text-sm font-bold text-[color:var(--color-encre)] ring-2 ring-[color:var(--color-trait)] transition-colors hover:ring-[color:var(--color-vert)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-vert)]"
        >
          {apercu ? t("photoActiviteChanger") : t("photoActiviteChoisir")}
        </button>
        {occupe ? (
          <span className="text-sm text-[color:var(--color-doux)]">{t("photoActivitePrepare")}</span>
        ) : apercu ? (
          <button
            type="button"
            onClick={retirer}
            className="shrink-0 text-sm font-bold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            {t("photoActiviteRetirer")}
          </button>
        ) : null}
      </div>

      {apercu ? (
        /* eslint-disable-next-line @next/next/no-img-element --
           une URL d'objet locale : l'optimiseur de Next ne sait pas la lire, et il n'y a
           rien à optimiser dans une image que le navigateur vient de produire. */
        <img
          src={apercu}
          alt=""
          className="mt-3 max-h-56 w-full rounded-[var(--radius-carte)] object-cover"
        />
      ) : null}

      <input
        ref={input}
        type="file"
        name="photoActivite"
        accept="image/*"
        className="sr-only"
        onChange={choisir}
      />
    </div>
  );
}
