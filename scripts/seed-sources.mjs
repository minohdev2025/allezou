/**
 * Sources de l'agenda genevois — état vérifié le 19 août 2026.
 *
 *   npm run sources:seed
 *
 * Volontairement en JavaScript et non en TypeScript, comme `migrer.mjs` et pour la même
 * raison : ce script doit tourner en production, dans une image d'où `tsx` et `typescript`
 * ont été retirés. Il parle donc à Postgres directement, sans passer par le schéma drizzle —
 * une table, trois requêtes, rien qui mérite une chaîne de construction.
 *
 * La Ville de Genève expose du schema.org `Event` en JSON-LD sur chaque fiche (titre, dates,
 * lieu, adresse). Rien n'y est interprété, donc rien n'y est inventé. Son filtre « Enfants
 * et famille », mesuré le 19 août, gardait 197 événements quand « Tous publics » en
 * comptait 762 — Fête de la rentrée comprise. La source lit donc l'agenda complet, et le
 * modèle trie ce qui s'adresse aux familles (`filtreFamille`) : oui, non, ou doute — le
 * doute part en file. Le tri ne touche à aucun fait, qui restent ceux du JSON-LD.
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
 * `autoPublish: true` partout, et ce n'est pas « publier les yeux fermés » : trois couches
 * machines gardent la porte — les contrôles littéraux de `controles.ts`, la relecture
 * croisée et le tri famille de `verification.ts` — et ce qui échoue à une seule retombe en
 * file. La doctrine de la période d'observation (`autoPublish: false` pour toute source
 * neuve) date du temps où les contrôles étaient seuls juges ; depuis le 19 août, la file
 * n'est plus un péage mais une liste d'exceptions : ce que les machines retiennent n'entre
 * pas à l'agenda, et expire de soi-même quand sa date passe. La relire est un luxe, plus
 * un travail.
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
 *   liste se filtre par facettes — `commune:NN` pour une commune, `public:33` pour
 *   « Enfants et famille ». On ne la lit que pour les communes qu'on ne sait pas lire en
 *   direct : Plan-les-Ouates (25), Thônex (61), Versoix (271), Confignon (272) — et
 *   Veyrier (259), dont la page communale n'est qu'une liste annuelle sans horaires. Les
 *   autres communes présentes (Ville de Genève, Lancy, Onex, Carouge, Cologny) ont leur
 *   propre source, plus riche : les lire deux fois ne ferait que des doublons. Le filtre
 *   famille, mesuré le 19 août, s'est révélé plus étroit que la question qu'on pose — à
 *   Plan-les-Ouates il garde 13 événements sur 62 et range le Cinéma en plein air gratuit
 *   dans « Tous publics » — donc on lit le flux complet et le modèle trie. La facette
 *   commune est à resonder de temps en temps : une commune de plus peut s'y mettre, et la
 *   Ville de Genève y publie bien plus que les trois pages de notre lecture directe.
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
 *   Avully, Avusy** : pas d'agenda trouvable sur leur site. Le 19 août, ces communes-là
 *   ont été écartées pour de bon : trop petites, trop loin, trop rarement une sortie qui
 *   vaille la traversée du canton.
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
 * - **Écartés pour de bon** : Airloop (offre permanente, pas d'agenda daté servi), Le Môll
 *   (site applicatif, cinq dates lisibles sur toute la page), La Praille (son Kids Club
 *   n'écrit pas de dates côté serveur), la Maison de la Créativité (programme composé dans
 *   le navigateur). Aucun n'expose d'agenda lisible ; tant pis pour eux s'ils ne sont pas
 *   référencés.
 */

import postgres from "postgres";

// dotenv est un outil de développement, absent de l'image de production — où la variable
// vient de l'environnement du conteneur. D'où ce chargement facultatif.
try {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
} catch {
  // Pas de dotenv : on est en production, DATABASE_URL est déjà là.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant : impossible d'inscrire les sources.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

const SOURCES = [
  /* ------------------------------------------------------------ les vétérans */
  {
    name: "Ville de Genève — agenda, tri famille",
    url: "https://www.geneve.ch/fr/agenda",
    kind: "jsonld",
    commune: "Genève",
    autoPublish: true,
    // Quatorze pages, parce que l'agenda complet avance d'une dizaine d'activités par
    // jour : cinq pages ne couvraient que la semaine, et une fenêtre plus courte que
    // l'horizon d'une famille faisait sortir de l'agenda des activités bien réelles.
    config: { itemPattern: "/agenda/", maxPages: 14, filtreFamille: true },
  },
  {
    name: "Lancy — agenda communal",
    url: "https://www.lancy.ch/agenda",
    kind: "html_ai",
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
    kind: "ical",
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
    kind: "ical",
    commune: "Laconnex",
    autoPublish: true,
    // « Politique » couvre les séances du Conseil, « Ferraille » les levées d'encombrants.
    config: { categoriesIgnorees: ["Politique", "Ferraille"] },
  },
  {
    name: "Vernier — agenda communal",
    url: "https://www.vernier.ch/evenements",
    kind: "html_ai",
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
    kind: "html_ai",
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
    kind: "ical",
    commune: "Chancy",
    autoPublish: true,
    config: {},
  },
  {
    name: "Carouge — agenda communal",
    url: "https://carouge.ch/agenda",
    kind: "html_ai",
    commune: "Carouge",
    autoPublish: true,
    config: { maxPages: 3, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Meyrin — agenda communal",
    url: "https://www.meyrin.ch/fr/agenda",
    kind: "html_ai",
    commune: "Meyrin",
    autoPublish: true,
    // La liste sert ses liens mais compose ses dates dans le navigateur : rien à extraire
    // d'elle, tout à lire derrière. Chaque fiche fait l'événement.
    config: { maxPages: 3, itemPattern: "/fr/agenda/", modeFiches: true },
  },
  {
    name: "Grand-Saconnex — agenda communal",
    url: "https://www.grand-saconnex.ch/agenda",
    kind: "html_ai",
    commune: "Grand-Saconnex",
    autoPublish: true,
    config: { maxPages: 3, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Anières — agenda communal",
    url: "https://anieres.ch/agenda",
    kind: "html_ai",
    commune: "Anières",
    autoPublish: true,
    config: { maxPages: 2, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Vandœuvres — agenda communal",
    url: "https://www.vandoeuvres.ch/actualites/agenda/",
    kind: "html_ai",
    commune: "Vandœuvres",
    autoPublish: true,
    config: { maxPages: 2, itemPattern: "/evenement/", lireFiches: true },
  },
  {
    name: "Collex-Bossy — agenda communal",
    url: "https://collex-bossy.ch/fr/agenda/",
    kind: "html_ai",
    commune: "Collex-Bossy",
    autoPublish: true,
    // Pagine en `/page-1/`, pas en `?page=N` : une seule page lue, qui suffit à un petit
    // agenda.
    config: { maxPages: 1, itemPattern: "/fr/agenda/", lireFiches: true },
  },
  {
    name: "Perly-Certoux — agenda communal",
    url: "https://www.perly-certoux.ch/fr/agenda/",
    kind: "html_ai",
    commune: "Perly-Certoux",
    autoPublish: true,
    config: { maxPages: 1, itemPattern: "/fr/agenda/", lireFiches: true },
  },
  {
    name: "Cologny — agenda communal",
    url: "https://cologny.ch/agenda",
    kind: "html_ai",
    commune: "Cologny",
    autoPublish: true,
    config: { maxPages: 1, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Troinex — manifestations communales",
    url: "https://troinex.ch/vivre-ici/vie-sociale/manifestation-communales-et-agenda/",
    kind: "html_ai",
    commune: "Troinex",
    autoPublish: true,
    config: { maxPages: 1 },
  },
  {
    name: "Russin — événements",
    url: "https://www.russin.ch/evenements/",
    kind: "html_ai",
    commune: "Russin",
    autoPublish: true,
    config: { maxPages: 1 },
  },

  /*
    La plateforme mutualisée, une commune à la fois — et sans son filtre famille.

    Le filtre « Enfants et famille » (public:33) avait servi de première porte, jusqu'à
    mesurer ce qu'il laisse dehors : à Plan-les-Ouates, 13 événements famille sur 62, et le
    Cinéma en plein air gratuit, La Rue du Jeu ou le vide-grenier rangés « Tous publics ».
    L'étiquette dit qui la commune visait, pas qui la sortie intéresse. On lit donc le flux
    complet de chaque commune, et c'est le modèle qui fait le tri famille, comme sur les
    sites communaux — fiches et relecture croisée compris. On n'y lit toujours que les
    communes sans porte directe : les autres ont leur propre source, et les lire deux fois
    ne ferait que remplir la file de doublons.
  */
  {
    name: "Plan-les-Ouates — agenda (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=commune%3A25",
    kind: "html_ai",
    commune: "Plan-les-Ouates",
    autoPublish: true,
    // Une soixantaine d'événements, douze par page : quatre pages couvrent l'essentiel,
    // les plus proches d'abord.
    config: { maxPages: 4, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Thônex — agenda (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=commune%3A61",
    kind: "html_ai",
    commune: "Thônex",
    autoPublish: true,
    config: { maxPages: 2, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Versoix — agenda (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=commune%3A271",
    kind: "html_ai",
    commune: "Versoix",
    autoPublish: true,
    config: { maxPages: 2, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    name: "Confignon — agenda (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=commune%3A272",
    kind: "html_ai",
    commune: "Confignon",
    autoPublish: true,
    config: { maxPages: 2, itemPattern: "/agenda/", lireFiches: true },
  },
  {
    // La page communale de Veyrier n'est qu'une liste annuelle sans horaires : la
    // plateforme, elle, porte de vraies fiches datées.
    name: "Veyrier — agenda (plateforme des communes)",
    url: "https://www.geneve-communes.ch/agenda?f%5B0%5D=commune%3A259",
    kind: "html_ai",
    commune: "Veyrier",
    autoPublish: true,
    config: { maxPages: 2, itemPattern: "/agenda/", lireFiches: true },
  },

  /* --------------------------------------- le tour du 18 août : privés */
  {
    name: "Lancy Centre — animations",
    url: "https://www.lancycentre.ch/actualites/",
    kind: "html_ai",
    commune: "Lancy",
    autoPublish: true,
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
    kind: "html_ai",
    commune: "Vernier",
    autoPublish: true,
    // Les cartes de la liste se composent dans le navigateur : les dates se lisent, pas
    // les liens. Les activités renvoient donc à la liste, ce qui est moins bien qu'un lien
    // direct et mieux qu'un lien deviné.
    config: { maxPages: 1, lieuParDefaut: "Centre commercial Balexert, Vernier" },
  },
  {
    name: "Le Centre Lancy-Onex — événements",
    url: "https://lancy.le-centre.ch/evenements/",
    kind: "html_ai",
    commune: "Lancy",
    autoPublish: true,
    config: {
      maxPages: 1,
      itemPattern: "/evenement",
      lireFiches: true,
      lieuParDefaut: "Le Centre, Lancy-Onex",
    },
  },
];

/**
 * Les sources dont l'adresse change sans changer d'identité. On déplace la ligne au lieu
 * d'en créer une autre : ses activités la suivent, et leurs identités — l'URL de leur
 * fiche — ne bougent pas. C'est ce qui évite qu'un déménagement fabrique des doublons.
 */
const DEMENAGEES = [
  {
    // Le filtre « Enfants et famille » gardait 197 événements sur ~950 : la Fête de la
    // rentrée dormait dans « Tous publics ». La même source lit désormais tout, et trie.
    de: "https://www.geneve.ch/fr/agenda?f%5B0%5D=for_who%3A167",
    vers: "https://www.geneve.ch/fr/agenda",
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
  // Le filtre famille de la plateforme s'est révélé plus étroit que la question qu'on
  // pose : le flux complet de chaque commune le remplace, trié par le modèle.
  "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A25",
  "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A61",
  "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A271",
  "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A272",
  "https://www.geneve-communes.ch/agenda?f%5B0%5D=public%3A33&f%5B1%5D=commune%3A259",
];

try {
  for (const { de, vers } of DEMENAGEES) {
    const [deja] = await sql`select id from source where url = ${vers} limit 1`;
    if (deja) continue;

    const [demenagee] = await sql`
      update source set url = ${vers} where url = ${de} returning name
    `;
    if (demenagee) console.log(`déménagée   : ${demenagee.name}`);
  }

  for (const source of SOURCES) {
    const [existante] = await sql`select id from source where url = ${source.url} limit 1`;

    if (existante) {
      // `active` n'est pas touché : une source éteinte à la main l'a été pour une raison,
      // et un passage du seed n'est pas le bon endroit pour la ressusciter en silence.
      await sql`
        update source set
          name = ${source.name},
          kind = ${source.kind},
          commune = ${source.commune ?? null},
          auto_publish = ${source.autoPublish},
          config = ${sql.json(source.config ?? {})}
        where id = ${existante.id}
      `;
      console.log(`mise à jour : ${source.name}`);
    } else {
      await sql`
        insert into source (name, url, kind, commune, auto_publish, config)
        values (
          ${source.name}, ${source.url}, ${source.kind}, ${source.commune ?? null},
          ${source.autoPublish}, ${sql.json(source.config ?? {})}
        )
      `;
      console.log(`ajoutée     : ${source.name}`);
    }
  }

  for (const url of RETIREES) {
    const [endormie] = await sql`
      update source set active = false where url = ${url} returning name
    `;
    if (endormie) console.log(`endormie    : ${endormie.name}`);
  }
} catch (erreur) {
  console.error("sources en échec :", erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
} finally {
  await sql.end();
}
