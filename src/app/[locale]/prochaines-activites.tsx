import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { CalendarEntry } from "@/lib/calendar";
import { LienBouton, jourCourt, teinte } from "./ui";

/**
 * Les prochaines activités du canton, en liste courte.
 *
 * Deux écrans la montrent, pour la même raison : ce sont les seules sorties qui ne
 * dépendent de personne. Sur « Maintenant » quand les cercles n'ont rien à dire, sur
 * l'accueil public quand le visiteur n'a pas encore de compte — dans les deux cas, c'est
 * la seule chose qui vaille quelque chose tout de suite.
 *
 * Elle est aussi ce qu'un moteur de recherche a à se mettre sous la dent en arrivant sur
 * l'accueil : des activités datées, situées, nommées. L'écran de déclaration d'une sortie
 * n'en dit rien à lui seul.
 *
 * Le titre et son sous-titre viennent de l'appelant : « du canton » sur Maintenant,
 * « à Genève » sur l'accueil, où l'on ne sait pas encore où le lecteur habite.
 */
export function ProchainesActivites({
  activites,
  locale,
  titre,
  sousTitre,
  jusquAu,
  voirAgenda,
  className = "mt-8",
}: {
  activites: CalendarEntry[];
  locale: Locale;
  titre: string;
  sousTitre: string;
  /** « jusqu'au », posé au-dessus de la date de fin d'une activité déjà commencée. */
  jusquAu: string;
  voirAgenda: string;
  className?: string;
}) {
  if (activites.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="titre mb-1 text-lg font-bold">{titre}</h2>
      <p className="mb-3 text-sm leading-snug text-[color:var(--color-doux)]">{sousTitre}</p>
      <ul className="mb-4 space-y-2">
        {activites.map((activite) => {
          /*
            Une activité déjà commencée portait sa date de début : une exposition ouverte
            du 22 juillet au 15 août affichait « 22 juillet » alors qu'on était le 12 août.
            C'est la date de fin qui informe, puisqu'elle dit combien de temps il reste
            pour y aller.
          */
          const jour = jourCourt(
            activite.enCours && activite.endsAt ? activite.endsAt : activite.startsAt,
            locale,
          );
          return (
            <li key={activite.id}>
              <Link
                href={`/agenda/${activite.id}`}
                className="flex gap-3 rounded-2xl bg-[color:var(--color-surface)] px-4 py-3"
                style={{
                  boxShadow: `inset 0 0 0 2px var(--color-${teinte(activite.id)}-doux)`,
                }}
              >
                <span
                  className="w-14 shrink-0 text-sm font-bold leading-tight"
                  style={{ color: `var(--color-${teinte(activite.id)})` }}
                >
                  {activite.enCours && activite.endsAt ? (
                    <span className="block text-[0.7rem] opacity-75">{jusquAu}</span>
                  ) : null}
                  {jour.nombre} {jour.mois}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="titre line-clamp-2 font-bold leading-tight">
                    {activite.title}
                  </span>
                  {activite.commune ? (
                    <span className="mt-0.5 block text-sm text-[color:var(--color-doux)]">
                      {activite.commune}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <LienBouton href="/agenda">{voirAgenda}</LienBouton>
    </section>
  );
}
