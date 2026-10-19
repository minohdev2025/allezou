"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

type Cercle = { id: string; name: string; membres: { accountId: string; displayName: string }[] };

/**
 * Les personnes qui voient mes disponibilités, cercle par cercle.
 *
 * Une même personne peut être dans deux de mes cercles : elle y figure deux fois, et les
 * deux cases bougent ensemble — c'est une personne qu'on nomme, pas une appartenance.
 * « Tous » coche d'un geste un cercle entier, sans en faire un destinataire : celui qui
 * y entrera demain ne verra rien tant qu'on ne l'aura pas coché.
 *
 * Sans JavaScript, les cases partent telles quelles et le serveur fusionne les doublons :
 * une personne cochée dans un cercle et pas dans l'autre reste nommée.
 */
export function ChoixLecteurs({
  cercles,
  initiaux,
}: {
  cercles: Cercle[];
  initiaux: string[];
}) {
  const t = useTranslations("ChoixLecteurs");
  const [choisis, setChoisis] = useState(() => new Set(initiaux));

  const basculer = (ids: string[], coche: boolean) =>
    setChoisis((avant) => {
      const apres = new Set(avant);
      for (const id of ids) {
        if (coche) apres.add(id);
        else apres.delete(id);
      }
      return apres;
    });

  return (
    <div className="space-y-4">
      {cercles.map((cercle) => {
        const ids = cercle.membres.map((m) => m.accountId);
        const tous = ids.every((id) => choisis.has(id));
        return (
          <fieldset key={cercle.id}>
            <legend className="sr-only">{cercle.name}</legend>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span aria-hidden className="font-bold">
                {cercle.name}
              </span>
              <button
                type="button"
                onClick={() => basculer(ids, !tous)}
                className="shrink-0 text-sm font-bold text-[color:var(--color-vert)] underline-offset-4 hover:underline"
              >
                {tous ? t("aucun") : t("tous")}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {cercle.membres.map((membre) => (
                <label key={membre.accountId}>
                  <input
                    type="checkbox"
                    name="lecteur"
                    value={membre.accountId}
                    checked={choisis.has(membre.accountId)}
                    onChange={(e) => basculer([membre.accountId], e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-vert)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none peer-focus-visible:outline-2">
                    {membre.displayName}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
