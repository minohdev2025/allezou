import { mesures } from "@/lib/mesures";
import { requireRelecteur } from "@/lib/session";
import { Carte, LienBouton, Titre } from "../ui";

/**
 * Combien de familles, et où elles en sont.
 *
 * Réservé au compte de relecture, comme l'agenda : c'est le même pouvoir, défini par
 * `ADMIN_EMAILS` dans la configuration du serveur et non par un rôle en base.
 *
 * Trois nombres et rien d'autre. Un écran de mesure grossit tout seul si on le laisse faire,
 * et ce qui s'y ajoute finit toujours par regarder quelqu'un : ici on regarde combien, jamais
 * qui.
 */
export default async function Mesures() {
  await requireRelecteur();
  const m = await mesures();

  const lignes = [
    {
      valeur: m.comptes,
      quoi: "familles inscrites",
      detail: `dont ${m.comptesNouveaux7j} cette semaine`,
    },
    {
      valeur: m.comptesAvecEnfant,
      quoi: "ont déclaré un enfant",
      // L'écart entre les deux est le seul endroit où l'on voit une arrivée s'interrompre.
      detail:
        m.comptes > m.comptesAvecEnfant
          ? `${m.comptes - m.comptesAvecEnfant} se sont arrêtées en route`
          : "toutes sont allées au bout",
    },
  ];

  return (
    <main className="apparait">
      <Titre
        emoji="📊"
        sous="Ce que la base sait déjà, sans que rien ne soit collecté pour le savoir."
      >
        Les familles
      </Titre>

      <Carte accent="corail" className="mb-6">
        <ul className="space-y-3">
          {lignes.map((ligne) => (
            <li key={ligne.quoi} className="flex items-baseline gap-3">
              <span className="min-w-12 text-right text-3xl font-bold tabular-nums">
                {ligne.valeur}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-tight">{ligne.quoi}</span>
                <span className="text-sm leading-snug text-[color:var(--color-doux)]">
                  {ligne.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Carte>

      {/*
        La place du nombre manquant est marquée plutôt que laissée en blanc : sans cela, on se
        demanderait dans six mois pourquoi il n'y est pas, et on l'ajouterait sans se poser la
        question de la page.
      */}
      <Carte accent="ambre" className="mb-6">
        <p className="mb-1 font-bold">Vues sur 7 jours : pas encore</p>
        <p className="leading-snug text-[color:var(--color-doux)]">
          La date de dernière visite existe en base, mais la page des données ne l&apos;annonce
          pas. Elle s&apos;affichera ici le jour où cette page la dira, et pas avant.
        </p>
      </Carte>

      <LienBouton href="/compte">Retour</LienBouton>
    </main>
  );
}

/** Des nombres qui changent à chaque visite : rien à mettre en cache. */
export const dynamic = "force-dynamic";

export const metadata = { title: "Les familles" };
