/**
 * « De quand à quand » on va à une activité de l'agenda.
 *
 * Ce que ces tests garantissent : une famille qui ne touche à rien garde l'horaire de
 * l'activité ; une famille qui passe un seul jour à une exposition de six semaines n'est
 * annoncée que ce jour-là ; et aucun horaire saisi ne fabrique une inscription que
 * personne ne verrait, ou qui chevaucherait minuit.
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { heureDeGeneve } from "@/lib/heure";
import {
  notifyUpcomingAttendances,
  reglerRappelPresence,
  subscribe,
  type Sender,
} from "@/lib/notifications";
import {
  declareAttendance,
  horaireInscription,
  joursDeLActivite,
  setAttendanceTimes,
} from "@/lib/publications";
import { visiblePublications } from "@/lib/visibility";
import {
  createAccount,
  createCircle,
  createEvent,
  join,
  minutesFromNow,
  resetDatabase,
} from "@/test/helpers";

/** Un instant lu comme une heure murale de Genève. */
function g(valeur: string): Date {
  const date = heureDeGeneve(valeur);
  if (!date) throw new Error(`date de test illisible : ${valeur}`);
  return date;
}

const atelier = {
  startsAt: g("2026-10-24T14:00"),
  endsAt: g("2026-10-24T16:00"),
  allDay: false,
};

/** Une exposition sans horaire, ouverte tout octobre et tout novembre. */
const exposition = {
  startsAt: g("2026-10-01T00:00"),
  endsAt: g("2026-11-30T00:00"),
  allDay: true,
};

const lundiMatin = g("2026-10-19T10:00");

describe("L'horaire d'une inscription", () => {
  it("sans rien saisir, reprend l'horaire de l'activité", () => {
    const horaire = horaireInscription(atelier, {}, lundiMatin);
    expect(horaire).toEqual({
      ok: true,
      value: { startsAt: atelier.startsAt, endsAt: atelier.endsAt },
    });
  });

  it("garde l'horaire de la famille, même un peu avant l'ouverture", () => {
    const horaire = horaireInscription(atelier, { de: "13:30", a: "15:00" }, lundiMatin);
    expect(horaire).toEqual({
      ok: true,
      value: { startsAt: g("2026-10-24T13:30"), endsAt: g("2026-10-24T15:00") },
    });
  });

  it("refuse une fin avant le début, plutôt que de passer minuit", () => {
    expect(horaireInscription(atelier, { de: "15:00", a: "14:00" }, lundiMatin)).toEqual({
      ok: false,
      reason: "horaire_invalide",
    });
  });

  it("refuse un passage de dix minutes", () => {
    expect(horaireInscription(atelier, { de: "14:00", a: "14:10" }, lundiMatin)).toEqual({
      ok: false,
      reason: "horaire_invalide",
    });
  });

  it("refuse une heure qui n'existe pas", () => {
    expect(horaireInscription(atelier, { de: "25:00" }, lundiMatin)).toEqual({
      ok: false,
      reason: "horaire_invalide",
    });
  });

  it("refuse un horaire déjà terminé", () => {
    const tot = { startsAt: g("2026-10-19T08:00"), endsAt: g("2026-10-19T09:00"), allDay: false };
    expect(horaireInscription(tot, {}, lundiMatin)).toEqual({
      ok: false,
      reason: "horaire_invalide",
    });
  });

  it("« dès 17h » à une activité qui finit à 16h prête deux heures, sans inventer de fin passée", () => {
    const horaire = horaireInscription(atelier, { de: "17:00" }, lundiMatin);
    expect(horaire).toEqual({
      ok: true,
      value: { startsAt: g("2026-10-24T17:00"), endsAt: g("2026-10-24T19:00") },
    });
  });

  it("une activité dont la fin vaut le début ne donne pas une inscription de durée nulle", () => {
    const pile = { startsAt: g("2026-10-24T10:00"), endsAt: g("2026-10-24T10:00"), allDay: false };
    const horaire = horaireInscription(pile, {}, lundiMatin);
    expect(horaire.ok && horaire.value.endsAt).toEqual(g("2026-10-24T14:00"));
  });
});

describe("Une activité sur plusieurs jours", () => {
  it("compte ses jours bornes comprises, comme la fiche les affiche", () => {
    expect(joursDeLActivite(exposition)).toEqual({ premier: "2026-10-01", dernier: "2026-11-30" });
    expect(joursDeLActivite(atelier)).toEqual({ premier: "2026-10-24", dernier: "2026-10-24" });
    // Une activité à l'heure qui finit pile à minuit n'a pas lieu le lendemain.
    const soiree = { startsAt: g("2026-10-24T20:00"), endsAt: g("2026-10-25T00:00"), allDay: false };
    expect(joursDeLActivite(soiree)).toEqual({ premier: "2026-10-24", dernier: "2026-10-24" });
  });

  it("sans jour choisi, c'est aujourd'hui et la journée entière — pas le 1er octobre", () => {
    const horaire = horaireInscription(exposition, {}, lundiMatin);
    expect(horaire).toEqual({
      ok: true,
      value: { startsAt: g("2026-10-19T00:00"), endsAt: g("2026-10-20T00:00") },
    });
  });

  it("annonce la famille le jour qu'elle a choisi, aux heures qu'elle a dites", () => {
    const horaire = horaireInscription(
      exposition,
      { jour: "2026-10-24", de: "14:00", a: "16:00" },
      lundiMatin,
    );
    expect(horaire).toEqual({
      ok: true,
      value: { startsAt: g("2026-10-24T14:00"), endsAt: g("2026-10-24T16:00") },
    });
  });

  it("refuse un jour hors de l'activité, ou déjà passé", () => {
    for (const jour of ["2026-12-01", "2026-09-30", "2026-10-18", "24.10.2026"]) {
      expect(horaireInscription(exposition, { jour }, lundiMatin), jour).toEqual({
        ok: false,
        reason: "jour_invalide",
      });
    }
  });

  it("refuse une activité entièrement passée", () => {
    const passee = { startsAt: g("2026-09-01T00:00"), endsAt: g("2026-09-30T00:00"), allDay: true };
    expect(horaireInscription(passee, {}, lundiMatin)).toEqual({
      ok: false,
      reason: "jour_invalide",
    });
  });

  it("le dimanche du changement d'heure dure vingt-cinq heures, pas vingt-quatre", () => {
    const horaire = horaireInscription(exposition, { jour: "2026-10-25" }, lundiMatin);
    if (!horaire.ok) throw new Error(horaire.reason);
    expect(horaire.value.endsAt.getTime() - horaire.value.startsAt.getTime()).toBe(25 * 3_600_000);
  });
});

describe("L'horaire à l'écran des autres familles", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("une famille du cercle lit l'horaire choisi, pas celui de l'activité", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    // Une exposition commencée il y a dix jours, qui court encore trois semaines.
    const expo = await createEvent({
      title: "Exposition dinosaures",
      startsAt: minutesFromNow(-10 * 24 * 60),
      endsAt: minutesFromNow(21 * 24 * 60),
    });
    const demain = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(
      minutesFromNow(24 * 60),
    );

    const inscription = await declareAttendance(alice.id, {
      eventId: expo.id,
      circleIds: [classe.id],
      horaire: { jour: demain, de: "14:00", a: "16:00" },
    });
    if (!inscription.ok) throw new Error(inscription.reason);

    const [vue] = await visiblePublications(bob.id, { kind: "attendance" });
    expect(vue.startsAt).toEqual(g(`${demain}T14:00`));
    expect(vue.endsAt).toEqual(g(`${demain}T16:00`));
  });

  it("changer d'horaire ne republie rien, et réarme le rappel", async () => {
    const alice = await createAccount("Alice");
    await createCircle(alice);
    const activite = await createEvent({ startsAt: minutesFromNow(60 * 24 * 3) });

    const inscription = await declareAttendance(alice.id, { eventId: activite.id });
    if (!inscription.ok) throw new Error(inscription.reason);
    const id = inscription.value.publicationId;
    await db.update(s.publication).set({ remindedAt: new Date() }).where(eq(s.publication.id, id));

    const jour = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(
      activite.startsAt,
    );
    const change = await setAttendanceTimes(alice.id, id, { de: "08:00", a: "09:30" });
    expect(change.ok).toBe(true);

    const [ligne] = await db.select().from(s.publication).where(eq(s.publication.id, id));
    expect(ligne.startsAt).toEqual(g(`${jour}T08:00`));
    expect(ligne.endsAt).toEqual(g(`${jour}T09:30`));
    expect(ligne.remindedAt).toBeNull();
    // Toujours une seule inscription : on a corrigé, pas republié.
    expect(await db.select().from(s.publication)).toHaveLength(1);
  });

  it("on ne change pas l'horaire de l'inscription d'une autre famille", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const activite = await createEvent({ startsAt: minutesFromNow(60 * 24) });
    const inscription = await declareAttendance(alice.id, { eventId: activite.id });
    if (!inscription.ok) throw new Error(inscription.reason);

    expect(
      await setAttendanceTimes(bob.id, inscription.value.publicationId, { de: "10:00" }),
    ).toEqual({ ok: false, reason: "pas_auteur" });
  });

  it("le rappel suit l'heure de la famille, même pour une activité commencée depuis longtemps", async () => {
    const alice = await createAccount("Alice");
    await createCircle(alice);
    await subscribe(alice.id, {
      endpoint: `https://push.test/${alice.id}`,
      keys: { p256dh: "cle-publique", auth: "secret" },
    });
    await reglerRappelPresence(alice.id, 2);

    const expo = await createEvent({
      startsAt: minutesFromNow(-10 * 24 * 60),
      endsAt: minutesFromNow(21 * 24 * 60),
    });
    // Dans une heure et demie, à la minute près : l'heure saisie est une heure murale.
    const bientot = minutesFromNow(90);
    const heure = new Intl.DateTimeFormat("fr-CH", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      minute: "2-digit",
    }).format(bientot);
    const jour = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(bientot);
    const fin = new Intl.DateTimeFormat("fr-CH", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      minute: "2-digit",
    }).format(minutesFromNow(90 + 60));
    // Une heure et demie avant minuit, le test se tairait : on ne le joue pas à cheval.
    if (fin <= heure) return;

    const inscription = await declareAttendance(alice.id, {
      eventId: expo.id,
      horaire: { jour, de: heure, a: fin },
    });
    if (!inscription.ok) throw new Error(inscription.reason);

    const corps: string[] = [];
    const send: Sender = async (_cible, payload) => {
      corps.push(payload.body);
    };
    expect((await notifyUpcomingAttendances(send)).recipients).toBe(1);
    expect(corps[0]).toContain(heure);
  });
});
