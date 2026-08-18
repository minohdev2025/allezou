/**
 * Une carte de sortie dessinée, pour la page d'accueil.
 *
 * Dessinée et non capturée, pour les mêmes raisons que l'icône : pas de binaire dans le
 * dépôt, un diff lisible, et les couleurs viennent des variables CSS — la maquette suit
 * donc les thèmes clair et sombre sans qu'on y pense. Une capture d'écran aurait aussi
 * montré de vraies données ; ici les prénoms sont ceux que DONNEES.md utilise déjà comme
 * exemples (« Sophie », « Léa », « Matéo »).
 *
 * Elle reproduit la carte de l'écran des sorties (maintenant/page.tsx) : le lieu, la
 * pastille « jusqu'à », qui est dehors et avec quels enfants, le bouton « Nous aussi »,
 * les autres familles. C'est la sobriété promise par la page, montrée plutôt que décrite.
 */

import { useTranslations } from "next-intl";

const POLICE_TITRE = "var(--font-titre), var(--font-texte), ui-sans-serif, sans-serif";

export function MaquetteSortie({ className = "" }: { className?: string }) {
  const t = useTranslations("Maquette");
  return (
    <svg
      viewBox="0 0 360 152"
      role="img"
      aria-label={t("descriptionEcran")}
      className={`h-auto w-full ${className}`}
    >
      {/* La carte, avec l'anneau et l'ombre portée des vraies cartes. */}
      <rect x="8" y="11" width="344" height="136" rx="24" fill="var(--color-vert-doux)" />
      <rect
        x="8"
        y="8"
        width="344"
        height="136"
        rx="24"
        fill="var(--color-surface)"
        stroke="var(--color-vert)"
        strokeWidth="2"
      />

      {/* Le lieu, et l'heure à laquelle la sortie s'effacera. */}
      <text
        x="28"
        y="44"
        fontFamily={POLICE_TITRE}
        fontSize="19"
        fontWeight="700"
        fill="var(--color-encre)"
      >
        Parc du Gué
      </text>
      <rect x="238" y="26" width="98" height="26" rx="13" fill="var(--color-ambre-doux)" />
      <text
        x="287"
        y="40"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="700"
        fill="var(--color-ambre)"
      >
        {t("heureLimite", { heure: "17:00" })}
      </text>

      {/* Qui est dehors, et avec quels enfants : un prénom, rien d'autre. */}
      <circle cx="44" cy="90" r="16" fill="var(--color-violet-doux)" />
      <text
        x="44"
        y="91"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="700"
        fill="var(--color-violet)"
      >
        S
      </text>
      <text x="68" y="86" fontSize="15" fontWeight="700" fill="var(--color-encre)">
        Sophie
      </text>
      <text x="68" y="104" fontSize="13" fill="var(--color-doux)">
        {t("avecEnfants")}
      </text>

      {/* Le geste qui reste : les rejoindre. */}
      <rect x="238" y="74" width="98" height="32" rx="16" fill="var(--color-vert)" />
      <text
        x="287"
        y="91"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="14"
        fontWeight="700"
        fill="var(--color-fond)"
      >
        {t("nousAussi")}
      </text>

      {/* Les familles qui ont déjà rejoint, comptées comme à l'écran. */}
      <circle cx="36" cy="128" r="9" fill="var(--color-bleu-doux)" />
      <text
        x="36"
        y="129"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fontWeight="700"
        fill="var(--color-bleu)"
      >
        A
      </text>
      <circle cx="50" cy="128" r="9" fill="var(--color-rose-doux)" />
      <text
        x="50"
        y="129"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fontWeight="700"
        fill="var(--color-rose)"
      >
        K
      </text>
      <text x="66" y="128" dominantBaseline="central" fontSize="13" fontWeight="700" fill="var(--color-vert)">
        {t("autresFamilles", { n: 2 })}
      </text>
    </svg>
  );
}
