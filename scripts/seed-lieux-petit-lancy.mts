/**
 * Les lieux publics du Petit-Lancy, recensés une fois pour toutes.
 *
 *   npm run lieux:seed -- ton.adresse@exemple.ch
 *
 * Un catalogue vide fait un premier écran vide : personne n'ose y écrire le premier.
 * Ces lieux-ci sont publics et recensés par la commune elle-même (lancy.ch, août 2026) —
 * les écrire d'avance n'enlève rien à personne, et le catalogue reste corrigeable par
 * tous, comme le veut places.ts.
 *
 * Il passe par `createPlace`, qui refuse les doublons : le relancer ne crée jamais deux
 * fois le même lieu. Et il n'invente rien : pas de coordonnées, le géocodage du serveur
 * les trouvera par le circuit normal (geo.ts).
 *
 * En production, l'image n'embarque pas la chaîne TypeScript (choix du Dockerfile) :
 * c'est le jumeau SQL de ce fichier qui s'y exécute — seed-lieux-petit-lancy.sql, mêmes
 * lieux, même dédoublonnage. Une modification ici doit s'y refléter.
 */

import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

const { db } = await import("../src/lib/db/index.ts");
const s = await import("../src/lib/db/schema.ts");
const { createPlace } = await import("../src/lib/places.ts");

/** À qui attribuer la création : l'adresse en argument, sinon la première d'ADMIN_EMAILS. */
const ADRESSE = (process.argv[2] ?? (process.env.ADMIN_EMAILS ?? "").split(",")[0] ?? "")
  .trim()
  .toLowerCase();

if (!ADRESSE) {
  console.error(
    "Indique le compte auquel attribuer ces lieux :\n  npm run lieux:seed -- ton.adresse@exemple.ch",
  );
  process.exit(1);
}

const [compte] = await db
  .select()
  .from(s.account)
  .where(eq(s.account.email, ADRESSE))
  .limit(1);

if (!compte) {
  console.error(`Aucun compte pour ${ADRESSE} — connecte-toi une première fois, puis relance.`);
  process.exit(1);
}

/*
  Sources : lancy.ch/prestations/parcs-et-promenades (adresses officielles),
  lancy.ch/prestations/place-de-jeux, lancy.ch/annuaire/piscine-de-tivoli,
  lancy.ch/annuaire/maison-de-quartier-villa-tacchini, biblio.lancy.ch.

  Les préaux d'école portent le nom de l'école entre parenthèses : le géocodeur essaie
  la forme sans parenthèses quand la pleine échoue (variantesDeRequete), et « École de
  Tivoli » se trouve là où « Préau de l'école de Tivoli » ne se trouverait pas.

  La ludothèque municipale est au Grand-Lancy — c'est pourtant celle des familles du
  Petit-Lancy, la commune n'en a qu'une. Elle porte sa vraie commune, pas la nôtre.
*/
const LIEUX: {
  name: string;
  commune: string;
  address?: string;
  categorie: string;
}[] = [
  // Parcs — lancy.ch, « Parcs et promenades »
  { name: "Parc Louis-Bertrand", commune: "Petit-Lancy", categorie: "parc" },
  { name: "Parc du Gué", commune: "Petit-Lancy", address: "Chemin du Gué 8", categorie: "parc" },
  { name: "Parc des Morgines", commune: "Petit-Lancy", address: "Avenue des Morgines 33", categorie: "parc" },
  { name: "Parc Cérésole", commune: "Petit-Lancy", address: "Chemin de la Vendée 31", categorie: "parc" },
  { name: "Parc Chuit", commune: "Petit-Lancy", address: "Chemin des Érables 17", categorie: "parc" },
  { name: "Parc de Tivoli", commune: "Petit-Lancy", address: "Chemin du Fief-de-Chapitre 15", categorie: "parc" },
  { name: "Parc Saint-Marc", commune: "Petit-Lancy", address: "Avenue du Bois-de-la-Chapelle 19", categorie: "parc" },
  { name: "Parc Alphonse-Bernasconi", commune: "Petit-Lancy", address: "Chemin des Vignes 2", categorie: "parc" },

  // Places de jeux hors parcs — lancy.ch, « Place de jeux »
  { name: "Place de jeux Clair-Matin", commune: "Petit-Lancy", categorie: "aire_de_jeux" },
  { name: "Square Vendée", commune: "Petit-Lancy", categorie: "aire_de_jeux" },
  { name: "École de Tivoli (préau)", commune: "Petit-Lancy", categorie: "aire_de_jeux" },
  { name: "École Cérésole (préau)", commune: "Petit-Lancy", categorie: "aire_de_jeux" },
  { name: "École Caroline (préau)", commune: "Petit-Lancy", categorie: "aire_de_jeux" },
  { name: "École des Morgines (préau)", commune: "Petit-Lancy", categorie: "aire_de_jeux" },
  { name: "École du Petit-Lancy (préau)", commune: "Petit-Lancy", categorie: "aire_de_jeux" },

  // Le reste du quartier
  {
    name: "Piscine de Tivoli",
    commune: "Petit-Lancy",
    address: "Chemin du Fief-de-Chapitre 15",
    categorie: "piscine",
  },
  {
    name: "Bibliothèque municipale de Lancy",
    commune: "Petit-Lancy",
    address: "Route du Pont-Butin 70",
    categorie: "bibliotheque",
  },
  {
    name: "Villa Tacchini (maison de quartier)",
    commune: "Petit-Lancy",
    address: "Chemin de l'Avenir 11",
    categorie: "maison_quartier",
  },
  {
    name: "Ludothèque municipale de Lancy",
    commune: "Grand-Lancy",
    address: "Avenue des Communes-Réunies 73, Espace Palettes",
    categorie: "ludotheque",
  },
];

let ajoutes = 0;
let racines = 0;

for (const lieu of LIEUX) {
  const avant = await db.select({ id: s.place.id }).from(s.place);
  const cree = await createPlace(compte.id, lieu);
  if (!cree.ok) {
    console.error(`refusé   : ${lieu.name} (${cree.reason})`);
    continue;
  }
  const apres = await db.select({ id: s.place.id }).from(s.place);
  if (apres.length > avant.length) {
    ajoutes += 1;
    console.log(`ajouté   : ${lieu.name}`);
  } else {
    racines += 1;
    console.log(`déjà là  : ${lieu.name}`);
  }
}

console.log(`\n${ajoutes} lieu(x) ajouté(s), ${racines} déjà en place.`);
console.log("Les positions viendront du géocodage du serveur, au fil de ses passages.");

process.exit(0);
