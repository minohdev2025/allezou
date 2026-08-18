/**
 * Ce que ces tests garantissent : une activité ne rejoint le calendrier que si elle passe les
 * contrôles, ce qui en échoue un retombe en file avec son motif, un événement écarté ne
 * revient pas, et une source en panne est signalée au lieu de disparaître en silence.
 *
 * Les contrôles eux-mêmes sont vérifiés un par un dans `controles.test.ts`.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { eventsFromHtml } from "@/lib/ingest/jsonld";
import { controler, type Echec } from "@/lib/ingest/controles";
import {
  ancresDeFiches,
  blocsParActivite,
  eventsFromPayload,
  ficheParleDeLActivite,
  fusionnerFiche,
  htmlToText,
  lienDeLActivite,
  parseModelJson,
  sansHoraireAnnonce,
  sansPartieCommune,
} from "@/lib/ingest/minimax";
import {
  pendingReview,
  publishEvent,
  rejectEvent,
  runSource,
  sourceHealth,
  type Adapters,
} from "@/lib/ingest/run";
import { lireTexte, type RawEvent } from "@/lib/ingest/types";
import { createSource, minutesFromNow, resetDatabase } from "@/test/helpers";

describe("Lire une réponse sans se laisser noyer", () => {
  it("rend le corps entier quand il tient", async () => {
    expect(await lireTexte(new Response("bonjour"), 100)).toBe("bonjour");
  });

  it("s'arrête au plafond", async () => {
    expect(await lireTexte(new Response("a".repeat(5_000)), 100)).toHaveLength(
      100,
    );
  });

  it("coupe un flux qui ne se termine jamais", async () => {
    // Sans plafond, cette lecture ne rendrait pas la main, et le serveur web avec elle :
    // le planificateur tourne dans le même processus.
    const sansFin = new ReadableStream({
      pull(controleur) {
        controleur.enqueue(new TextEncoder().encode("a".repeat(1_000)));
      },
    });

    expect(await lireTexte(new Response(sansFin), 2_000)).toHaveLength(2_000);
  });
});

/** Adaptateurs de test : aucun accès réseau. */
function adaptateur(events: RawEvent[] | Error): Adapters {
  const fn = async () => {
    if (events instanceof Error) throw events;
    return events;
  };
  return { jsonld: fn, html_ai: fn };
}

const unEvenement = (overrides: Partial<RawEvent> = {}): RawEvent => ({
  externalId: "https://example.test/agenda/atelier",
  title: "Atelier chocolat",
  description: "Pour les 5-10 ans",
  startsAt: minutesFromNow(60 * 24),
  endsAt: minutesFromNow(60 * 26),
  placeLabel: "Maison de quartier, Lancy",
  url: "https://example.test/agenda/atelier",
  ...overrides,
});

/**
 * Une page d'agenda qui annonce vraiment ce que la lecture prétend y avoir lu : c'est le cas
 * normal, celui où plus personne n'a besoin de relire.
 *
 * Elle écrit la date de fin dès qu'elle tombe un autre jour que le début. Sans cela, ce
 * gabarit dépendait de l'heure à laquelle les tests tournent : une activité qui commence dans
 * vingt-quatre heures et dure deux heures reste le même jour à vingt et une heures, et
 * déborde sur le lendemain à vingt-trois. Le contrôle de la date de fin réclamait alors une
 * date que la page ne portait pas, et huit tests changeaient d'avis selon l'heure. Une suite
 * qui dépend de l'horloge ment un jour sur deux.
 */
function pageQuiDitTout(event: RawEvent): string {
  const dateFr = (date: Date) =>
    new Intl.DateTimeFormat("fr-CH", {
      timeZone: "Europe/Zurich",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);

  const jour = dateFr(event.startsAt);

  const heure = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(event.startsAt);

  const fin =
    event.endsAt && dateFr(event.endsAt) !== jour
      ? ` Jusqu'au ${dateFr(event.endsAt)}.`
      : "";

  return `Agenda communal. ${jour}, ${heure} : ${event.title}. ${event.placeLabel}.${fin}`;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("Lecture du JSON-LD (format réel de geneve.ch)", () => {
  const page = `
    <html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[{
      "@type":"Event",
      "name":"Concert à La Chaloupe à Vapeur !",
      "url":"https://www.geneve.ch/agenda/concert-chaloupe-vapeur-0",
      "description":"Un concert live d'improvisation",
      "startDate":"2026-08-09T16:00:00+0200",
      "endDate":"2026-08-09T18:00:00+0200",
      "location":{"@type":"Place","name":"La Chaloupe à vapeur",
        "address":{"@type":"PostalAddress","streetAddress":"Rue de Lausanne 126"}}
    }]}
    </script></head><body></body></html>`;

  it("extrait titre, dates et lieu", () => {
    const [event] = eventsFromHtml(
      page,
      "https://www.geneve.ch/agenda/concert-chaloupe-vapeur-0",
    );

    expect(event.title).toBe("Concert à La Chaloupe à Vapeur !");
    expect(event.startsAt.toISOString()).toBe("2026-08-09T14:00:00.000Z");
    expect(event.endsAt?.toISOString()).toBe("2026-08-09T16:00:00.000Z");
    // Le nom seul : l'adresse postale de la source tenait une ligne de plus sur un
    // téléphone, avec les patronymes en capitales tels qu'elle les écrit.
    expect(event.placeLabel).toBe("La Chaloupe à vapeur");
  });

  it("retombe sur l'adresse quand le lieu n'a pas de nom", () => {
    const sansNom = page.replace('"name":"La Chaloupe à vapeur",', "");
    const [event] = eventsFromHtml(sansNom, "https://example.test");

    expect(event.placeLabel).toBe("Rue de Lausanne 126");
  });

  it("ignore un bloc sans date plutôt que d'inventer", () => {
    const sansDate = page.replace(/"startDate":"[^"]+",/, "");
    expect(eventsFromHtml(sansDate, "https://example.test")).toEqual([]);
  });

  it("ignore un bloc JSON illisible sans échouer", () => {
    expect(
      eventsFromHtml('<script type="application/ld+json">{oops</script>', "x"),
    ).toEqual([]);
  });

  it("croit le prix déclaré par la fiche plutôt que sa description", () => {
    const fiche = `<script type="application/ld+json">
      {"@type":"Event","name":"Cirque de Noël","startDate":"2026-12-20T15:00:00+01:00",
       "description":"Entrée libre pour les enfants accompagnés",
       "offers":{"@type":"Offer","price":"25","priceCurrency":"CHF"}}
    </script>`;
    const [event] = eventsFromHtml(fiche, "https://exemple.test/fiche");
    expect(event.tarif).toBe("payant");
    // La description, elle, reste la seule à parler de l'accès.
    expect(event.acces).toBe("libre");
  });

  it("lit isAccessibleForFree quand la fiche le déclare", () => {
    const fiche = `<script type="application/ld+json">
      {"@type":"Event","name":"Conte au parc","startDate":"2026-12-20T15:00:00+01:00",
       "isAccessibleForFree":true}
    </script>`;
    expect(eventsFromHtml(fiche, "https://exemple.test/fiche")[0].tarif).toBe(
      "gratuit",
    );
  });

  it("reconnaît une fiche qui annonce un jour et non une heure", () => {
    const journee = `<script type="application/ld+json">
      {"@type":"Event","name":"Marché de Noël","startDate":"2026-12-12"}
    </script>`;
    const rendezVous = `<script type="application/ld+json">
      {"@type":"Event","name":"Conte au parc","startDate":"2026-12-12T15:00:00+01:00"}
    </script>`;

    expect(eventsFromHtml(journee, "https://exemple.test/f")[0].allDay).toBe(
      true,
    );
    expect(eventsFromHtml(rendezVous, "https://exemple.test/f")[0].allDay).toBe(
      false,
    );
  });

  it("laisse non défini ce qu'aucune fiche ne déclare", () => {
    const fiche = `<script type="application/ld+json">
      {"@type":"Event","name":"Marché du village","startDate":"2026-12-20T15:00:00+01:00"}
    </script>`;
    const [event] = eventsFromHtml(fiche, "https://exemple.test/fiche");
    expect(event.tarif).toBe("inconnu");
    expect(event.acces).toBe("inconnu");
  });

  it("lit la tranche d'âge quand elle est écrite, et rien sinon", async () => {
    const { parseAgeRange } = await import("@/lib/ingest/types");

    expect(parseAgeRange("Atelier 3-8 ans")).toEqual({ minAge: 3, maxAge: 8 });
    expect(parseAgeRange("de 7 à 12 ans")).toEqual({ minAge: 7, maxAge: 12 });
    expect(parseAgeRange("dès 5 ans")).toEqual({ minAge: 5 });
    expect(parseAgeRange("à partir de 10 ans")).toEqual({ minAge: 10 });
    expect(parseAgeRange("jusqu'à 3 ans")).toEqual({ maxAge: 3 });
    // Rien d'écrit, rien de deviné.
    expect(parseAgeRange("Spectacle pour toute la famille")).toEqual({});
    expect(parseAgeRange(undefined)).toEqual({});
  });

  it("récupère la tranche d'âge depuis le JSON-LD", () => {
    const avecAge = page.replace(
      '"startDate"',
      '"typicalAgeRange":"3-8 ans","startDate"',
    );
    const [event] = eventsFromHtml(avecAge, "https://example.test");
    expect(event.minAge).toBe(3);
    expect(event.maxAge).toBe(8);
  });
});

describe("Retrouver le lien d'une fiche dans la page de liste", () => {
  /** Forme réelle d'un agenda communal : des fiches, et la navigation du site autour. */
  const liste = `
    <a href="/agenda/43359726_biblio-bingo-6307839"><h3>Biblio-Bingo</h3></a>
    <a href="/agenda/93226869_la-maison-illustree">La Maison illustrée, par Cécile Koepfli</a>
    <a href="/evenements/9737586_lhumain-au-coeur-de-la-nuit">
      <span>L'humain au cœur de la nuit</span> 15 juillet - 15 août Que cache la nuit ?
    </a>
    <a href="/mon-quotidien/vie-scolaire/bibliobus-550">Bibliobus</a>
    <a href="/prestations/piscine-de-marignac">Piscine de Marignac</a>
  `;

  const agenda = ancresDeFiches(
    liste,
    "https://www.lancy.ch/agenda",
    "/agenda/",
  );
  const evenements = ancresDeFiches(
    liste,
    "https://www.vernier.ch/evenements",
    "/evenements/",
  );

  it("ne garde que les liens qui portent le motif", () => {
    expect([...agenda.keys()]).toEqual([
      "biblio bingo",
      "la maison illustree par cecile koepfli",
    ]);
  });

  it("rend une adresse complète, pas le chemin relatif", () => {
    expect(agenda.get("biblio bingo")).toBe(
      "https://www.lancy.ch/agenda/43359726_biblio-bingo-6307839",
    );
  });

  it("retrouve un titre que la commune écrit tel quel", () => {
    expect(lienDeLActivite(agenda, "Biblio-Bingo")).toBe(
      "https://www.lancy.ch/agenda/43359726_biblio-bingo-6307839",
    );
  });

  it("retrouve un titre que la date suit", () => {
    expect(lienDeLActivite(evenements, "L'humain au cœur de la nuit")).toBe(
      "https://www.vernier.ch/evenements/9737586_lhumain-au-coeur-de-la-nuit",
    );
  });

  it("ne s'arrête ni aux accents ni à la casse", () => {
    expect(
      lienDeLActivite(agenda, "LA MAISON ILLUSTREE, PAR CECILE KOEPFLI"),
    ).toBe("https://www.lancy.ch/agenda/93226869_la-maison-illustree");
  });

  it("ne rend rien plutôt qu'un lien approchant", () => {
    // Le mot est bien sur la page, mais dans la navigation du site : sans le motif, il
    // renvoyait le bibliobus scolaire au lieu d'une activité.
    expect(lienDeLActivite(agenda, "Bibliobus")).toBeUndefined();
    expect(lienDeLActivite(agenda, "Atelier chocolat")).toBeUndefined();
  });

  it("refuse un titre trop court pour désigner quoi que ce soit", () => {
    expect(lienDeLActivite(agenda, "à")).toBeUndefined();
  });

  it("retrouve, en tolérant, un titre écrit au milieu de sa carte", () => {
    // La carte d'Onex écrit la date avant le titre : ni égalité, ni préfixe. La forme
    // tolérante n'existe que pour les sources qui relisent la fiche derrière.
    const cartes = ancresDeFiches(
      `<a href="/agenda/zumba-6415">sam 12 sept Cours de Zumba place du 150e</a>
       <a href="/agenda/pilates-6389">dim 13 sept Cours de Pilates parc Brot</a>`,
      "https://www.onex.ch/mes-loisirs/agenda/",
      "/agenda/",
    );

    expect(lienDeLActivite(cartes, "Cours de Zumba")).toBeUndefined();
    expect(lienDeLActivite(cartes, "Cours de Zumba", true)).toBe(
      "https://www.onex.ch/agenda/zumba-6415",
    );
    // Deux cartes citent « Cours » : impossible de choisir, donc personne.
    expect(lienDeLActivite(cartes, "Cours", true)).toBeUndefined();
  });
});

describe("Une activité que la page ne date pas à l'heure près", () => {
  const minuit = new Date("2026-09-12T00:00:00+02:00");

  it("est reconnue quand la page n'écrit aucune heure", () => {
    const page =
      "Exposition La Maison illustrée, du 12 septembre au 21 novembre 2026.";
    expect(sansHoraireAnnonce(minuit, page)).toBe(true);
  });

  it("n'en est pas une quand la page annonce bien minuit", () => {
    const page = "Nuit des musées, samedi 12 septembre, de 20h00 à minuit.";
    expect(sansHoraireAnnonce(minuit, page)).toBe(false);
  });

  it("n'en est pas une dès que l'heure lue n'est pas minuit", () => {
    const quatorzeHeures = new Date("2026-09-12T14:00:00+02:00");
    expect(
      sansHoraireAnnonce(quatorzeHeures, "peu importe ce que dit la page"),
    ).toBe(false);
  });
});

describe("Découper une page de liste en un bloc par activité", () => {
  /*
    La page qui a motivé ce découpage : une liste où chaque activité a sa date et son heure,
    et où les contrôles, confrontés à la page entière, trouvaient toujours leur bonheur.
  */
  const LISTE = [
    "Agenda de la commune",
    "Atelier chocolat Mercredi 16 septembre, 14h00. Dès 6 ans. Maison de quartier.",
    "Marché aux puces Samedi 19 septembre, 8h00. Place du Marché.",
    "Contes pour les petits Dimanche 20 septembre, 10h30. Bibliothèque.",
  ].join(" ");

  it("donne à chaque activité le morceau de page qui la concerne", () => {
    const blocs = blocsParActivite(LISTE, [
      { titre: "Atelier chocolat" },
      { titre: "Marché aux puces" },
      { titre: "Contes pour les petits" },
    ]);

    expect(blocs[0]).toContain("16 septembre");
    expect(blocs[0]).toContain("14h00");
    // Le point de tout le chantier : la date de la voisine n'est plus dans le bloc.
    expect(blocs[0]).not.toContain("19 septembre");
    expect(blocs[1]).toContain("19 septembre");
    expect(blocs[1]).not.toContain("16 septembre");
    expect(blocs[2]).toContain("20 septembre");
  });

  it("laisse tomber le décor de la page, qui n'appartient à personne", () => {
    const blocs = blocsParActivite(LISTE, [{ titre: "Atelier chocolat" }]);
    expect(blocs[0]).not.toContain("agenda de la commune");
  });

  it("rend null quand le titre ne se retrouve pas, pour retomber sur la page entière", () => {
    const blocs = blocsParActivite(LISTE, [
      { titre: "Titre que le modèle a reformulé" },
    ]);
    expect(blocs[0]).toBeNull();
  });

  /*
    Le cas qui a coûté dix-huit faux signalements le soir du déploiement.

    Onex écrit la date au-dessus du titre et l'heure en dessous. Un bloc commençant au titre
    perdait donc la date de son activité et héritait de celle de la suivante : les contrôles
    avaient raison de crier, c'est le bloc qui était décalé d'un cran. La coupe tombe
    désormais un peu avant le titre, ce qui donne à chacun son préambule sans lui donner la
    fin du précédent.
  */
  it("garde la date écrite juste avant le titre, sans prendre celle de la suivante", () => {
    const commeOnex = [
      "Agenda de la commune",
      "23 août Zuza parc des Evaux skatepark 16h00 spectacle tout public",
      "24 août Cours de Zumba place du 150e rendez-vous au milieu 18h30 sport tout public",
      "25 août Cours de Pilates parc Brot près de l'étang 12h15 sport tout public",
    ].join(" ");

    const blocs = blocsParActivite(commeOnex, [
      { titre: "Zuza" },
      { titre: "Cours de Zumba" },
      { titre: "Cours de Pilates" },
    ]);

    expect(blocs[0]).toContain("23 aout");
    expect(blocs[0]).toContain("16h00");
    expect(blocs[0]).not.toContain("24 aout");

    expect(blocs[1]).toContain("24 aout");
    // L'heure doit rester avec son activité : c'est elle qu'un recul trop large emporte.
    expect(blocs[1]).toContain("18h30");
    expect(blocs[1]).not.toContain("25 aout");
  });

  it("ne coupe pas au milieu d'un mot plus long", () => {
    const page = "Supermarché ouvert. Marché aux puces Samedi 19 septembre.";
    const blocs = blocsParActivite(page, [{ titre: "Marché aux puces" }]);
    expect(blocs[0]).toContain("19 septembre");
    expect(blocs[0]).not.toContain("supermarche");
  });

  /*
    L'ancre, et la raison pour laquelle on ne la croit pas sur parole.

    Le modèle rend, avec chaque activité, les premiers mots du passage tel que la page les
    écrit. C'est un bien meilleur repère qu'un titre : elle commence à la date, et elle ne se
    confond pas avec une entrée de menu. Mais elle vient du modèle, donc elle se vérifie : une
    ancre qu'on ne retrouve pas mot pour mot dans la page est ignorée, et le titre reprend son
    rôle. Le modèle dit où regarder, jamais si c'est juste.
  */
  it("suit l'ancre quand la page la porte vraiment", () => {
    // « Bibliobus » apparaît d'abord dans le menu du site, bien avant l'agenda : le titre
    // seul s'ancrait là, et le bloc n'était fait que de rubriques.
    const avecMenu = [
      "Bibliobus Ludothèque Déchets Sécurité Solidarité",
      "20 août Bibliobus rue des Bossons 11 10h00 lecture tout public",
    ].join(" ");

    const parLeTitre = blocsParActivite(avecMenu, [{ titre: "Bibliobus" }])[0]!;
    expect(parLeTitre).toContain("ludotheque");

    const parLAncre = blocsParActivite(avecMenu, [
      { titre: "Bibliobus", ancre: "20 août Bibliobus rue des Bossons" },
    ])[0]!;
    expect(parLAncre).toContain("20 aout");
    expect(parLAncre).toContain("10h00");
    expect(parLAncre).not.toContain("ludotheque");
  });

  it("ignore une ancre que la page n'écrit pas, et retombe sur le titre", () => {
    const blocs = blocsParActivite(LISTE, [
      {
        titre: "Marché aux puces",
        ancre: "Une phrase que le modèle a inventée",
      },
    ]);

    expect(blocs[0]).toContain("marche aux puces");
  });

  it("attrape l'erreur qu'aucun contrôle ne voyait", () => {
    // Le modèle attribue à l'atelier l'heure du marché. Toutes les valeurs existent sur la
    // page, et c'est bien pour ça que la page entière ne prouvait rien.
    const source = {
      url: "https://exemple.test/agenda",
      kind: "html_ai" as const,
    };
    const atelier = {
      externalId: "a",
      title: "Atelier chocolat",
      startsAt: new Date("2026-09-16T08:00:00+02:00"),
    };

    expect(
      controler(atelier, { source, texteSource: LISTE }).map((e) => e.code),
    ).toEqual([]);

    const bloc = blocsParActivite(LISTE, [
      { titre: "Atelier chocolat" },
      { titre: "Marché aux puces" },
      { titre: "Contes pour les petits" },
    ])[0]!;
    expect(
      controler(atelier, { source, texteSource: bloc }).map((e) => e.code),
    ).toEqual(["heure_absente"]);
  });

  it("ne borne un bloc que par les titres qu'on lui donne", () => {
    // La limite du procédé, écrite pour qu'on ne la redécouvre pas : les frontières viennent
    // des titres rendus par le modèle. S'il n'en rend qu'un sur une page qui en porte vingt,
    // son bloc court jusqu'au bas de la page et les contrôles retrouvent la portée qu'ils
    // avaient avant — pas moins bien qu'hier, pas mieux non plus.
    const seul = blocsParActivite(LISTE, [{ titre: "Atelier chocolat" }])[0]!;
    expect(seul).toContain("19 septembre");

    const tous = blocsParActivite(LISTE, [
      { titre: "Atelier chocolat" },
      { titre: "Marché aux puces" },
      { titre: "Contes pour les petits" },
    ])[0]!;
    expect(tous).not.toContain("19 septembre");
  });
});

describe("La date de fin se confronte à la page", () => {
  const source = {
    url: "https://exemple.test/agenda",
    kind: "html_ai" as const,
  };
  const page =
    "Exposition La Maison illustrée, du 12 septembre au 21 novembre 2026. Entrée libre.";

  it("passe quand la page annonce bien cette fin", () => {
    const codes = controler(
      {
        externalId: "e",
        title: "Exposition La Maison illustrée",
        startsAt: new Date("2026-09-12T00:00:00+02:00"),
        endsAt: new Date("2026-11-21T18:00:00+01:00"),
        allDay: true,
      },
      { source, texteSource: page },
    ).map((e) => e.code);

    expect(codes).toEqual([]);
  });

  it("retient une fin que la page n'écrit nulle part", () => {
    const codes = controler(
      {
        externalId: "e",
        title: "Exposition La Maison illustrée",
        startsAt: new Date("2026-09-12T00:00:00+02:00"),
        // Trois semaines de plus que ce que la commune annonce : une famille se déplacerait
        // devant une porte fermée.
        endsAt: new Date("2026-12-12T18:00:00+01:00"),
        allDay: true,
      },
      { source, texteSource: page },
    ).map((e) => e.code);

    expect(codes).toContain("date_fin_absente");
  });

  it("ne réclame rien pour une activité qui tient dans la journée", () => {
    const codes = controler(
      {
        externalId: "m",
        title: "Marché aux puces",
        startsAt: new Date("2026-09-19T08:00:00+02:00"),
        endsAt: new Date("2026-09-19T17:00:00+02:00"),
      },
      { source, texteSource: "Marché aux puces Samedi 19 septembre, 8h00." },
    ).map((e) => e.code);

    // La date de fin est celle du début, déjà vérifiée : l'exiger deux fois remplirait la
    // file sans rien apprendre.
    expect(codes).toEqual([]);
  });
});

describe("Lecture d'une page par MiniMax", () => {
  it("extrait le JSON d'une réponse de modèle bavard", () => {
    // Bloc de raisonnement avant, phrase après, accolade dans le texte : tout doit tomber.
    const reponse = `<think>Je regarde la page…</think>
      \`\`\`json
      {"evenements":[{"titre":"Atelier {spécial}","debut":"2026-01-04T14:00:00+01:00"}]}
      \`\`\`
      J'espère que cela convient {sinon dites-le}.`;

    expect(parseModelJson(reponse)).toEqual({
      evenements: [
        { titre: "Atelier {spécial}", debut: "2026-01-04T14:00:00+01:00" },
      ],
    });
  });

  it("réduit une page à son texte pour la lecture par l'IA", () => {
    const texte = htmlToText(
      "<div><script>var a=1</script><h1>Atelier</h1><p>14h00</p></div>",
    );
    expect(texte).toBe("Atelier 14h00");
  });

  /*
    Ce qui a mis Lancy en échec en production : le modèle avait répondu par le tableau nu,
    forme que le schéma accepte pourtant. Ne chercher que l'accolade rendait le premier
    événement du tableau, et plus rien ne pouvait le valider.
  */
  it("lit un tableau nu autant que l'objet attendu", () => {
    const reponse = `<think>Voyons…</think>
      [{"titre":"Aquafitness","debut":"2026-07-06T00:00:00+02:00"},
       {"titre":"Biblio-Bingo","debut":"2026-08-20T10:00:00+02:00"}]`;

    expect(parseModelJson(reponse)).toEqual([
      { titre: "Aquafitness", debut: "2026-07-06T00:00:00+02:00" },
      { titre: "Biblio-Bingo", debut: "2026-08-20T10:00:00+02:00" },
    ]);
  });

  it("passe outre une énumération en prose avant la réponse", () => {
    // Un crochet ouvert par le texte n'est pas un tableau : s'y arrêter ferait échouer
    // toute la page pour une tournure de phrase.
    const reponse = `Voici [les activités] retenues :
      {"evenements":[{"titre":"Atelier","debut":"2026-01-04T14:00:00+01:00"}]}`;

    expect(parseModelJson(reponse)).toEqual({
      evenements: [{ titre: "Atelier", debut: "2026-01-04T14:00:00+01:00" }],
    });
  });

  it("distingue une réponse tronquée d'une réponse vide", () => {
    // Le raisonnement de M3 mange l'essentiel du quota de sortie : une réponse coupée en
    // route est un cas courant, et ne se corrige pas comme une page sans événement.
    expect(() => parseModelJson('{"evenements":[{"titre":"Atelier",')).toThrow(
      /incomplet/,
    );
    expect(() => parseModelJson("La page ne liste aucun événement.")).toThrow(
      /aucun objet JSON dans la réponse/,
    );
  });

  /*
    Le raisonnement de M3 pèse dix fois la réponse et contient ses brouillons — trente-six
    objets `titre` pour une page lancéenne. Quand la balise ouvrante manque, c'est un
    brouillon qui était lu à la place de la réponse.
  */
  it("écarte le raisonnement même sans balise ouvrante", () => {
    const reponse = `Je liste les activités : {"titre":"brouillon","debut":"2026-01-01"}
      </think>
      {"evenements":[{"titre":"Atelier","debut":"2026-01-04T14:00:00+01:00"}]}`;

    expect(parseModelJson(reponse)).toEqual({
      evenements: [{ titre: "Atelier", debut: "2026-01-04T14:00:00+01:00" }],
    });
  });
});

describe("Mise en forme de ce que le modèle a rendu", () => {
  const MAINTENANT = Date.UTC(2026, 7, 14, 12, 0);
  const evenements = (brut: unknown) =>
    eventsFromPayload(brut, "https://www.lancy.ch/agenda", MAINTENANT);

  it("accepte les trois formes de réponse du modèle", () => {
    const evenement = { titre: "Atelier", debut: "2026-08-20T14:00:00+02:00" };

    expect(evenements({ evenements: [evenement] })).toHaveLength(1);
    expect(evenements([evenement])).toHaveLength(1);
    // Une page qui n'annonce qu'une activité se voit répondre par l'objet seul.
    expect(evenements(evenement)).toHaveLength(1);
  });

  /*
    Une exposition ouverte depuis juin, un marché hebdomadaire, un cours qui court jusqu'en
    septembre : leur début est passé, pas leur intérêt. Mesurer la fenêtre sur le début
    écartait treize des dix-sept activités lancéennes, dont neuf encore ouvertes.
  */
  it("garde une activité commencée mais pas terminée", () => {
    const [event] = evenements([
      {
        titre: "La Maison illustrée",
        debut: "2026-06-21T00:00:00+02:00",
        fin: "2026-09-21T00:00:00+02:00",
      },
    ]);

    expect(event.title).toBe("La Maison illustrée");
    expect(event.startsAt.toISOString()).toBe("2026-06-20T22:00:00.000Z");
  });

  it("écarte ce qui est terminé, sans date, ou trop loin", () => {
    expect(
      evenements([
        {
          titre: "Fête passée",
          debut: "2026-06-01T10:00:00+02:00",
          fin: "2026-08-10T18:00:00+02:00",
        },
        { titre: "Sans fin annoncée", debut: "2026-08-10T10:00:00+02:00" },
        { titre: "Date illisible", debut: "un samedi de septembre" },
        { titre: "Trop loin", debut: "2028-01-01T10:00:00+01:00" },
      ]),
    ).toEqual([]);
  });

  /*
    « Invalid input » est tout ce que zod dit d'une union dont aucune branche n'a pris :
    le message doit nommer la forme reçue, sinon il n'y a rien à chercher.
  */
  it("nomme la forme reçue quand la réponse est hors format", () => {
    expect(() => evenements({ resultats: [] })).toThrow(/objet \{resultats\}/);
    expect(() => evenements("des activités")).toThrow(/reçu string/);
  });
});

describe("Pagination des agendas communaux", () => {
  // Onex n'affiche que neuf entrées sur cent quinze : le menu, répété à chaque page, pèse
  // plus lourd que la liste elle-même.
  const page = (liste: string) =>
    `Menu Accueil Agenda ${liste} Dernière modification`;

  it("ne garde d'une page que ce qui la distingue de la première", () => {
    expect(
      sansPartieCommune(page("Atelier du 14"), page("Concert du 20")),
    ).toBe("Concert du 20");
  });

  it("ne coupe pas au milieu d'un mot", () => {
    // « Aquafitness » et « Aquabike » partagent quatre lettres : couper au caractère près
    // laisserait « bike » au modèle.
    expect(
      sansPartieCommune(page("Atelier Aquafitness"), page("Atelier Aquabike")),
    ).toBe("Aquabike");
  });

  it("rend une chaîne vide quand la page ne dit rien de neuf", () => {
    // Un site qui ignore le paramètre `page`, ou une pagination épuisée : on s'arrête là.
    expect(
      sansPartieCommune(page("Atelier du 14"), page("Atelier du 14")),
    ).toBe("");
  });
});

describe("Passage d'une source", () => {
  it("un flux structuré publie directement", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });

    const rapport = await runSource(source.id, adaptateur([unEvenement()]));

    expect(rapport.ok).toBe(true);
    expect(rapport.created).toBe(1);
    expect(await pendingReview()).toEqual([]);

    const rows = await db.execute<{
      published_at: Date | null;
      origin: string;
    }>(sql`select published_at, origin from event`);
    expect(rows[0].published_at).not.toBeNull();
    expect(rows[0].origin).toBe("feed");
  });

  it("une lecture par l'IA attend une relecture", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: false });

    await runSource(source.id, adaptateur([unEvenement()]));

    const attente = await pendingReview();
    expect(attente.map((e) => e.title)).toEqual(["Atelier chocolat"]);
    expect(attente[0].sourceName).toBe("Agenda de test");

    const rows = await db.execute<{ origin: string }>(
      sql`select origin from event`,
    );
    expect(rows[0].origin).toBe("ai");
  });

  it("un second passage met à jour sans dupliquer", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });

    await runSource(source.id, adaptateur([unEvenement()]));
    const second = await runSource(
      source.id,
      adaptateur([unEvenement({ title: "Atelier chocolat (complet)" })]),
    );

    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);

    const rows = await db.execute<{ title: string }>(
      sql`select title from event`,
    );
    expect(rows.map((r) => r.title)).toEqual(["Atelier chocolat (complet)"]);
  });

  it("un événement écarté ne réapparaît pas au passage suivant", async () => {
    const source = await createSource({ kind: "html_ai" });

    await runSource(source.id, adaptateur([unEvenement()]));
    const attente = await pendingReview();
    await rejectEvent(attente[0].id);

    expect(await pendingReview()).toEqual([]);

    await runSource(source.id, adaptateur([unEvenement()]));

    expect(await pendingReview()).toEqual([]);
  });

  it("un événement publié à la relecture le reste, avec ce qui a été validé", async () => {
    const source = await createSource({ kind: "html_ai" });

    await runSource(source.id, adaptateur([unEvenement()]));
    const attente = await pendingReview();
    await publishEvent(attente[0].id);

    // La source relit et change le titre, mais sans la page d'origine les contrôles n'ont
    // rien à confronter. Ce qui est publié ne se laisse pas réécrire par une lecture qu'on
    // ne sait pas vérifier : sinon une source qui se met à mal lire remplacerait en silence
    // une activité relue par une activité douteuse.
    await runSource(
      source.id,
      adaptateur([unEvenement({ title: "Atelier chocolat, 15h" })]),
    );

    expect(await pendingReview()).toEqual([]);
    const rows = await db.execute<{ title: string; published_at: Date | null }>(
      sql`select title, published_at from event`,
    );
    expect(rows[0].title).toBe("Atelier chocolat");
    expect(rows[0].published_at).not.toBeNull();
  });
});

describe("Les contrôles à la place de la relecture", () => {
  it("une lecture que la page confirme se publie sans passer par personne", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true });
    const event = unEvenement();

    const rapport = await runSource(
      source.id,
      adaptateur([{ ...event, texteSource: pageQuiDitTout(event) }]),
    );

    expect(rapport.published).toBe(1);
    expect(rapport.held).toBe(0);
    expect(await pendingReview()).toEqual([]);
  });

  it("une lecture que la page ne confirme pas retombe en file, avec son motif", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true });

    const rapport = await runSource(
      source.id,
      adaptateur([
        unEvenement({
          texteSource: "Cette page ne parle pas de cette activité-là.",
        }),
      ]),
    );

    expect(rapport.published).toBe(0);
    expect(rapport.held).toBe(1);

    const attente = await pendingReview();
    expect(attente[0].controles.map((c) => c.code)).toContain("date_absente");
  });

  it("la même activité annoncée par deux sources part en file", async () => {
    const premiere = await createSource({ kind: "html_ai", autoPublish: true });
    const seconde = await createSource({
      name: "Autre agenda de test",
      url: "https://example.test/autre-agenda",
      kind: "html_ai",
      autoPublish: true,
    });

    const event = unEvenement();
    const lecture = { ...event, texteSource: pageQuiDitTout(event) };

    await runSource(premiere.id, adaptateur([lecture]));
    await runSource(seconde.id, adaptateur([lecture]));

    const attente = await pendingReview();
    expect(attente.map((e) => e.controles.map((c) => c.code))).toEqual([
      ["doublon"],
    ]);
  });

  /*
    Le cas de Lancy, mesuré en production : quarante paires de jumelles.

    Sa page affiche la rubrique à gauche du titre — « Concert Musique à Pont-Rouge » — et le
    modèle la reprenait dans le titre une fois sur deux. Comme l'identité d'une activité est
    son titre et son jour, la version longue entrait comme une activité de plus, et plusieurs
    paires se sont retrouvées publiées des deux côtés : la même sortie, montrée deux fois à un
    parent. La consigne a été resserrée, mais une consigne se respecte à peu près.
  */
  it("attrape une seconde lecture qui ajoute la rubrique au titre", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true });

    const event = unEvenement();
    await runSource(
      source.id,
      adaptateur([{ ...event, texteSource: pageQuiDitTout(event) }]),
    );

    // Même activité, même jour, titre préfixé de sa rubrique : une nouvelle identité, donc
    // une ligne de plus si personne ne s'en aperçoit.
    const avecRubrique = {
      ...event,
      externalId: "atelier-chocolat-avec-rubrique",
      title: `Atelier ${event.title}`,
    };
    await runSource(
      source.id,
      adaptateur([
        { ...avecRubrique, texteSource: pageQuiDitTout(avecRubrique) },
      ]),
    );

    const attente = await pendingReview();
    expect(attente.map((e) => e.controles.map((c) => c.code))).toEqual([
      ["doublon"],
    ]);
  });

  it("une relecture humaine efface les contrôles en défaut", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true });
    await runSource(
      source.id,
      adaptateur([unEvenement({ texteSource: "page muette" })]),
    );

    const attente = await pendingReview();
    expect(attente[0].controles.length).toBeGreaterThan(0);
    await publishEvent(attente[0].id);

    const rows = await db.execute<{ controles: unknown }>(
      sql`select controles from event`,
    );
    expect(rows[0].controles).toBeNull();
  });
});

describe("Santé des sources", () => {
  it("inscrit l'erreur d'un passage en échec", async () => {
    const source = await createSource({
      kind: "jsonld",
      name: "Commune muette",
    });

    const rapport = await runSource(
      source.id,
      adaptateur(new Error("HTTP 503")),
    );

    expect(rapport.ok).toBe(false);
    expect(rapport.error).toContain("503");

    const [sante] = await sourceHealth();
    expect(sante.name).toBe("Commune muette");
    expect(sante.lastError).toContain("503");
  });

  it("signale une source qui n'a jamais rien renvoyé", async () => {
    await createSource({ name: "Jamais passée" });

    const [sante] = await sourceHealth();
    expect(sante.joursSansContenu).toBeNull();
    expect(sante.muette).toBe(true);
  });

  it("ne signale pas une source qui vient de rapporter des activités", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(source.id, adaptateur([unEvenement()]));

    const [sante] = await sourceHealth();
    expect(sante.joursSansContenu).toBe(0);
    expect(sante.lastEventCount).toBe(1);
    expect(sante.muette).toBe(false);
    expect(sante.lastError).toBeNull();
  });

  it("signale une source silencieuse depuis trop longtemps", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(source.id, adaptateur([unEvenement()]));

    await db.execute(sql`
      update source set last_non_empty_at = now() - interval '9 days' where id = ${source.id}
    `);

    const [sante] = await sourceHealth();
    expect(sante.joursSansContenu).toBe(9);
    expect(sante.muette).toBe(true);
  });

  it("signale une source qui répond correctement mais ne rapporte plus rien", async () => {
    // C'est la panne la plus traître : techniquement tout va bien, l'agenda se vide.
    const source = await createSource({
      kind: "jsonld",
      autoPublish: true,
      name: "Vidée",
    });
    await runSource(source.id, adaptateur([unEvenement()]));
    await db.execute(sql`
      update source set last_non_empty_at = now() - interval '10 days' where id = ${source.id}
    `);

    const rapport = await runSource(source.id, adaptateur([]));

    expect(rapport.ok).toBe(true);
    expect(rapport.found).toBe(0);

    const [sante] = await sourceHealth();
    expect(sante.lastError).toBeNull();
    expect(sante.lastSuccessAt).toBeInstanceOf(Date);
    expect(sante.lastEventCount).toBe(0);
    expect(sante.muette).toBe(true);
  });

  it("refuse une source sans adaptateur, sans faire échouer le reste", async () => {
    const source = await createSource({ kind: "ical", name: "Flux iCal" });

    const rapport = await runSource(source.id, { jsonld: async () => [] });

    expect(rapport.ok).toBe(false);
    expect(rapport.error).toContain("ical");
  });
});

describe("Relecture croisée", () => {
  /** Un vérificateur de test : il répond ce qu'on lui dicte et compte ses appels. */
  function verificateur(echecs: Echec[]) {
    const appels = { total: 0 };
    const relire = async () => {
      appels.total += 1;
      return echecs;
    };
    return { appels, relire };
  }

  const conteste: Echec = {
    code: "verification_ia",
    detail: "La page parle du marché voisin, pas de cet atelier.",
  };

  it("retient une activité que le vérificateur conteste", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true, config: {} });
    const event = unEvenement();

    const rapport = await runSource(
      source.id,
      adaptateur([{ ...event, texteSource: pageQuiDitTout(event) }]),
      async () => [conteste],
    );

    expect(rapport.published).toBe(0);
    expect(rapport.held).toBe(1);

    const attente = await pendingReview();
    expect(attente[0].controles.map((c) => c.code)).toEqual(["verification_ia"]);
  });

  it("publie ce que le vérificateur confirme", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true, config: {} });
    const event = unEvenement();
    const { appels, relire } = verificateur([]);

    const rapport = await runSource(
      source.id,
      adaptateur([{ ...event, texteSource: pageQuiDitTout(event) }]),
      relire,
    );

    expect(rapport.published).toBe(1);
    expect(appels.total).toBe(1);
  });

  it("ne relit pas une activité déjà publiée", async () => {
    // Le contenu affiché a été vérifié à son entrée. Un vérificateur pris d'un doute
    // passager rangerait sinon des activités saines parmi les signalées, toutes les six
    // heures.
    const source = await createSource({ kind: "html_ai", autoPublish: true, config: {} });
    const event = unEvenement();
    const lecture = { ...event, texteSource: pageQuiDitTout(event) };
    const { appels, relire } = verificateur([]);

    await runSource(source.id, adaptateur([lecture]), relire);
    await runSource(source.id, adaptateur([lecture]), relire);

    expect(appels.total).toBe(1);
  });

  it("ne relit pas ce que les contrôles retiennent déjà", async () => {
    // L'activité attend de toute façon une relecture humaine : payer un appel pour le
    // dire deux fois n'apprend rien à personne.
    const source = await createSource({ kind: "html_ai", autoPublish: true, config: {} });
    const { appels, relire } = verificateur([]);

    const rapport = await runSource(
      source.id,
      adaptateur([unEvenement({ texteSource: "page muette" })]),
      relire,
    );

    expect(rapport.held).toBe(1);
    expect(appels.total).toBe(0);
  });

  it("se débraye par configuration, source par source", async () => {
    const source = await createSource({
      kind: "html_ai",
      autoPublish: true,
      config: { verifierIA: false },
    });
    const event = unEvenement();
    const { appels, relire } = verificateur([conteste]);

    const rapport = await runSource(
      source.id,
      adaptateur([{ ...event, texteSource: pageQuiDitTout(event) }]),
      relire,
    );

    expect(rapport.published).toBe(1);
    expect(appels.total).toBe(0);
  });

  it("laisse les flux structurés tranquilles", async () => {
    // Rien n'y est interprété, il n'y a donc rien à faire relire.
    const source = await createSource({ kind: "jsonld", autoPublish: true, config: {} });
    const { appels, relire } = verificateur([conteste]);

    const rapport = await runSource(source.id, adaptateur([unEvenement()]), relire);

    expect(rapport.published).toBe(1);
    expect(appels.total).toBe(0);
  });
});

describe("Le tri famille des sources structurées", () => {
  const muet = async () => [];

  it("n'entre pas ce que le tri écarte, mais le compte comme trouvé", async () => {
    const source = await createSource({
      kind: "jsonld",
      autoPublish: true,
      config: { filtreFamille: true },
    });

    const rapport = await runSource(
      source.id,
      adaptateur([
        unEvenement(),
        unEvenement({
          externalId: "https://example.test/agenda/seance-conseil",
          title: "Séance du Conseil municipal",
        }),
      ]),
      muet,
      async () => ["oui", "non"],
    );

    expect(rapport.found).toBe(2);
    expect(rapport.created).toBe(1);
    expect(rapport.published).toBe(1);

    const rows = await db.execute<{ title: string }>(sql`select title from event`);
    expect(rows.map((r) => r.title)).toEqual(["Atelier chocolat"]);
  });

  it("met en file ce dont le tri doute, avec son motif", async () => {
    const source = await createSource({
      kind: "jsonld",
      autoPublish: true,
      config: { filtreFamille: true },
    });

    const rapport = await runSource(
      source.id,
      adaptateur([unEvenement()]),
      muet,
      async () => ["doute"],
    );

    expect(rapport.held).toBe(1);
    const attente = await pendingReview();
    expect(attente[0].controles.map((c) => c.code)).toEqual(["public_douteux"]);
  });

  it("une panne du tri fait échouer la source plutôt que d'inonder l'agenda", async () => {
    const source = await createSource({
      kind: "jsonld",
      autoPublish: true,
      config: { filtreFamille: true },
    });

    const rapport = await runSource(source.id, adaptateur([unEvenement()]), muet, async () => {
      throw new Error("triage injoignable");
    });

    expect(rapport.ok).toBe(false);
    expect(rapport.error).toContain("triage");
    expect(rapport.created).toBe(0);
  });

  it("ne trie pas sans qu'on le demande", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    const appels = { total: 0 };

    const rapport = await runSource(source.id, adaptateur([unEvenement()]), muet, async () => {
      appels.total += 1;
      return ["non"];
    });

    expect(appels.total).toBe(0);
    expect(rapport.published).toBe(1);
  });
});

describe("Lecture de fiche", () => {
  const uneListe = (overrides: Partial<RawEvent> = {}): RawEvent => ({
    externalId: "atelier chocolat|2026-09-12",
    title: "Atelier chocolat",
    startsAt: new Date("2026-09-12T14:00:00+02:00"),
    endsAt: new Date("2026-09-12T16:00:00+02:00"),
    url: "https://example.test/agenda/atelier",
    texteSource: "12 septembre 14h00 Atelier chocolat salle des fetes",
    allDay: false,
    ...overrides,
  });

  it("reconnaît la fiche qui parle d'autre chose", () => {
    const liste = uneListe();
    expect(
      ficheParleDeLActivite(liste, uneListe({ title: "Marché de Noël" })),
    ).toBe(false);
    // Le sous-titre de la fiche ne la disqualifie pas : c'est la même activité, dite plus
    // longuement.
    expect(
      ficheParleDeLActivite(
        liste,
        uneListe({ title: "Atelier chocolat — pour les familles" }),
      ),
    ).toBe(true);
  });

  it("la fiche enrichit ce que la liste taisait, sans toucher à l'identité", () => {
    const liste = uneListe();
    const fiche = uneListe({
      externalId: "autre-identite",
      title: "Atelier chocolat des familles",
      startsAt: new Date("2026-09-12T14:30:00+02:00"),
      description: "Fabrication de pralinés, dès 5 ans, sur inscription.",
      placeLabel: "Maison de quartier du Plateau",
      minAge: 5,
    });

    const fusion = fusionnerFiche(
      liste,
      fiche,
      "Samedi 12 septembre 2026, 14h30. Fabrication de pralinés, dès 5 ans.",
    );

    expect(fusion).not.toBeNull();
    expect(fusion!.externalId).toBe(liste.externalId);
    expect(fusion!.title).toBe(liste.title);
    expect(fusion!.startsAt).toEqual(fiche.startsAt);
    expect(fusion!.description).toBe(fiche.description);
    expect(fusion!.placeLabel).toBe(fiche.placeLabel);
    expect(fusion!.minAge).toBe(5);
    // Le texte confronté porte les deux lectures : ce qui vient de la liste comme ce qui
    // vient de la fiche doit pouvoir se retrouver quelque part.
    expect(fusion!.texteSource).toContain("salle des fetes");
    expect(fusion!.texteSource).toContain("pralinés");
  });

  it("refuse de changer le jour", () => {
    // La fiche d'une activité répétée annonce volontiers la première date de la série :
    // fusionner déplacerait la sortie du parent.
    const fusion = fusionnerFiche(
      uneListe(),
      uneListe({ startsAt: new Date("2026-09-05T14:00:00+02:00") }),
      "Du 5 septembre au 19 décembre, les samedis.",
    );
    expect(fusion).toBeNull();
  });

  it("garde l'heure de la liste quand la fiche n'en écrit pas", () => {
    const liste = uneListe();
    const fusion = fusionnerFiche(
      liste,
      uneListe({ startsAt: new Date("2026-09-12T00:00:00+02:00") }),
      "Samedi 12 septembre 2026, toute la journee.",
    );

    expect(fusion).not.toBeNull();
    expect(fusion!.startsAt).toEqual(liste.startsAt);
    expect(fusion!.endsAt).toEqual(liste.endsAt);
    expect(fusion!.allDay).toBe(false);
  });

  it("ne laisse pas un tarif muet recouvrir un tarif connu", () => {
    const liste = uneListe({ tarif: "gratuit", acces: "libre" });

    const muette = fusionnerFiche(
      liste,
      uneListe({ tarif: "inconnu", acces: "inconnu" }),
      "Samedi 12 septembre 2026, 14h00.",
    );
    expect(muette!.tarif).toBe("gratuit");
    expect(muette!.acces).toBe("libre");

    const disante = fusionnerFiche(
      liste,
      uneListe({ tarif: "payant", acces: "inscription" }),
      "Samedi 12 septembre 2026, 14h00. Sur inscription, 10 francs.",
    );
    expect(disante!.tarif).toBe("payant");
    expect(disante!.acces).toBe("inscription");
  });
});
