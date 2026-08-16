"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * Copier ou partager l'invitation d'un geste.
 *
 * La zone de texte en dessous reste le chemin sans JavaScript ; ces boutons font la
 * même chose en un toucher. « Partager » n'apparaît que là où le système sait le
 * faire (l'API Web Share, c'est-à-dire les téléphones) : un bouton qui échoue
 * n'apprend rien à personne. La capacité se lit comme un état externe — le serveur
 * répond « non », l'appareil répond pour lui-même, et rien ne s'y réabonne jamais.
 */

const REVENIR_MS = 1_500;

const jamais = () => () => {};

export function PartageInvitation({ lien, message }: { lien: string; message: string }) {
  const peutPartager = useSyncExternalStore(
    jamais,
    () => "share" in navigator,
    () => false,
  );
  const [copie, setCopie] = useState<"lien" | "message" | null>(null);

  const copier = async (quoi: "lien" | "message") => {
    try {
      await navigator.clipboard.writeText(quoi === "lien" ? lien : message);
      setCopie(quoi);
      setTimeout(() => setCopie(null), REVENIR_MS);
    } catch {
      // Presse-papiers refusé : la zone de texte en dessous reste le chemin.
    }
  };

  const partager = async () => {
    try {
      await navigator.share({ text: message });
    } catch {
      // Partage annulé ou refusé : rien à dire, rien de perdu.
    }
  };

  /*
    Ces boutons vivent sur le panneau vert-doux de l'Alerte : le liseré `trait` y est
    invisible et un bouton vert s'y noie. L'encre pour le principal, le fond de page
    pour les secondaires — les deux tranchent sur le panneau, en clair comme en sombre.
  */
  const pilule =
    "rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold bg-[color:var(--color-fond)] shadow-[inset_0_0_0_2px_var(--color-vert)]";

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {/* Le geste principal d'abord : sur téléphone, on partage — copier est le repli. */}
      {peutPartager ? (
        <button
          type="button"
          onClick={partager}
          className="rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold text-[color:var(--color-fond)] [background:var(--color-encre)]"
        >
          Partager
        </button>
      ) : null}
      <button type="button" onClick={() => copier("lien")} className={pilule}>
        {copie === "lien" ? "Copié ✓" : "Copier le lien"}
      </button>
      <button type="button" onClick={() => copier("message")} className={pilule}>
        {copie === "message" ? "Copié ✓" : "Copier le message"}
      </button>
    </div>
  );
}
