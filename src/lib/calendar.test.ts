/**
 * Ce que ces tests garantissent : le calendrier est le même pour tout le monde, mais les
 * personnes inscrites qu'on y lit dépendent de ses cercles.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { communesDisponibles, purgePastEvents, upcomingCalendar } from "@/lib/calendar";
import { db } from "@/lib/db";
import { declareAttendance } from "@/lib/publications";
import {
  createAccount,
  createCircle,
  createEvent,
  join,
  minutesFromNow,
  resetDatabase,
} from "@/test/helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("Le calendrier", () => {
  it("ne montre que les activités publiées", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Atelier publié" });
    await db.execute(sql`
      insert into event (title, starts_at, origin) values ('En attente', now() + interval '2 days', 'ai')
    `);

    const entrees = await upcomingCalendar(alice.id);
    expect(entrees.map((e) => e.title)).toEqual(["Atelier publié"]);
  });

  it("est le même pour tous, mais les inscrits dépendent des cercles", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const inconnu = await createAccount("Inconnu");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const musee = await createEvent({ title: "Visite du Muséum" });

    await declareAttendance(alice.id, { eventId: musee.id });

    const vueDeBob = await upcomingCalendar(bob.id);
    expect(vueDeBob[0].attendees.map((a) => a.displayName)).toEqual(["Alice"]);

    const vueDeLInconnu = await upcomingCalendar(inconnu.id);
    expect(vueDeLInconnu.map((e) => e.title)).toEqual(["Visite du Muséum"]);
    expect(vueDeLInconnu[0].attendees).toEqual([]);
  });

  it("porte la provenance et la date de mise à jour de chaque entrée", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Atelier poterie" });

    const [entree] = await upcomingCalendar(alice.id);
    expect(entree.origin).toBe("parent");
    expect(entree.updatedAt).toBeInstanceOf(Date);
  });

  it("ne remonte pas au-delà de la fenêtre demandée", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Bientôt", startsAt: minutesFromNow(60 * 24) });
    await createEvent({ title: "Dans deux mois", startsAt: minutesFromNow(60 * 24 * 60) });

    expect((await upcomingCalendar(alice.id, { quand: "demain" })).map((e) => e.title)).toEqual(
      ["Bientôt"],
    );
  });
});

describe("Filtres", () => {
  it("« aujourd'hui » écarte ce qui est dans trois jours", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Dans trois jours", startsAt: minutesFromNow(60 * 24 * 3) });

    expect(await upcomingCalendar(alice.id, { quand: "aujourd_hui" })).toEqual([]);
    expect(await upcomingCalendar(alice.id)).toHaveLength(1);
  });

  it("ne montre plus une activité terminée", async () => {
    const alice = await createAccount("Alice");
    await createEvent({
      title: "Ce matin",
      startsAt: minutesFromNow(-180),
      endsAt: minutesFromNow(-60),
    });

    expect(await upcomingCalendar(alice.id, { quand: "aujourd_hui" })).toEqual([]);
  });

  it("filtre par commune, et ne propose que les communes réellement présentes", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "À Lancy", commune: "Lancy" });
    await createEvent({ title: "À Onex", commune: "Onex" });
    await createEvent({ title: "Sans commune" });

    expect(await communesDisponibles()).toEqual(["Lancy", "Onex"]);
    expect(
      (await upcomingCalendar(alice.id, { commune: "Lancy" })).map((e) => e.title),
    ).toEqual(["À Lancy"]);
  });

  it("ne garde que les activités où quelqu'un de mes cercles est inscrit", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    const musee = await createEvent({ title: "Visite du Muséum" });
    await createEvent({ title: "Atelier où personne ne va" });
    await declareAttendance(alice.id, { eventId: musee.id });

    expect(
      (await upcomingCalendar(bob.id, { avecMonCercle: true })).map((e) => e.title),
    ).toEqual(["Visite du Muséum"]);
    expect(await upcomingCalendar(bob.id)).toHaveLength(2);
  });

  it("ne montre rien à qui n'a aucun cercle, quand le filtre est actif", async () => {
    const inconnu = await createAccount("Inconnu");
    await createEvent({ title: "Visite du Muséum" });

    expect(await upcomingCalendar(inconnu.id, { avecMonCercle: true })).toEqual([]);
  });

  it("sa propre inscription ne fait pas ressortir l'activité", async () => {
    // « Où va quelqu'un de mes cercles » veut dire quelqu'un d'autre : on chercherait
    // sinon ce qu'on sait déjà.
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    const seule = await createEvent({ title: "Atelier où je suis seule" });
    await declareAttendance(alice.id, { eventId: seule.id });

    expect(await upcomingCalendar(alice.id, { avecMonCercle: true })).toEqual([]);

    // Bob s'inscrit à son tour : l'activité ressort alors pour Alice.
    await declareAttendance(bob.id, { eventId: seule.id });

    const pourAlice = await upcomingCalendar(alice.id, { avecMonCercle: true });
    expect(pourAlice.map((e) => e.title)).toEqual(["Atelier où je suis seule"]);
    // Et elle continue d'y voir sa propre inscription.
    expect(pourAlice[0].attendees.map((a) => a.accountId)).toContain(alice.id);
  });
});

describe("Une activité que la source n'annonce plus", () => {
  it("sort de l'agenda", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Fête annulée", retiree: true });
    await createEvent({ title: "Fête maintenue" });

    expect((await upcomingCalendar(alice.id)).map((e) => e.title)).toEqual([
      "Fête maintenue",
    ]);
  });

  it("reste sous les yeux de qui s'y était inscrit", async () => {
    const alice = await createAccount("Alice");
    // Une inscription sans destinataire ne serait visible de personne, pas même de son auteur.
    const classe = await createCircle(alice);
    const annulee = await createEvent({ title: "Fête annulée", retiree: true });
    await declareAttendance(alice.id, { eventId: annulee.id, circleIds: [classe.id] });

    const [entree] = await upcomingCalendar(alice.id);
    expect(entree.title).toBe("Fête annulée");
    // La faire disparaître sans un mot serait la pire façon d'annoncer une annulation.
    expect(entree.retiree).toBe(true);
  });

  it("ne réapparaît pas chez les autres pour autant", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    const annulee = await createEvent({ title: "Fête annulée", retiree: true });
    await declareAttendance(alice.id, { eventId: annulee.id, circleIds: [classe.id] });

    expect(await upcomingCalendar(bob.id)).toEqual([]);
  });

  it("ne compte plus parmi les communes proposées", async () => {
    await createEvent({ title: "Fête annulée", commune: "Soral", retiree: true });
    await createEvent({ title: "Fête maintenue", commune: "Lancy" });

    expect(await communesDisponibles()).toEqual(["Lancy"]);
  });
});

describe("Filtres prix et inscription", () => {
  it("sépare gratuit, payant et non défini", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Concert de l'Escalade", tarif: "gratuit" });
    await createEvent({ title: "Cirque de Noël", tarif: "payant" });
    await createEvent({ title: "Vide-greniers du village" });

    const gratuites = await upcomingCalendar(alice.id, { tarif: "gratuit" });
    expect(gratuites.map((e) => e.title)).toEqual(["Concert de l'Escalade"]);

    const payantes = await upcomingCalendar(alice.id, { tarif: "payant" });
    expect(payantes.map((e) => e.title)).toEqual(["Cirque de Noël"]);

    // « Non défini » se demande comme les deux autres : c'est l'état d'une bonne moitié des
    // activités communales, et le cacher reviendrait à les faire passer pour gratuites.
    const inconnues = await upcomingCalendar(alice.id, { tarif: "inconnu" });
    expect(inconnues.map((e) => e.title)).toEqual(["Vide-greniers du village"]);
  });

  it("une activité sans prix annoncé n'est pas gratuite", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Atelier sans prix affiché" });

    expect(await upcomingCalendar(alice.id, { tarif: "gratuit" })).toEqual([]);
  });

  it("sépare l'inscription de l'entrée libre", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Atelier poterie", acces: "inscription" });
    await createEvent({ title: "Marché de Noël", acces: "libre" });

    const surInscription = await upcomingCalendar(alice.id, { acces: "inscription" });
    expect(surInscription.map((e) => e.title)).toEqual(["Atelier poterie"]);

    const libres = await upcomingCalendar(alice.id, { acces: "libre" });
    expect(libres.map((e) => e.title)).toEqual(["Marché de Noël"]);
  });

  it("croise les deux axes, qui ne disent pas la même chose", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Atelier gratuit sur inscription", tarif: "gratuit", acces: "inscription" });
    await createEvent({ title: "Concert gratuit et libre", tarif: "gratuit", acces: "libre" });

    const trouvees = await upcomingCalendar(alice.id, {
      tarif: "gratuit",
      acces: "inscription",
    });
    expect(trouvees.map((e) => e.title)).toEqual(["Atelier gratuit sur inscription"]);
  });

  it("porte le prix et l'inscription sur chaque entrée", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Cirque de Noël", tarif: "payant", acces: "inscription" });

    const [entree] = await upcomingCalendar(alice.id);
    expect(entree.tarif).toBe("payant");
    expect(entree.acces).toBe("inscription");
  });
});

describe("Filtre par âge, choisi à l'écran", () => {
  it("écarte ce qui ne convient manifestement pas, garde ce qu'on ignore", async () => {
    const alice = await createAccount("Alice");

    await createEvent({ title: "Atelier 3-8 ans", minAge: 3, maxAge: 8 });
    await createEvent({ title: "Conférence dès 16 ans", minAge: 16 });
    await createEvent({ title: "Bébés lecteurs, jusqu'à 3 ans", maxAge: 3 });
    await createEvent({ title: "Fête du quartier" });

    expect(await upcomingCalendar(alice.id)).toHaveLength(4);

    const pourSixAns = await upcomingCalendar(alice.id, { ages: [6] });
    expect(pourSixAns.map((e) => e.title).sort()).toEqual([
      "Atelier 3-8 ans",
      "Fête du quartier",
    ]);
  });

  it("garde ce qui convient à au moins un des enfants", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Bébés lecteurs", maxAge: 3 });
    await createEvent({ title: "Atelier 6-10 ans", minAge: 6, maxAge: 10 });
    await createEvent({ title: "Conférence dès 16 ans", minAge: 16 });

    // Une famille de trois âges cherchait trois fois, ou renonçait.
    const pourTrois = await upcomingCalendar(alice.id, { ages: [2, 8] });

    expect(pourTrois.map((e) => e.title).sort()).toEqual(["Atelier 6-10 ans", "Bébés lecteurs"]);
  });

  it("sans âge demandé, rien n'est masqué", async () => {
    const alice = await createAccount("Alice");
    await createEvent({ title: "Conférence dès 16 ans", minAge: 16 });

    expect(await upcomingCalendar(alice.id)).toHaveLength(1);
  });

  it("l'app ne connaît l'âge d'aucun enfant", async () => {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");

    const colonnes = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns where table_name = 'child'
    `);

    expect(colonnes.map((c) => c.column_name)).not.toContain("birth_year");
  });
});

describe("Purge des activités passées", () => {
  it("efface les activités anciennes, garde les à venir", async () => {
    const alice = await createAccount("Alice");
    await createEvent({
      title: "L'an dernier",
      startsAt: minutesFromNow(-60 * 24 * 200),
      endsAt: minutesFromNow(-60 * 24 * 200 + 120),
    });
    await createEvent({ title: "Bientôt" });

    expect(await purgePastEvents(90)).toBe(1);
    expect((await upcomingCalendar(alice.id)).map((e) => e.title)).toEqual(["Bientôt"]);
  });
});
