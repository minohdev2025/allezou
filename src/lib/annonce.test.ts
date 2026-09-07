/**
 * Ce que ces tests garantissent : ce qu'Allezou lit d'une annonce arrive au formulaire
 * dans l'heure murale de Genève, et jamais rien qui ne ressemble à une activité ne passe.
 * Les fonctions pures seulement ; l'appel au modèle est couvert par le test réel en dev.
 */

import { describe, expect, it } from "vitest";

import {
  adressePrivee,
  annonceDepuisPayload,
  murDeGeneve,
  urlPubliqueSure,
} from "@/lib/annonce";

describe("murDeGeneve", () => {
  it("affiche un instant d'été dans l'heure murale de Genève", () => {
    expect(murDeGeneve("2026-08-15T15:00:00+02:00")).toBe("2026-08-15T15:00");
    expect(murDeGeneve("2026-08-15T13:00:00Z")).toBe("2026-08-15T15:00");
  });

  it("affiche un instant d'hiver dans l'heure murale de Genève", () => {
    expect(murDeGeneve("2026-01-04T14:00:00+01:00")).toBe("2026-01-04T14:00");
    expect(murDeGeneve("2026-01-04T13:00:00Z")).toBe("2026-01-04T14:00");
  });

  it("refuse ce qui n'est pas une date", () => {
    expect(murDeGeneve("demain 15h")).toBeNull();
    expect(murDeGeneve("")).toBeNull();
  });
});

describe("urlPubliqueSure", () => {
  it("accepte un lien public", () => {
    expect(urlPubliqueSure("https://www.geneve.ch/manifestations")?.hostname).toBe(
      "www.geneve.ch",
    );
    expect(urlPubliqueSure("http://exemple.ch/a")).not.toBeNull();
  });

  it("refuse les protocoles qui ne sont pas http(s)", () => {
    expect(urlPubliqueSure("file:///etc/passwd")).toBeNull();
    expect(urlPubliqueSure("ftp://exemple.ch/a")).toBeNull();
    expect(urlPubliqueSure("javascript:alert(1)")).toBeNull();
  });

  it("refuse les hôtes locaux et privés", () => {
    for (const url of [
      "http://localhost:3000",
      "http://127.0.0.1/a",
      "http://10.0.0.5/a",
      "http://192.168.1.1/a",
      "http://172.16.0.1/a",
      "http://169.254.169.254/latest/meta-data/",
      "http://imprimante.local/a",
      "http://serveur.internal/a",
      "http://[::1]/a",
      "http://[fe80::1]/a",
      "http://[fc00::1]/a",
      // IPv6 mappée sur IPv4 : le navigateur l'écrit « [::ffff:7f00:1] », la boucle locale
      // se cachait derrière ce format.
      "http://[::ffff:127.0.0.1]/a",
      "http://[::ffff:169.254.169.254]/latest/meta-data/",
      "http://[::ffff:10.0.0.1]/a",
      // Formes déguisées d'une IPv4, que `new URL()` ramène à la forme décimale.
      "http://0x7f000001/a",
      "http://2130706433/a",
      "http://127.1/a",
    ]) {
      expect(urlPubliqueSure(url), url).toBeNull();
    }
  });

  it("juge une adresse résolue par le DNS comme une adresse tapée", () => {
    expect(adressePrivee("127.0.0.1")).toBe(true);
    expect(adressePrivee("::ffff:7f00:1")).toBe(true);
    expect(adressePrivee("::ffff:a9fe:a9fe")).toBe(true);
    expect(adressePrivee("fd12::1")).toBe(true);
    expect(adressePrivee("93.184.216.34")).toBe(false);
    expect(adressePrivee("2001:db8::1")).toBe(false);
    expect(adressePrivee("::ffff:5db8:d822")).toBe(false);
  });

  it("accepte une IP publique", () => {
    expect(urlPubliqueSure("http://93.184.216.34/a")).not.toBeNull();
    expect(urlPubliqueSure("http://[2001:db8::1]/a")).not.toBeNull();
  });

  it("refuse ce qui n'est pas une URL", () => {
    expect(urlPubliqueSure("pas une url")).toBeNull();
  });
});

describe("annonceDepuisPayload", () => {
  const annonce = {
    titre: "Fête de l'escalade",
    debut: "2026-12-12T18:00:00+01:00",
    fin: "2026-12-12T22:30:00+01:00",
    lieu: "Vieille Ville, Genève",
  };

  it("lit l'enveloppe demandée", () => {
    const lu = annonceDepuisPayload({ annonce });
    expect(lu).toEqual({
      ok: true,
      titre: "Fête de l'escalade",
      debut: "2026-12-12T18:00",
      fin: "2026-12-12T22:30",
      lieu: "Vieille Ville, Genève",
    });
  });

  it("lit aussi l'objet nu", () => {
    const lu = annonceDepuisPayload(annonce);
    expect(lu.ok).toBe(true);
  });

  it("rend rien_trouve quand le modèle dit null", () => {
    expect(annonceDepuisPayload({ annonce: null })).toEqual({
      ok: false,
      raison: "rien_trouve",
    });
  });

  it("rend rien_trouve quand la forme est inattendue", () => {
    expect(annonceDepuisPayload({ titre: "sans date" })).toEqual({
      ok: false,
      raison: "rien_trouve",
    });
    expect(annonceDepuisPayload("texte")).toEqual({ ok: false, raison: "rien_trouve" });
  });

  it("rend date_invraisemblable pour une date hors fenêtre", () => {
    const lu = annonceDepuisPayload({
      annonce: { ...annonce, debut: "2031-06-01T10:00:00+02:00" },
    });
    expect(lu).toEqual({ ok: false, raison: "date_invraisemblable" });
  });

  it("rend rien_trouve pour une date illisible", () => {
    const lu = annonceDepuisPayload({ annonce: { ...annonce, debut: "samedi" } });
    expect(lu).toEqual({ ok: false, raison: "rien_trouve" });
  });

  it("accepte l'annonce sans fin ni lieu", () => {
    const lu = annonceDepuisPayload({
      annonce: { titre: "Sortie luge", debut: "2026-12-12T09:00:00+01:00" },
    });
    expect(lu.ok).toBe(true);
    if (lu.ok) {
      expect(lu.fin).toBeUndefined();
      expect(lu.lieu).toBeUndefined();
    }
  });

  it("borne le titre à ce qu'accepte le formulaire", () => {
    const lu = annonceDepuisPayload({
      annonce: { ...annonce, titre: "x".repeat(150) },
    });
    expect(lu.ok).toBe(true);
    if (lu.ok) expect(lu.titre.length).toBe(120);
  });

  it("refuse un titre déraisonnablement long", () => {
    const lu = annonceDepuisPayload({
      annonce: { ...annonce, titre: "x".repeat(300) },
    });
    expect(lu).toEqual({ ok: false, raison: "rien_trouve" });
  });
});
