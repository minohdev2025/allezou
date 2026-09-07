"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * « Combien de temps » : deux durées prêtes à l'emploi, et une heure de retour précise.
 *
 * L'heure précise gagne sur la puce quand elle est remplie — c'est le serveur qui tranche
 * (`declarerSortie`). Ici, le choix se voit : remplir l'heure décoche les puces, cocher une
 * puce vide l'heure, et effacer l'heure revient à « 2 h ». Sans JavaScript, les deux champs
 * partent tels quels et la même règle serveur s'applique.
 */
export function ChoixDuree() {
  const t = useTranslations("Sortir");
  const [duree, setDuree] = useState(120);
  const [fin, setFin] = useState("");

  const puces = [
    { minutes: 60, libelle: "1 h" },
    { minutes: 120, libelle: "2 h" },
  ];

  return (
    <fieldset className="mb-4">
      <legend className="mb-2 font-bold">{t("combienDeTemps")}</legend>
      <div className="flex gap-2">
        {puces.map((puce) => (
          <label key={puce.minutes} className="flex-1">
            <input
              type="radio"
              name="duree"
              value={puce.minutes}
              checked={fin === "" && duree === puce.minutes}
              onChange={() => {
                setDuree(puce.minutes);
                setFin("");
              }}
              className="peer sr-only"
            />
            <span className="flex h-12 cursor-pointer items-center justify-center rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] text-center font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-vert)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none">
              {puce.libelle}
            </span>
          </label>
        ))}
        {/*
          La troisième puce n'est pas une durée mais une heure : « jusqu'à 18:30 ».
          Un `input type="time"` ouvre le sélecteur natif du téléphone, qui connaît
          la langue et le format de l'appareil — rien à réinventer.
        */}
        <label
          className={`flex h-12 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-pilule)] px-3 font-bold ${
            fin
              ? "bg-[color:var(--color-vert)] text-[color:var(--color-fond)]"
              : "bg-[color:var(--color-surface)] text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
          }`}
        >
          <span className="shrink-0">{t("jusqua")}</span>
          <input
            type="time"
            name="fin"
            value={fin}
            aria-label={t("heureRetour")}
            onChange={(e) => {
              setFin(e.target.value);
              // Heure effacée : on revient à la durée par défaut plutôt que de laisser
              // deux réglages qui se contredisent sans qu'aucun ne se voie.
              if (!e.target.value) setDuree(120);
            }}
            className="w-[5.2rem] bg-transparent text-center font-bold outline-none [color-scheme:light]"
          />
        </label>
      </div>
    </fieldset>
  );
}
