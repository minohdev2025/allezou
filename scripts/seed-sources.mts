/**
 * Sources de l'agenda genevois — état vérifié le 18 août 2026.
 *
 *   npm run sources:seed
 *
 * La Ville de Genève expose du schema.org `Event` en JSON-LD sur chaque fiche (titre, dates,
 * lieu, adresse). Rien n'y est interprété, donc rien n'y est inventé.
 *
 * Les communes sans flux structuré passent par une lecture MiniMax M3. Leurs agendas
 * paginent en `?page=N` quand ils paginent ; un site qui ignore le paramètre rend une page
 * identique à la première, que la lecture reconnaît et ignore.
 *
 * `lireFiches: true` ouvre la fiche de chaque activité dont le lien a été retrouvé : le
 * lien exact remplace la page de liste, et la fiche apporte l'heure, la description, l'âge,
 * le tarif. `lieuParDefaut` inscrit l'adresse de la maison pour les enseignes qui ne
 * l'écrivent pas sur chaque annonce. La relecture croisée est active partout où on ne l'a
 * pas débrayée (`verifierIA: false`) : un second passage du modèle relit chaque activité
 * avant sa première publication.
 *
 * `autoPublish: true` ne veut pas dire « publier les yeux fermés » : chaque activité passe
 * les contrôles de `src/lib/ingest/controles.ts`, et ce qui en échoue un seul retombe en
 * file. Une source qu'on vient d'ajouter reste à `autoPublish: false` le temps de regarder
 * ce qu'elle rapporte vraiment — c'est le cas de toutes celles du tour du 18 août.
 *
 * Plusieurs communes tiennent leur agenda sous WordPress avec le greffon « The Events
 * Calendar », qui publie tout en iCalendar derrière `?ical=1`. C'est la meilleure source
 * possible : rien à interpréter, un identifiant stable, un fuseau déclaré.
 *
 * Le tour du canton du 14 août avait retenu six sources ; celui du 18 août rouvre le
 * dossier, et voici ce qu'il a trouvé — et écarté :
 *
 * - **Onex a refait son site** (rendu serveur Nuxt) : les liens de fiches existent
 *   maintenant dans la page servie. L'agenda gagne `itemPattern` et `lireFiches`.
 * - **Carouge et Meyrin** ne composent plus tout dans le navigateur : leurs listes servent
 *   les liens de fiches. Meyrin n'écrit guère de dates sur sa liste — si la source reste
 *   muette, c'est là qu'il faudra regarder.
 * - **Chancy** a rempli son iCal (`/agenda-communal/?ical=1`), vide le 14 août. **Soral**
 *   garde le sien vide ; à resonder.
 * - **geneve-communes.ch** est la plateforme mutualisée des communes genevoises, sur le
 *   même socle que geneve.ch : chaque fiche expose du schema.org `Event` en JSON-LD, et la
 *   liste se filtre par facettes — `public:33` pour « Familles », `commune:NN` pour une
 *   commune. On ne la lit que pour les communes qu'on ne sait pas lire en direct :
 *   Plan-les-Ouates (25), Thônex (61), Versoix (271), Confignon (272) — et Veyrier (259),
 *   dont la page communale n'est qu'une liste annuelle sans horaires. Les autres communes
 *   présentes (Ville de Genève, Lancy, Onex, Carouge, Cologny) ont leur propre source, plus
 *   riche : les lire deux fois ne ferait que des doublons. La facette est à resonder de
 *   temps en temps — une commune de plus peut s'y mettre ; la Ville de Genève y compte 174
 *   événements famille quand notre lecture directe s'arrête à trois pages, c'est la piste
 *   si l'agenda genevois semble un jour trop court.
 * - **Cologny** affiche un agenda OpenAgenda dont l'export JSON public répond
 *   (agenda 10019287, 17 événements au 18 août). La page se lit très bien en HTML ; le
 *   jour où un adaptateur structuré vaut la peine, l'identifiant est là.
 * - **Presinge** pointe un agenda OpenAgenda vide (81186525). À reprendre.
 * - **Genthod, Satigny, Hermance, Pregny-Chambésy, Corsier, Chêne-Bourg, Bellevue,
 *   Bernex, Jussy** : agendas composés dans le navigateur, page servie sans contenu ni
 *   liens. Rien à lire, ni pour nous ni pour le modèle — sauf à ce qu'ils rejoignent la
 *   plateforme mutualisée, où on les trouvera.
 * - **Choulex** publie sa liste annuelle en PDF. **Céligny** ne parle de manifestations
 *   que pour les autorisations. **Aire-la-Ville, Bardonnex, Cartigny, Dardagny, Gy,
 *   Avully, Avusy** : pas d'agenda trouvable sur leur site.
 * - Le flux `ge.ch/rss/evenement` de l'État reste institutionnel, et les RSS communaux ne
 *   portent que la date de publication de l'article, pas celle de l'activité.
 *
 * Côté privés, le même tour a regardé ce que les parents demandent :
 *
 * - **Lancy Centre** annonce ses animations (Miniville, ateliers) sur `/actualites/`,
 *   142 mentions de dates côté serveur. Les fiches sont des articles à la racine du site,
 *   d'où l'`itemPattern` large — l'appariement par titre et la relecture de fiche font le
 *   tri.
 * - **Balexert** a un vrai type « événement » (Mini Migros, LEGO, ateliers en boutique) ;
 *   sa liste sert les dates mais compose ses cartes en JavaScript : les liens de fiches
 *   ne sont pas dans la page servie, les activités renvoient donc à la liste.
 * - **Le Centre (Lancy-Onex)** tient une page `/evenements/` sous WordPress.
 * - **Écartés pour l'instant** : Airloop (offre permanente, pas d'agenda daté servi),
 *   Le Môll (site applicatif, cinq dates lisibles sur toute la page), La Praille (son
 *   Kids Club n'écrit pas de dates côté serveur), la Maison de la Créativité (programme
 *   composé dans le navigateur, archive `/event/` ancienne). Tous à resonder : ce sont
 *   exactement les lieux que les familles cherchent.
 */

import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

const { db } = await import("../src/lib/db/index.ts");
const s = await import("../src/lib/db/schema.ts");

const SOURCES = [
  /* ------------------------------------------------------------ les vétérans */
  {
    name: "Ville de Genève — agenda enfants et famille",
    url: "https://www.geneve.ch/fr/agenda?f%5B0%5D=for_who%3A167",
    kind: "jsonld" as const,
    commune: "Genève",
    autoPublish: true,
    config: { itemPattern: "/agenda/", maxPages: 3 },
  },
  {
    name: "Lancy — agenda communal",
    url: "https://www.lancy.ch/agenda",
    kind: "html_ai" as const,
    commune: "Lancy",
    autoPublish: true,
    // `itemPattern` sert à retrouver le lien de chaque fiche dans la page de liste : le
    // texte envoyé au modèle est débarrassé de ses balises, donc il n'y voit aucun `href`.
    // Lancy écrit le titre seul dans le lien, ce qui suffit à les rapprocher.
    config: { maxPages: 3, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Chêne-Bougeries — agenda communal",
    url: "https://chene-bougeries.ch/evenements/?ical=1",
    kind: "ical" as const,
    commune: "Chêne-Bougeries",
    autoPublish: true,
    // Le greffon range les séances du Conseil municipal avec le reste de l'agenda. Un
    // parent qui cherche une sortie de samedi n'a rien à faire de l'ordre du jour de la
    // mairie.
    config: { categoriesIgnorees: ["Séances Conseil municipal"] },
  },
  {
    name: "Laconnex — agenda communal",
    url: "https://www.laconnex.ch/agenda/?ical=1",
    kind: "ical" as const,
    commune: "Laconnex",
    autoPublish: true,
    // « Politique » couvre les séances du Conseil, « Ferraille » les levées d'encombrants.
    config: { categoriesIgnorees: ["Politique", "Ferraille"] },
  },
  {
    name: "Vernier — agenda communal",
    url: "https://www.vernier.ch/evenements",
    kind: "html_ai" as const,
    commune: "Vernier",
    autoPublish: true,
    // La plus grande commune du canton après la Ville. Quatre pages de liste, qui paginent
    // en `?page=N`. Le lien de fiche porte le titre suivi de la date, ce que la recherche
    // par préfixe retrouve.
    config: { maxPages: 4, itemPattern: "/evenements/", lireFiches: true },
  },
  {
    name: "Onex — agenda communal",
    url: "https://www.onex.ch/mes-loisirs/agenda/",
    kind: "html_ai" as const,
    commune: "Onex",
    autoPublish: true,
    // Six pages couvrent environ deux mois ; la première ne contient guère que des cours
    // de fitness pour adultes, s'arrêter là donnait une source « ok » qui ne rapportait
    // rien. Le site refait en août sert enfin les liens de fiches : la carte écrit la date
    // avant le titre, c'est l'appariement tolérant — couvert par la lecture de fiche — qui
    // les retrouve.
    config: { maxPages: 6, itemPattern: "/agenda/", lireFiches: true },
  },

  /* ------------------------------------- le tour du 18 août : communes */
  {
    name: "Chancy — agenda communal",
    url: "https://www.chancy.ch/agenda-communal/?ical=1",
    kind: "ical" as const,
    commune: "Chancy",
    autoPublish: false,
    config: {},
  },
  {
    name: "Carouge — agenda communal",
    url: "https://carouge.ch/agenda",
    kind: "html_ai" as const,
    commune: "Carouge",
    autoPublish: false,
    config: { maxPages: 3, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Meyrin — agenda communal",
    url: "https://www.meyrin.ch/fr/agenda",
    kind: "html_ai" as const,
    commune: "Meyrin",
    autoPublish: false,
    // La liste sert ses liens mais compose ses dates dans le navigateur : rien à extraire
    // d'elle, tout à lire derrière. Chaque fiche fait l'événement.
    config: { maxPages: 3, itemPattern: "/fr/agenda/", modeFiches: true },
  },
  {
    name: "Grand-Saconnex — agenda communal",
    url: "https://www.grand-saconnex.ch/agenda",
    kind: "html_ai" as const,
    commune: "Grand-Saconnex",
    autoPublish: false,
    config: { maxPages: 3, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Anières — agenda communal",
    url: "https://anieres.ch/agenda",
    kind: "html_ai" as const,
    commune: "Anières",
    autoPublish: false,
    config: { maxPages: 2, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Vandœuvres — agenda communal",
    url: "https://www.vandoeuvres.ch/actualites/agenda/",
    kind: "html_ai" as const,
    commune: "Vandœuvres",
    autoPublish: false,
    config: { maxPages: 2, itemPattern: "/evenement/", lireFiches: true },
  },
  {
    name: "Collex-Bossy — agenda communal",
    url: "https://collex-bossy.ch/fr/agenda/",
    kind: "html_ai" as const,
    commune: "Collex-Bossy",
    autoPublish: false,
    // Pagine en `/page-1/`, pas en `?page=N` : une seule page lue, qui suffit à un petit
    // agenda.
    config: { maxPages: 1, itemPattern: "/fr/agenda/", lireFiches: true },
  },
  {
    name: "Perly-Certoux — agenda communal",
    url: "https://www.perly-certoux.ch/fr/agenda/",
    kind: "html_ai" as const,
    commune: "Perly-Certoux",
    autoPublish: false,
    config: { maxPages: 1, itemPattern: "/fr/agenda/", lireFiches: true },
  },
  {
    name: "Cologny — agenda communal",
    url: "https://cologny.ch/agenda",
    kind: "html_ai" as const,
    commune: "Cologny",
    autoPublish: false,
    config: { maxPages: 1, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Troinex — manifestations communales",
    url: "https://troinex.ch/vivre-ici/vie-sociale/manifestation-communales-et-agenda/",
    kind: "html_ai" as const,
    commune: "Troinex",
    autoPublish: false,
    config: { maxPages: 1 },
  },
  {
    name: "Russin — événements",
    url: "https://www.russin.ch/evenements/",
    kind: "html_ai" as const,
    commune: "Russin",
    autoPublish: false,
    config: { maxPages: 1 },
  },
  /*
    La plateforme mutualisée, une commune à la fois.

    Même socle que geneve.ch : JSON-LD sur chaque fiche, rien à interpréter. Le filtre
    « Familles » (public:33) et la facette commune font le tri à la source. On n'y lit que
    les communes sans porte directe — les autres ont leur propre source, plus complète, et
    les lire deux fois ne ferait que remplir la file de doublons.
  */
  {
    name: "Plan-les-Ouates — agenda famille (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A25",
    kind: "jsonld" as const,
    commune: "Plan-les-Ouates",
    autoPublish: false,
    config: { itemPattern: "/agenda/", maxPages: 2 },
  },
  {
    name: "Thônex — agenda famille (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A61",
    kind: "jsonld" as const,
    commune: "Thônex",
    autoPublish: false,
    config: { itemPattern: "/agenda/", maxPages: 2 },
  },
  {
    name: "Versoix — agenda famille (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A271",
    kind: "jsonld" as const,
    commune: "Versoix",
    autoPublish: false,
    config: { itemPattern: "/agenda/", maxPages: 2 },
  },
  {
    name: "Confignon — agenda famille (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A272",
    kind: "jsonld" as const,
    commune: "Confignon",
    autoPublish: false,
    config: { itemPattern: "/agenda/", maxPages: 2 },
  },
  {
    // La page communale de Veyrier n'est qu'une liste annuelle sans horaires : la
    // plateforme, elle, porte de vraies fiches datées.
    name: "Veyrier — agenda famille (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A259",
    kind: "jsonld" as const,
    commune: "Veyrier",
    autoPublish: false,
    config: { itemPattern: "/agenda/", maxPages: 2 },
  },

  /* --------------------------------------- le tour du 18 août : privés */
  {
    name: "Lancy Centre — animations",
    url: "https://www.lancycentre.ch/actualites/",
    kind: "html_ai" as const,
    commune: "Lancy",
    autoPublish: false,
    // Les fiches sont des articles à la racine du site — pas de segment « /actualites/ »
    // dans leurs adresses. Le motif large laisse passer la navigation, que l'appariement
    // par titre écarte, et la lecture de fiche démasque ce qui resterait.
    config: {
      maxPages: 1,
      itemPattern: "lancycentre.ch/",
      lireFiches: true,
      lieuParDefaut: "Lancy Centre, Grand-Lancy",
    },
  },
  {
    name: "Balexert — événements",
    url: "https://www.balexert.ch/evenements/",
    kind: "html_ai" as const,
    commune: "Vernier",
    autoPublish: false,
    // Les cartes de la liste se composent dans le navigateur : les dates se lisent, pas
    // les liens. Les activités renvoient donc à la liste, ce qui est moins bien qu'un lien
    // direct et mieux qu'un lien deviné.
    config: { maxPages: 1, lieuParDefaut: "Centre commercial Balexert, Vernier" },
  },
  {
    name: "Le Centre Lancy-Onex — événements",
    url: "https://lancy.le-centre.ch/evenements/",
    kind: "html_ai" as const,
    commune: "Lancy",
    autoPublish: false,
    config: {
      maxPages: 1,
      itemPattern: "/evenement",
      lireFiches: true,
      lieuParDefaut: "Le Centre, Lancy-Onex",
    },
  },
];

/**
 * Les sources qu'une meilleure porte a remplacées. On les endort au lieu de les effacer :
 * leurs activités portent leur histoire, et une source inactive ne coûte rien.
 */
const RETIREES = [
  // Remplacée par les sources « plateforme des communes », une commune à la fois.
  "https://geneve-communes.ch/agenda",
  // La liste annuelle sans horaires ; la plateforme porte les vraies fiches de Veyrier.
  "https://veyrier.ch/vivre-a-veyrier/culture-sports-et-loisirs/manifestations-communales/",
];

for (const source of SOURCES) {
  const [existing] = await db
    .select({ id: s.source.id })
    .from(s.source)
    .where(eq(s.source.url, source.url))
    .limit(1);

  if (existing) {
    await db.update(s.source).set(source).where(eq(s.source.id, existing.id));
    console.log(`mise à jour : ${source.name}`);
  } else {
    await db.insert(s.source).values(source);
    console.log(`ajoutée     : ${source.name}`);
  }
}

for (const url of RETIREES) {
  const [endormie] = await db
    .update(s.source)
    .set({ active: false })
    .where(eq(s.source.url, url))
    .returning({ name: s.source.name });
  if (endormie) console.log(`endormie    : ${endormie.name}`);
}

process.exit(0);
