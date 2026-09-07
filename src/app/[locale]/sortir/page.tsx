import { currentAccount } from "@/lib/session";
import { EcranSortir } from "./ecran-sortir";

/**
 * « Nous sortons », à son adresse historique. Le même écran sert d'accueil sous `/` ;
 * ici, il garde surtout les liens de l'application (onglet, bouton « Annoncer une
 * sortie ») et l'adresse de retour après une erreur de déclaration.
 */
export default async function Sortir({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const [account, { erreur }] = await Promise.all([currentAccount(), searchParams]);
  return <EcranSortir account={account} erreur={erreur} />;
}
