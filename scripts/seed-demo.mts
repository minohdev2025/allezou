/**
 * Jeu de données de démonstration — développement uniquement.
 *
 *   npm run demo:seed
 *
 * Crée deux cercles peuplés autour de ton compte : une classe de 10 enfants et un
 * voisinage de 12, avec deux familles présentes dans les deux — c'est ce cas-là qui rend
 * l'isolation visible à l'écran. Ajoute aussi des lieux, des sorties en cours et à venir.
 *
 * Le script passe par les mêmes fonctions que l'application : les invariants sont
 * respectés, et ce qu'on voit à l'écran est ce que produirait un vrai usage.
 */

import { config } from "dotenv";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";

config({ path: ".env.local" });

if (process.env.NODE_ENV === "production") {
  console.error("Refus : ce script ne s'exécute pas en production.");
  process.exit(1);
}

const { db } = await import("../src/lib/db/index.ts");
const s = await import("../src/lib/db/schema.ts");
const { addChild, myChildren } = await import("../src/lib/children.ts");
const { createCircle } = await import("../src/lib/circles.ts");
const { createPlace } = await import("../src/lib/places.ts");
const { declareAttendance, declarePresence, joinPresence } = await import(
  "../src/lib/publications.ts"
);

/**
 * À qui rattacher la démo : l'adresse passée en argument, sinon la première d'ADMIN_EMAILS.
 *
 *   npm run demo:seed -- mon.adresse@exemple.ch
 *
 * C'est le piège de la première version : les cercles avaient été montés autour d'un compte,
 * et la personne qui essayait l'application s'était connectée avec une autre adresse.
 */
const TON_ADRESSE = (process.argv[2] ?? (process.env.ADMIN_EMAILS ?? "").split(",")[0] ?? "")
  .trim()
  .toLowerCase();

if (!TON_ADRESSE) {
  console.error(
    "Indique l'adresse à laquelle rattacher la démo :\n  npm run demo:seed -- ton.adresse@exemple.ch",
  );
  process.exit(1);
}

/* ------------------------------------------------------------------- comptes */

async function compte(email: string, nom: string) {
  const [existant] = await db.select().from(s.account).where(eq(s.account.email, email)).limit(1);
  if (existant) return existant;

  const [cree] = await db
    .insert(s.account)
    .values({ email, displayName: nom })
    .returning();
  return cree;
}

async function famille(nom: string, email: string, enfants: string[]) {
  const parent = await compte(email, nom);
  const deja = (await myChildren(parent.id)).map((e) => e.firstName);

  for (const prenom of enfants) {
    if (!deja.includes(prenom)) await addChild(parent.id, { firstName: prenom });
  }
  return parent;
}

/* ------------------------------------------------------------------ familles */

// Sept familles, dix enfants : c'est la classe.
const CLASSE = [
  { nom: "Maman de Léa", email: "lea@demo.test", enfants: ["Léa", "Noé"] },
  { nom: "Papa de Nolan", email: "nolan@demo.test", enfants: ["Nolan"] },
  { nom: "Sophie", email: "sophie@demo.test", enfants: ["Emma", "Lina"] },
  { nom: "Maman de Zoé", email: "zoe@demo.test", enfants: ["Zoé"] },
  { nom: "José", email: "jose@demo.test", enfants: ["Iris", "Rayan"] },
  { nom: "Maman d'Elias", email: "elias@demo.test", enfants: ["Elias"] },
  { nom: "Papa de Camille", email: "camille@demo.test", enfants: ["Camille"] },
];

// Huit familles, douze enfants : le voisinage. Sophie et José sont dans les deux.
const VOISINAGE = [
  { nom: "Sophie", email: "sophie@demo.test", enfants: [] },
  { nom: "José", email: "jose@demo.test", enfants: [] },
  { nom: "Maman de Sacha", email: "sacha@demo.test", enfants: ["Sacha", "Mila"] },
  { nom: "Nadia", email: "nadia@demo.test", enfants: ["Théo", "Jade"] },
  { nom: "Papa d'Alice", email: "alice@demo.test", enfants: ["Alice"] },
  { nom: "Marco", email: "marco@demo.test", enfants: ["Tom", "Nina"] },
  { nom: "Maman de Yasmine", email: "yasmine@demo.test", enfants: ["Yasmine", "Adam"] },
  { nom: "Papa de Louis", email: "louis@demo.test", enfants: ["Louis"] },
];

const LIEUX = [
  { name: "Parc du Gué", commune: "Petit-Lancy", categorie: "parc" },
  { name: "Parc Navazza-Oltramare", commune: "Grand-Lancy", categorie: "parc" },
  { name: "Bois de la Bâtie", commune: "Genève", categorie: "parc" },
  { name: "Ludothèque de Lancy", commune: "Grand-Lancy", categorie: "ludotheque" },
  { name: "Piscine de Marignac", commune: "Grand-Lancy", categorie: "piscine" },
  { name: "Préau de l'école du Gué", commune: "Petit-Lancy", categorie: "aire_de_jeux" },
];

/* ------------------------------------------------------------------ montage */

const toi = await compte(TON_ADRESSE, "Papa de Matéo");
if ((await myChildren(toi.id)).length === 0) {
  await addChild(toi.id, { firstName: "Matéo" });
}

/** Te fait entrer comme administrateur, ou te remet dedans si tu en étais sorti. */
async function tAdmettre(circleId: string) {
  const [deja] = await db
    .select({ id: s.circleMembership.id })
    .from(s.circleMembership)
    .where(
      and(
        eq(s.circleMembership.circleId, circleId),
        eq(s.circleMembership.accountId, toi.id),
        isNull(s.circleMembership.leftAt),
      ),
    )
    .limit(1);

  if (deja) return false;

  await db
    .insert(s.circleMembership)
    .values({ circleId, accountId: toi.id, role: "admin" });
  return true;
}

async function cercle(nom: string, membres: typeof CLASSE) {
  const [deja] = await db.select().from(s.circle).where(eq(s.circle.name, nom)).limit(1);
  if (deja) {
    const ajoute = await tAdmettre(deja.id);
    console.log(`déjà là   : ${nom}${ajoute ? " — tu y es maintenant admin" : ""}`);
    return deja.id;
  }

  const cree = await createCircle(toi.id, nom);
  if (!cree.ok) throw new Error(cree.reason);

  for (const m of membres) {
    const parent = await famille(m.nom, m.email, m.enfants);
    // On entre directement : le parcours d'invitation est testé ailleurs, ici on veut
    // simplement un cercle habité.
    await db.insert(s.circleMembership).values({
      circleId: cree.value.id,
      accountId: parent.id,
    });
  }

  console.log(`créé      : ${nom} (${membres.length + 1} familles)`);
  return cree.value.id;
}

const classeId = await cercle("Classe de 4P — démo", CLASSE);
const voisinageId = await cercle("Voisinage du Petit-Lancy — démo", VOISINAGE);

const lieux: { id: string; name: string }[] = [];
for (const lieu of LIEUX) {
  const cree = await createPlace(toi.id, lieu);
  if (cree.ok) lieux.push(cree.value);
}
console.log(`lieux     : ${lieux.length}`);

/* ------------------------------------------------------------------ sorties */

async function enfantsDe(email: string) {
  const [parent] = await db.select().from(s.account).where(eq(s.account.email, email)).limit(1);
  return { parent, enfants: (await myChildren(parent.id)).map((e) => e.id) };
}

async function sortie(
  email: string,
  lieuIndex: number,
  circleIds: string[],
  minutes: number,
  options: { dansMinutes?: number; note?: string; rejoignent?: string[] } = {},
) {
  const { parent, enfants } = await enfantsDe(email);

  const result = await declarePresence(parent.id, {
    placeId: lieux[lieuIndex].id,
    circleIds,
    childIds: enfants,
    minutes,
    note: options.note,
    startsAt: options.dansMinutes
      ? new Date(Date.now() + options.dansMinutes * 60_000)
      : undefined,
  });

  if (!result.ok) {
    console.log(`  sortie ignorée (${result.reason})`);
    return;
  }

  for (const autre of options.rejoignent ?? []) {
    const { parent: p, enfants: e } = await enfantsDe(autre);
    await joinPresence(p.id, result.value.publicationId, e);
  }
}

// On ne regarde que les sorties des familles de démo : celles que tu as créées toi-même
// ne doivent ni bloquer le script, ni être touchées par lui.
const { parent: premiereFamille } = await enfantsDe("lea@demo.test");
const dejaDesSorties = await db
  .select({ id: s.publication.id })
  .from(s.publication)
  .where(eq(s.publication.authorId, premiereFamille.id))
  .limit(1);

if (dejaDesSorties.length > 0) {
  console.log("sorties   : démo déjà en place, rien ajouté");
} else {
  await sortie("lea@demo.test", 0, [classeId], 150, {
    note: "On est côté toboggan, la pataugeoire est ouverte",
    rejoignent: ["nolan@demo.test", "jose@demo.test", "sophie@demo.test"],
  });
  await sortie("marco@demo.test", 1, [voisinageId], 120, {
    rejoignent: ["nadia@demo.test", "yasmine@demo.test"],
  });
  // Sophie publie aux deux cercles : José la voit par la classe, Marco par le voisinage,
  // et ils ne se voient pas l'un l'autre dans la liste des participants.
  await sortie("sophie@demo.test", 2, [classeId, voisinageId], 180, {
    rejoignent: ["jose@demo.test", "marco@demo.test"],
  });
  await sortie("nadia@demo.test", 4, [voisinageId], 120, { dansMinutes: 26 * 60 });
  await sortie("camille@demo.test", 3, [classeId], 90, { dansMinutes: 3 * 60 });
  console.log("sorties   : 5 créées, dont 2 à venir");
}

/* ------------------------------------------------- inscriptions à l'agenda */

/**
 * Sans inscriptions de démo, le filtre « où va quelqu'un de mes cercles » n'a jamais rien
 * à montrer : il ne compte pas les siennes propres.
 */
const aVenirAgenda = await db
  .select({ id: s.event.id, title: s.event.title })
  .from(s.event)
  .where(and(isNotNull(s.event.publishedAt), gt(s.event.startsAt, new Date())))
  .orderBy(s.event.startsAt)
  .limit(3);

// On regarde les inscriptions, pas les sorties : la première famille en a déjà une.
const dejaInscrits = await db
  .select({ id: s.publication.id })
  .from(s.publication)
  .where(
    and(
      eq(s.publication.authorId, premiereFamille.id),
      eq(s.publication.kind, "attendance"),
    ),
  )
  .limit(1);

if (aVenirAgenda.length === 0) {
  console.log("agenda    : aucune activité à venir, aucune inscription ajoutée");
} else if (dejaInscrits.length > 0 && dejaInscrits[0]) {
  console.log("agenda    : inscriptions de démo déjà en place");
} else {
  const inscriptions: [string, string[]][] = [
    ["lea@demo.test", [classeId]],
    ["sophie@demo.test", [classeId, voisinageId]],
    ["marco@demo.test", [voisinageId]],
  ];

  let posees = 0;
  for (const [index, evenement] of aVenirAgenda.entries()) {
    const [email, circleIds] = inscriptions[index % inscriptions.length];
    const { parent, enfants } = await enfantsDe(email);
    const faite = await declareAttendance(parent.id, {
      eventId: evenement.id,
      circleIds,
      childIds: enfants,
    });
    if (faite.ok) posees += 1;
  }
  console.log(`agenda    : ${posees} inscriptions posées sur des activités à venir`);
}

console.log(`\nConnecte-toi avec ${TON_ADRESSE} pour tout voir.`);
process.exit(0);
