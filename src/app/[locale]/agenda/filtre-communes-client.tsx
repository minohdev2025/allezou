"use client";

import { useTranslations } from "next-intl";

/**
 * La rangée « Communes » du bloc de filtres : le nom est le geste, la liste se déroule
 * dessous.
 *
 * Une vingtaine de puces relevaient « Filtrer » et la liste d'activités hors de l'écran au
 * moment précis où l'on ouvrait le panneau pour gagner de la place — c'était l'inverse du
 * but. Déroulée, la liste ne prend de place que pour qui la cherche.
 *
 * Le « Toutes » est une case en plus, pas une valeur magique dans l'adresse : cochée par
 * défaut quand aucune commune n'est choisie, elle se décoche dès qu'une commune est
 * choisie, et cocher « Toutes » vide les cases. `FormulaireFiltres` écarte son nom de
 * l'adresse — c'est un marqueur d'interface, pas un filtre.
 *
 * Les cases restent non contrôlées (`defaultChecked`) : c'est le formulaire, pas React,
 * qui connaît l'état au moment d'appliquer. L'exclusion mutuelle se fait en lisant le DOM
 * — `currentTarget.form` — plutôt qu'en dupliquant chaque case dans un état React.
 */
export function FiltreCommunes({
  communes,
  choisies,
}: {
  communes: string[];
  choisies: string[];
}) {
  const t = useTranslations("Agenda");
  const ouverture = (
    <details
      open={choisies.length > 0}
      className="py-3"
    >
      <summary className="flex cursor-pointer items-baseline justify-between text-xs font-bold text-[color:var(--color-doux)]">
        <span>{t("categorieCommunes")}</span>
        {choisies.length > 0 ? (
          <span className="text-[color:var(--color-vert)]">
            {t("nCommunesChoisies", { n: choisies.length })}
          </span>
        ) : null}
      </summary>
      <div
        className="mt-1.5 flex flex-wrap gap-2"
        onChange={(evenement) => {
          const caseTouchee = evenement.target as HTMLInputElement;
          const formulaire = caseTouchee.form;
          if (!formulaire) return;
          if (caseTouchee.name === "communesToutes") {
            for (const autre of formulaire.querySelectorAll<HTMLInputElement>(
              "input[name=commune]",
            )) {
              autre.checked = false;
            }
          } else if (caseTouchee.checked) {
            const toutes = formulaire.querySelector<HTMLInputElement>(
              "input[name=communesToutes]",
            );
            if (toutes) toutes.checked = false;
          }
        }}
      >
        <Puce nom="communesToutes" valeur="1" coche={choisies.length === 0}>
          {t("toutesCommunes")}
        </Puce>
        {communes.map((c) => (
          <Puce key={c} nom="commune" valeur={c} coche={choisies.includes(c)}>
            {c}
          </Puce>
        ))}
      </div>
    </details>
  );
  return ouverture;
}

/**
 * Une puce qui se coche : la soeur de celle de la page, rendue ici parce qu'un
 * composant client ne peut pas importer un composant défini dans le fichier de la page.
 * Si la troisième copie devient nécessaire, les réunir dans un fichier partagé.
 */
function Puce({
  nom,
  valeur,
  coche,
  children,
}: {
  nom: string;
  valeur: string;
  coche: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="shrink-0 cursor-pointer">
      <input type="checkbox" name={nom} value={valeur} defaultChecked={coche} className="peer sr-only" />
      <span className="block rounded-[var(--radius-pilule)] bg-[color:var(--color-fond)] px-4 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-vert)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--color-vert)]">
        {children}
      </span>
    </label>
  );
}
