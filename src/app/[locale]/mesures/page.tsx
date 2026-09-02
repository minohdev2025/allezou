import { comptesOuverts } from "@/lib/mesures";
import { requireRelecteur } from "@/lib/session";
import { Carte, LienBouton, Titre } from "../ui";

/**
 * Combien de familles ont ouvert un compte.
 *
 * Réservé au compte de relecture, comme l'agenda : le même pouvoir, défini par `ADMIN_EMAILS`
 * dans la configuration du serveur et non par un rôle en base.
 */
export default async function Mesures() {
  await requireRelecteur();
  const comptes = await comptesOuverts();

  return (
    <main className="apparait">
      <Titre
        emoji="📊"
        sous="Ce que la base sait déjà, sans que rien ne soit collecté pour le savoir."
      >
        Les familles
      </Titre>

      <Carte className="mb-6 text-center">
        <p className="text-5xl font-bold tabular-nums">{comptes}</p>
        <p className="mt-1 font-bold">
          compte{comptes > 1 ? "s" : ""} ouvert{comptes > 1 ? "s" : ""}
        </p>
      </Carte>

      <LienBouton href="/compte">Retour</LienBouton>
    </main>
  );
}

/** Un nombre qui change à chaque visite : rien à mettre en cache. */
export const dynamic = "force-dynamic";

export const metadata = { title: "Les familles" };
