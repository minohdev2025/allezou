/**
 * Ce que ces tests garantissent : on ne peut pas publier vers un cercle dont on n'est pas
 * membre, les destinataires sont toujours renvoyés pour pouvoir être affichés, et une
 * présence passée finit par disparaître complètement.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  attendanceFor,
  createEventAndAttend,
  currentlyOut,
  declareAttendance,
  declarePresence,
  defaultAudience,
  dureesProposees,
  purgeExpired,
  setDefaultAudience,
  upcomingOutings,
  withdraw,
} from "@/lib/publications";
import { canSeePublication } from "@/lib/visibility";
import {
  createAccount,
  createCircle,
  createEvent,
  createPlace,
  declarePresence as insererPresence,
  join,
  minutesFromNow,
  resetDatabase,
} from "@/test/helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("Déclarer une présence", () => {
  it("part vers les cercles cochés par défaut, et les renvoie pour affichage", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    await join(classe, bob);
    const parc = await createPlace("Parc du Gué");

    const result = await declarePresence(alice.id, { placeId: parc.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.circles.map((c) => c.name)).toEqual(["Classe 4P"]);
    expect(await canSeePublication(bob.id, result.value.publicationId)).toBe(true);
  });

  it("ne part pas vers un cercle décoché", async () => {
    const alice = await createAccount("Alice");
    await createCircle(alice, "Classe 4P");
    const voisinage = await createCircle(alice, "Voisinage");
    const parc = await createPlace();

    await setDefaultAudience(alice.id, voisinage.id, false);
    expect((await defaultAudience(alice.id)).map((c) => c.name)).toEqual(["Classe 4P"]);

    const result = await declarePresence(alice.id, { placeId: parc.id });
    if (!result.ok) return;
    expect(result.value.circles.map((c) => c.name)).toEqual(["Classe 4P"]);
  });

  it("refuse un cercle dont on n'est pas membre", async () => {
    const alice = await createAccount("Alice");
    const carla = await createAccount("Carla");
    const leCercleDeCarla = await createCircle(carla, "Voisinage");
    await createCircle(alice, "Classe 4P");
    const parc = await createPlace();

    expect(
      await declarePresence(alice.id, {
        placeId: parc.id,
        circleIds: [leCercleDeCarla.id],
      }),
    ).toEqual({ ok: false, reason: "aucun_destinataire" });
  });

  it("refuse un mélange de cercles autorisés et interdits", async () => {
    const alice = await createAccount("Alice");
    const carla = await createAccount("Carla");
    const classe = await createCircle(alice, "Classe 4P");
    const leCercleDeCarla = await createCircle(carla, "Voisinage");
    const parc = await createPlace();

    expect(
      await declarePresence(alice.id, {
        placeId: parc.id,
        circleIds: [classe.id, leCercleDeCarla.id],
      }),
    ).toEqual({ ok: false, reason: "cercle_interdit" });
  });

  it("refuse quand il ne reste aucun destinataire", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice);
    const parc = await createPlace();
    await setDefaultAudience(alice.id, classe.id, false);

    expect(await declarePresence(alice.id, { placeId: parc.id })).toEqual({
      ok: false,
      reason: "aucun_destinataire",
    });
  });

  it("refuse une durée hors bornes", async () => {
    const alice = await createAccount("Alice");
    await createCircle(alice);
    const parc = await createPlace();

    expect(await declarePresence(alice.id, { placeId: parc.id, minutes: 5 })).toEqual({
      ok: false,
      reason: "duree_invalide",
    });
    expect(await declarePresence(alice.id, { placeId: parc.id, minutes: 2000 })).toEqual({
      ok: false,
      reason: "duree_invalide",
    });
  });

  it("refuse une note trop longue", async () => {
    const alice = await createAccount("Alice");
    await createCircle(alice);
    const parc = await createPlace();

    expect(
      await declarePresence(alice.id, { placeId: parc.id, note: "x".repeat(141) }),
    ).toEqual({ ok: false, reason: "note_invalide" });
  });

  it("refuse un lieu inconnu", async () => {
    const alice = await createAccount("Alice");
    await createCircle(alice);

    expect(
      await declarePresence(alice.id, {
        placeId: "00000000-0000-0000-0000-000000000000",
      }),
    ).toEqual({ ok: false, reason: "lieu_inconnu" });
  });

  it("peut masquer ponctuellement une personne du cercle", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carla = await createAccount("Carla");
    const classe = await createCircle(alice);
    await join(classe, bob);
    await join(classe, carla);
    const parc = await createPlace();

    const result = await declarePresence(alice.id, {
      placeId: parc.id,
      hiddenFrom: [bob.id],
    });
    if (!result.ok) return;

    expect(await canSeePublication(bob.id, result.value.publicationId)).toBe(false);
    expect(await canSeePublication(carla.id, result.value.publicationId)).toBe(true);
  });
});

describe("Annoncer une sortie pour plus tard", () => {
  async function unParc() {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    return { alice, bob, parc: await createPlace("Parc du Gué") };
  }

  it("apparaît dans « à venir », pas dans « en ce moment »", async () => {
    const { alice, bob, parc } = await unParc();

    const result = await declarePresence(alice.id, {
      placeId: parc.id,
      startsAt: minutesFromNow(180),
      minutes: 120,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await currentlyOut(bob.id)).toEqual([]);
    const prochaines = await upcomingOutings(bob.id);
    expect(prochaines.map((p) => p.id)).toEqual([result.value.publicationId]);
    expect(prochaines[0].placeName).toBe("Parc du Gué");
  });

  it("la fin se déduit de l'heure de début, pas de maintenant", async () => {
    const { alice, parc } = await unParc();
    const debut = minutesFromNow(180);

    const result = await declarePresence(alice.id, {
      placeId: parc.id,
      startsAt: debut,
      minutes: 60,
    });
    if (!result.ok) return;

    expect(result.value.endsAt.getTime()).toBe(debut.getTime() + 60 * 60_000);
  });

  it("refuse une heure passée ou trop lointaine", async () => {
    const { alice, parc } = await unParc();

    expect(
      await declarePresence(alice.id, { placeId: parc.id, startsAt: minutesFromNow(-60) }),
    ).toEqual({ ok: false, reason: "debut_invalide" });

    expect(
      await declarePresence(alice.id, {
        placeId: parc.id,
        startsAt: minutesFromNow(60 * 24 * 20),
      }),
    ).toEqual({ ok: false, reason: "debut_invalide" });
  });

  it("sans heure de début, la sortie commence maintenant", async () => {
    const { alice, bob, parc } = await unParc();

    await declarePresence(alice.id, { placeId: parc.id });

    expect(await currentlyOut(bob.id)).toHaveLength(1);
    expect(await upcomingOutings(bob.id)).toEqual([]);
  });

  it("propose trois durées, dont un repère qui dépend de l'heure", () => {
    const matin = dureesProposees(new Date("2026-08-10T07:30:00+02:00"));
    expect(matin.map((d) => d.libelle)).toEqual(["1 h", "2 h", "jusqu'à 12h"]);
    expect(matin[2].minutes).toBe(300);

    const apresMidi = dureesProposees(new Date("2026-08-10T15:00:00+02:00"));
    expect(apresMidi.map((d) => d.libelle)).toEqual(["1 h", "2 h", "jusqu'à 18h"]);

    // À 16 h, « jusqu'à 18h » vaudrait 2 h : on ne propose jamais deux fois la même durée.
    for (const heure of ["06", "10", "11", "12", "16", "17", "19", "23"]) {
      const durees = dureesProposees(new Date(`2026-08-10T${heure}:00:00+02:00`));
      expect(new Set(durees.map((d) => d.minutes)).size, `à ${heure} h`).toBe(3);
    }
  });
});

describe("Activité du calendrier", () => {
  it("un seul geste crée l'activité et y inscrit son auteur", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    const result = await createEventAndAttend(alice.id, {
      title: "Visite du Muséum",
      startsAt: minutesFromNow(60),
      endsAt: minutesFromNow(180),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const vues = await attendanceFor(bob.id, result.value.eventId);
    expect(vues.map((p) => p.eventTitle)).toEqual(["Visite du Muséum"]);
    expect(vues[0].authorName).toBe("Alice");
  });

  it("l'activité est publique, seule la participation est restreinte", async () => {
    const alice = await createAccount("Alice");
    const inconnu = await createAccount("Inconnu");
    await createCircle(alice);

    const result = await createEventAndAttend(alice.id, {
      title: "Visite du Muséum",
      startsAt: minutesFromNow(60),
    });
    if (!result.ok) return;

    // L'entrée existe au calendrier pour tout le monde…
    const evenements = await db.execute<{ id: string }>(
      sql`select id from event where published_at is not null`,
    );
    expect(evenements).toHaveLength(1);

    // …mais l'inconnu ne voit pas qui y va.
    expect(await attendanceFor(inconnu.id, result.value.eventId)).toEqual([]);
  });

  it("refuse un titre vide et des dates incohérentes", async () => {
    const alice = await createAccount("Alice");
    await createCircle(alice);

    expect(
      await createEventAndAttend(alice.id, { title: "  ", startsAt: minutesFromNow(60) }),
    ).toEqual({ ok: false, reason: "titre_invalide" });

    expect(
      await createEventAndAttend(alice.id, {
        title: "Atelier",
        startsAt: minutesFromNow(180),
        endsAt: minutesFromNow(60),
      }),
    ).toEqual({ ok: false, reason: "dates_invalides" });
  });

  it("on peut rejoindre une activité déjà au calendrier", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const atelier = await createEvent({ title: "Atelier poterie" });

    expect((await declareAttendance(alice.id, { eventId: atelier.id })).ok).toBe(true);
    expect((await declareAttendance(bob.id, { eventId: atelier.id })).ok).toBe(true);

    const vues = await attendanceFor(bob.id, atelier.id);
    expect(vues.map((p) => p.authorName).sort()).toEqual(["Alice", "Bob"]);
  });

  it("refuse une activité inconnue", async () => {
    const alice = await createAccount("Alice");
    await createCircle(alice);

    expect(
      await declareAttendance(alice.id, {
        eventId: "00000000-0000-0000-0000-000000000000",
      }),
    ).toEqual({ ok: false, reason: "activite_inconnue" });
  });
});

describe("« En ce moment »", () => {
  it("montre les présences en cours, pas les activités à venir", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace("Parc du Gué");

    await declarePresence(alice.id, { placeId: parc.id });
    await createEventAndAttend(alice.id, {
      title: "Visite du Muséum",
      startsAt: minutesFromNow(120),
    });

    const maintenant = await currentlyOut(bob.id);
    expect(maintenant.map((p) => p.placeName)).toEqual(["Parc du Gué"]);
  });
});

describe("Retrait", () => {
  it("l'auteur retire sa publication, personne d'autre ne le peut", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const result = await declarePresence(alice.id, { placeId: parc.id });
    if (!result.ok) return;

    expect(await withdraw(bob.id, result.value.publicationId)).toEqual({
      ok: false,
      reason: "pas_auteur",
    });
    expect(await canSeePublication(bob.id, result.value.publicationId)).toBe(true);

    expect((await withdraw(alice.id, result.value.publicationId)).ok).toBe(true);
    expect(await canSeePublication(bob.id, result.value.publicationId)).toBe(false);
  });
});

describe("Purge", () => {
  it("efface les présences expirées depuis plus de vingt-quatre heures", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice);
    const parc = await createPlace();

    const vieille = await insererPresence({
      author: alice,
      place: parc,
      circles: [classe],
      startsAt: minutesFromNow(-60 * 32),
      endsAt: minutesFromNow(-60 * 30),
    });
    const recente = await insererPresence({
      author: alice,
      place: parc,
      circles: [classe],
      startsAt: minutesFromNow(-120),
      endsAt: minutesFromNow(-30),
    });

    expect(await purgeExpired()).toBe(1);

    const restantes = await db.execute<{ id: string }>(sql`select id from publication`);
    expect(restantes.map((r) => r.id)).toEqual([recente.id]);
    expect(vieille.id).toBeTruthy();
  });

  it("ne touche pas aux présences en cours", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice);
    const parc = await createPlace();
    await insererPresence({ author: alice, place: parc, circles: [classe] });

    expect(await purgeExpired()).toBe(0);
  });
});
