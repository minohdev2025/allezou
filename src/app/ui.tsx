/** Briques d'interface communes. Rondes, colorées, contrastées. */

import Link from "next/link";

/* ------------------------------------------------------------------ couleurs */

export const TEINTES = ["vert", "bleu", "ambre", "corail", "violet", "rose"] as const;
export type Teinte = (typeof TEINTES)[number];

/**
 * Une teinte stable par cercle ou par personne, dérivée de son identifiant.
 *
 * Rien n'est enregistré pour ça : la même famille garde la même couleur d'un écran à
 * l'autre et d'un téléphone à l'autre, ce qui aide à reconnaître un cercle d'un coup d'œil.
 */
export function teinte(graine: string): Teinte {
  let somme = 0;
  for (let i = 0; i < graine.length; i += 1) somme = (somme * 31 + graine.charCodeAt(i)) % 9973;
  return TEINTES[somme % TEINTES.length];
}

/**
 * Classes de puce cochée, une par teinte.
 *
 * Tailwind ne génère que les classes qu'il voit écrites : une couleur composée à
 * l'exécution ne produirait aucun style. On les écrit donc toutes, une fois.
 */
export const PUCE_COCHEE: Record<Teinte, string> = {
  vert: "peer-checked:bg-[color:var(--color-vert)]",
  bleu: "peer-checked:bg-[color:var(--color-bleu)]",
  ambre: "peer-checked:bg-[color:var(--color-ambre)]",
  corail: "peer-checked:bg-[color:var(--color-corail)]",
  violet: "peer-checked:bg-[color:var(--color-violet)]",
  rose: "peer-checked:bg-[color:var(--color-rose)]",
};

export function styleTeinte(t: Teinte) {
  return {
    color: `var(--color-${t})`,
    background: `var(--color-${t}-doux)`,
  };
}

/* -------------------------------------------------------------- pictogrammes */

type IconeProps = { className?: string };

const base = "h-6 w-6 shrink-0";

export function IconeArbre({ className = "" }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden>
      <path
        d="M12 3 5.5 12h3.2L4 19h16l-4.7-7h3.2L12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 19v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconeCalendrier({ className = "" }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden>
      <rect
        x="3.5"
        y="5"
        width="17"
        height="15.5"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M3.5 10h17M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconeCercles({ className = "" }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden>
      <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="15.5" cy="15" r="5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function IconePlus({ className = "" }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconeHorloge({ className = "" }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconePersonne({ className = "" }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 20.5a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconeMaison({ className = "" }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${base} ${className}`} aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ éléments */

export function Titre({
  children,
  sous,
  emoji,
}: {
  children: React.ReactNode;
  sous?: string;
  emoji?: string;
}) {
  return (
    <header className="mb-7">
      {emoji ? (
        <div aria-hidden className="mb-2 text-4xl leading-none">
          {emoji}
        </div>
      ) : null}
      <h1 className="text-[1.75rem] font-bold leading-tight">{children}</h1>
      {sous ? (
        <p className="mt-2 leading-snug text-[color:var(--color-doux)]">{sous}</p>
      ) : null}
    </header>
  );
}

/**
 * L'accent coloré passe par l'anneau et non par une bordure d'un seul côté : avec des coins
 * très arrondis, une bordure gauche ou haute disparaît presque entièrement dans la courbe.
 */
export function Carte({
  children,
  className = "",
  accent,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: Teinte;
}) {
  return (
    <div
      className={`rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] p-5 ${className}`}
      style={{
        boxShadow: accent
          ? `inset 0 0 0 2px var(--color-${accent}), 0 3px 0 0 var(--color-${accent}-doux)`
          : `inset 0 0 0 2px var(--color-trait), 0 3px 0 0 var(--color-trait)`,
      }}
    >
      {children}
    </div>
  );
}

type VarianteBouton = "principal" | "second" | "discret";

const stylesBouton: Record<VarianteBouton, string> = {
  principal:
    "bg-[color:var(--color-vert)] text-[color:var(--color-fond)] font-bold shadow-[0_3px_0_0_rgba(0,0,0,0.18)] active:translate-y-[2px] active:shadow-none",
  second:
    "bg-[color:var(--color-surface)] ring-2 ring-[color:var(--color-trait)] font-semibold active:translate-y-[1px]",
  discret: "text-[color:var(--color-doux)] underline underline-offset-4",
};

export function Bouton({
  children,
  variante = "principal",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBouton }) {
  return (
    <button
      {...props}
      className={`flex w-full items-center justify-center gap-2 rounded-[var(--radius-pilule)] px-5 py-3.5 text-center text-[1.05rem] transition-transform ${stylesBouton[variante]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LienBouton({
  href,
  children,
  variante = "second",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variante?: VarianteBouton;
  className?: string;
}) {
  return (
    <Link
      href={href}
      data-bouton
      className={`flex w-full items-center justify-center gap-2 rounded-[var(--radius-pilule)] px-5 py-3.5 text-center text-[1.05rem] transition-transform ${stylesBouton[variante]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Champ({
  label,
  aide,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; aide?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block font-bold">{label}</span>
      {aide ? (
        <span className="mb-2 block text-sm leading-snug text-[color:var(--color-doux)]">
          {aide}
        </span>
      ) : null}
      <input
        {...props}
        className="w-full rounded-2xl bg-[color:var(--color-surface)] px-4 py-3.5 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
      />
    </label>
  );
}

export function Alerte({
  children,
  ton = "info",
}: {
  children: React.ReactNode;
  ton?: "info" | "erreur" | "succes";
}) {
  const teintes = { info: "bleu", erreur: "corail", succes: "vert" } as const;
  const t = teintes[ton];

  return (
    <div
      className="mb-5 rounded-[var(--radius-carte)] px-5 py-4 leading-snug"
      style={{
        background: `var(--color-${t}-doux)`,
        boxShadow: `inset 0 0 0 2px var(--color-${t})`,
      }}
    >
      {children}
    </div>
  );
}

/** Étiquette colorée : un nom de cercle, une tranche d'âge, un prénom d'enfant. */
export function Pastille({
  children,
  couleur = "vert",
}: {
  children: React.ReactNode;
  couleur?: Teinte;
}) {
  return (
    <span
      className="inline-flex items-center rounded-[var(--radius-pilule)] px-3 py-1 text-sm font-bold"
      style={styleTeinte(couleur)}
    >
      {children}
    </span>
  );
}

/** Une initiale dans une pastille ronde, colorée d'après l'identifiant de la personne. */
export function Jeton({ nom, id, taille = 40 }: { nom: string; id: string; taille?: number }) {
  const initiale = [...nom.trim()][0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        ...styleTeinte(teinte(id)),
        width: taille,
        height: taille,
        fontSize: taille * 0.42,
      }}
    >
      {initiale}
    </span>
  );
}

export function Vide({
  emoji,
  titre,
  children,
}: {
  emoji: string;
  titre: string;
  children?: React.ReactNode;
}) {
  return (
    <Carte className="text-center">
      <div aria-hidden className="mb-3 text-5xl leading-none">
        {emoji}
      </div>
      <p className="titre text-lg font-bold">{titre}</p>
      {children ? (
        <div className="mt-2 text-[color:var(--color-doux)]">{children}</div>
      ) : null}
    </Carte>
  );
}

/**
 * Quatre onglets, et non trois.
 *
 * « Cercles » en contenait neuf destinations : les cercles eux-mêmes, mais aussi les
 * notifications, le compte, les enfants, les lieux, la page données et la déconnexion. Un
 * onglet qui annonce une chose et en cache huit oblige à chercher là où rien ne l'indique.
 * À quatre, chacun tient encore 93 px sur un écran de 375 — largement au-dessus des 44 px
 * d'une cible tactile.
 */
export function Navigation({
  actif,
}: {
  actif: "maintenant" | "agenda" | "cercles" | "vous";
}) {
  const onglets = [
    { cle: "maintenant", href: "/maintenant", texte: "Sorties", Icone: IconeArbre },
    { cle: "agenda", href: "/agenda", texte: "Agenda", Icone: IconeCalendrier },
    { cle: "cercles", href: "/cercles", texte: "Cercles", Icone: IconeCercles },
    { cle: "vous", href: "/compte", texte: "Vous", Icone: IconePersonne },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t-2 border-[color:var(--color-trait)] bg-[color:var(--color-surface)] pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg">
        {onglets.map(({ cle, href, texte, Icone }) => {
          const estActif = actif === cle;
          return (
            <li key={cle} className="flex-1">
              <Link
                href={href}
                aria-current={estActif ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-3 text-xs font-bold ${
                  estActif
                    ? "text-[color:var(--color-vert)]"
                    : "text-[color:var(--color-doux)]"
                }`}
              >
                <Icone className="h-6 w-6" />
                {texte}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* --------------------------------------------------------------------- dates */

/** « 12:15 » — l'heure de fin est ce qui compte, pas la durée restante. */
export function heureCourte(date: Date): string {
  return new Intl.DateTimeFormat("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  }).format(date);
}

/** Clé de regroupement par jour, à l'heure de Genève : « 2026-08-15 ». */
export function cleDuJour(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * L'en-tête d'une journée. « Aujourd'hui » et « Demain » plutôt qu'une date : c'est ce
 * qu'un parent cherche en premier, et il n'a pas à compter les jours pour le trouver.
 */
export function libelleJour(date: Date): string {
  const aujourdhui = cleDuJour(new Date());
  const demain = cleDuJour(new Date(Date.now() + 86_400_000));
  const jour = cleDuJour(date);

  if (jour === aujourdhui) return "Aujourd'hui";
  if (jour === demain) return "Demain";

  const libelle = new Intl.DateTimeFormat("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Zurich",
  }).format(date);

  return libelle.charAt(0).toUpperCase() + libelle.slice(1);
}

export function jourCourt(date: Date): { jour: string; nombre: string; mois: string } {
  const parties = new Intl.DateTimeFormat("fr-CH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Zurich",
  }).formatToParts(date);

  const lire = (type: string) => parties.find((p) => p.type === type)?.value ?? "";
  return {
    jour: lire("weekday").replace(".", ""),
    nombre: lire("day"),
    mois: lire("month").replace(".", ""),
  };
}
