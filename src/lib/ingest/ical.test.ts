/**
 * Ce que ces tests garantissent : une feuille iCalendar communale est lue telle qu'elle est
 * écrite, à l'heure de Genève, sans qu'aucune date ne se décale d'une heure en hiver ni d'un
 * jour à minuit.
 *
 * La feuille d'exemple reprend la forme exacte que publie « The Events Calendar », le greffon
 * WordPress qu'utilisent Chêne-Bougeries et Laconnex.
 */

import { describe, expect, it } from "vitest";

import { eventsFromIcs } from "@/lib/ingest/ical";

const SOURCE = "https://chene-bougeries.ch/evenements/?ical=1";

const FEUILLE = String.raw`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Commune de Chêne-Bougeries - ECPv6.17.2//NONSGML v1.0//EN
CALSCALE:GREGORIAN
BEGIN:VTIMEZONE
TZID:Europe/Zurich
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Europe/Zurich:20260903T110000
DTEND;TZID=Europe/Zurich:20260906T170000
UID:10003268@chene-bougeries.ch
SUMMARY:Sey'maz Musique festival : 2e édition
DESCRIPTION:Une programmation classique\, exigeante et accessible\ndès 6 ans.
URL:https://chene-bougeries.ch/evenement/seymaz-musique-festival/
LOCATION:Parc Stagni\, Chemin de la Colombe 7\, Chêne-Bougeries\, Genève\, 1224\, Switzerland
CATEGORIES:Musique
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260912
DTEND;VALUE=DATE:20260913
UID:10003257@chene-bougeries.ch
SUMMARY:Découvrir le patrimoine - La Bessonnette
LOCATION:La Bessonnette\, Chêne-Bougeries
CATEGORIES:Animation
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/Zurich:20261120T200000
UID:10003300@chene-bougeries.ch
SUMMARY:Séance ordinaire - novembre 2026
CATEGORIES:Séances Conseil municipal
END:VEVENT
BEGIN:VEVENT
DTSTART:20260701T083000Z
UID:10003301@chene-bougeries.ch
SUMMARY:Un titre assez long pour repartir à la ligne comme le veut la nor
 me
END:VEVENT
BEGIN:VEVENT
UID:10003302@chene-bougeries.ch
SUMMARY:Sans date, donc sans intérêt
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/Zurich:20261005T140000
DTEND;TZID=Europe/Zurich:20261005T120000
UID:10003303@chene-bougeries.ch
SUMMARY:Une fin avant son début
END:VEVENT
END:VCALENDAR`;

const lues = eventsFromIcs(FEUILLE, SOURCE, ["Séances Conseil municipal"]);
const parTitre = (debut: string) => lues.find((event) => event.title.startsWith(debut))!;

describe("Lecture d'une feuille iCalendar communale", () => {
  it("ne garde que les activités datées et non écartées", () => {
    expect(lues.map((event) => event.title)).toEqual([
      "Sey'maz Musique festival : 2e édition",
      "Découvrir le patrimoine - La Bessonnette",
      "Un titre assez long pour repartir à la ligne comme le veut la norme",
      "Une fin avant son début",
    ]);
  });

  it("lit l'heure de Genève comme l'instant qu'elle désigne", () => {
    // 11h00 à Genève un 3 septembre, c'est-à-dire l'heure d'été : 09h00 UTC.
    expect(parTitre("Sey'maz").startsAt.toISOString()).toBe("2026-09-03T09:00:00.000Z");
    expect(parTitre("Sey'maz").endsAt?.toISOString()).toBe("2026-09-06T15:00:00.000Z");
  });

  it("place une journée entière à minuit, heure de Genève", () => {
    expect(parTitre("Découvrir").startsAt.toISOString()).toBe("2026-09-11T22:00:00.000Z");
    expect(parTitre("Découvrir").endsAt?.toISOString()).toBe("2026-09-12T22:00:00.000Z");
  });

  it("lit un horodatage déjà en UTC sans y toucher", () => {
    expect(parTitre("Un titre").startsAt.toISOString()).toBe("2026-07-01T08:30:00.000Z");
  });

  it("recolle une ligne repliée", () => {
    expect(parTitre("Un titre").title).toBe(
      "Un titre assez long pour repartir à la ligne comme le veut la norme",
    );
  });

  it("rend les virgules et les retours à la ligne échappés", () => {
    expect(parTitre("Sey'maz").description).toBe(
      "Une programmation classique, exigeante et accessible dès 6 ans.",
    );
  });

  it("ne garde du lieu que son nom", () => {
    expect(parTitre("Sey'maz").placeLabel).toBe("Parc Stagni");
    expect(parTitre("Découvrir").placeLabel).toBe("La Bessonnette");
  });

  it("lit la tranche d'âge quand la description l'annonce", () => {
    expect(parTitre("Sey'maz").minAge).toBe(6);
    expect(parTitre("Découvrir").minAge).toBeUndefined();
  });

  it("garde l'identifiant de la commune plutôt que d'en fabriquer un", () => {
    expect(parTitre("Sey'maz").externalId).toBe("10003268@chene-bougeries.ch");
  });

  it("laisse tomber une fin antérieure au début plutôt que la source entière", () => {
    expect(parTitre("Une fin").endsAt).toBeUndefined();
  });

  it("retombe sur l'adresse de la source quand la fiche n'a pas d'URL", () => {
    expect(parTitre("Découvrir").url).toBe(SOURCE);
  });
});

describe("Une feuille qui n'en est pas une", () => {
  it("rend une liste vide plutôt que d'échouer", () => {
    expect(eventsFromIcs("<html>404</html>", SOURCE)).toEqual([]);
  });
});

describe("Le passage à l'heure d'hiver", () => {
  it("ne décale pas une activité de novembre", () => {
    const feuille = String.raw`BEGIN:VEVENT
DTSTART;TZID=Europe/Zurich:20261120T200000
UID:hiver@test
SUMMARY:Cirque de Noël
END:VEVENT`;
    // 20h00 à Genève un 20 novembre, c'est-à-dire l'heure d'hiver : 19h00 UTC.
    expect(eventsFromIcs(feuille, SOURCE)[0].startsAt.toISOString()).toBe(
      "2026-11-20T19:00:00.000Z",
    );
  });
});
