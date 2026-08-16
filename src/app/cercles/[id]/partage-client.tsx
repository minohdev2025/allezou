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

  const pilule =
    "rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold shadow-[inset_0_0_0_2px_var(--color-trait)]";

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => copier("lien")} className={pilule}>
        {copie === "lien" ? "Copié ✓" : "Copier le lien"}
      </button>
      <button type="button" onClick={() => copier("message")} className={pilule}>
        {copie === "message" ? "Copié ✓" : "Copier le message"}
      </button>
      {peutPartager ? (
        <button
          type="button"
          onClick={partager}
          className={`${pilule} text-[color:var(--color-fond)] shadow-none [background:var(--color-vert)]`}
        >
          Partager
        </button>
      ) : null}
    </div>
  );
}
