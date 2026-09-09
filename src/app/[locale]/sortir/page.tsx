import { getLocale } from "next-intl/server";

import { currentAccount } from "@/lib/session";
import { EcranSortir } from "./ecran-sortir";

/**
 * Même écran que `/`, donc même page aux yeux d'un moteur : l'adresse canonique est
 * l'accueil, sinon les deux se font concurrence et aucune ne l'emporte.
 */
export async function generateMetadata() {
  const locale = await getLocale();
  return { alternates: { canonical: `https://allezou.ch${locale === "fr" ? "" : `/${locale}`}` } };
}

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
