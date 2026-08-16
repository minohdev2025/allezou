/**
 * Ce que ces tests garantissent : le catalogue ne se remplit pas de doublons, et personne
 * ne corrige seul dans son coin ce que tout le monde lit — ni le nom d'un lieu, ni son
 * adresse.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  VALIDATIONS_RENOMMAGE,
  archiverLieu,
  basculerFavori,
  basculerMasque,
  completerCategorie,
  createPlace,
  lieuxFavoris,
  lieuxMasques,
  pendingRenames,
  proposeAddress,
  proposeRename,
  searchPlaces,
  voteRename,
  completerAdresse,
} from "@/lib/places";
import { createAccount, resetDatabase } from "@/test/helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("Ajouter un lieu", () => {
  it("n'importe qui peut en ajouter un", async () => {
    const alice = await createAccount("Alice");

    const result = await createPlace(alice.id, { name: "Parc du Gué", commune: "Lancy" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Parc du Gué");
  });

  it("renvoie le lieu existant plutôt que d'en créer un doublon", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");

    const premier = await createPlace(alice.id, { name: "Parc du Gué" });
    // Accents, majuscules et espaces en trop ne créent pas un second lieu.
    const second = await createPlace(bob.id, { name: "  parc du gue  " });

    if (!premier.ok || !second.ok) return;
    expect(second.value.id).toBe(premier.value.id);
    expect(await searchPlaces()).toHaveLength(1);
  });

  it("refuse un nom trop court ou trop long", async () => {
    const alice = await createAccount("Alice");

    expect(await createPlace(alice.id, { name: "x" })).toEqual({
      ok: false,
      reason: "nom_invalide",
    });
    expect(await createPlace(alice.id, { name: "x".repeat(81) })).toEqual({
      ok: false,
      reason: "nom_invalide",
    });
  });

  it("garde la position posée sur la carte, et la marque géocodée", async () => {
    const alice = await createAccount("Alice");

    const result = await createPlace(alice.id, {
      name: "Parc du Gué",
      coord: { lat: 46.1858, lon: 6.1207 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lat).toBeCloseTo(46.1858);
    expect(result.value.lon).toBeCloseTo(6.1207);
    // Géocodée d'origine : le passage Nominatim n'a plus rien à demander pour elle.
    expect(result.value.geocodedAt).not.toBeNull();
  });

  it("refuse une position hors du monde", async () => {
    const alice = await createAccount("Alice");

    expect(
      await createPlace(alice.id, { name: "Parc du Gué", coord: { lat: 91, lon: 6.12 } }),
    ).toEqual({ ok: false, reason: "position_invalide" });
    expect(
      await createPlace(alice.id, { name: "Parc du Gué", coord: { lat: 46.18, lon: 181 } }),
    ).toEqual({ ok: false, reason: "position_invalide" });
  });

  it("garde la catégorie annoncée, et refuse celles qui n'existent pas", async () => {
    const alice = await createAccount("Alice");

    const parc = await createPlace(alice.id, { name: "Parc du Gué", categorie: "parc" });
    expect(parc.ok).toBe(true);
    if (parc.ok) expect(parc.value.categorie).toBe("parc");

    expect(
      await createPlace(alice.id, { name: "Base secrète", categorie: "base_secrete" }),
    ).toEqual({ ok: false, reason: "categorie_invalide" });
  });

  it("se cherche par fragment de nom", async () => {
    const alice = await createAccount("Alice");
    await createPlace(alice.id, { name: "Parc du Gué" });
    await createPlace(alice.id, { name: "École de Lancy" });

    expect((await searchPlaces("parc")).map((p) => p.name)).toEqual(["Parc du Gué"]);
    expect(await searchPlaces()).toHaveLength(2);
  });
});

describe("Favoris et lieux masqués", () => {
  it("l'étoile s'épingle et se détache, pour soi seulement", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const cree = await createPlace(alice.id, { name: "Parc du Gué" });
    if (!cree.ok) return;

    expect(await basculerFavori(alice.id, cree.value.id)).toBe(true);
    expect(await lieuxFavoris(alice.id)).toEqual([cree.value.id]);
    // Le favori d'Alice ne dit rien à Bob.
    expect(await lieuxFavoris(bob.id)).toEqual([]);

    expect(await basculerFavori(alice.id, cree.value.id)).toBe(false);
    expect(await lieuxFavoris(alice.id)).toEqual([]);
  });

  it("masquer retire l'étoile, et réafficher ne la rend pas", async () => {
    const alice = await createAccount("Alice");
    const cree = await createPlace(alice.id, { name: "Parc du Gué" });
    if (!cree.ok) return;

    await basculerFavori(alice.id, cree.value.id);
    expect(await basculerMasque(alice.id, cree.value.id)).toBe(true);

    expect(await lieuxMasques(alice.id)).toEqual([cree.value.id]);
    expect(await lieuxFavoris(alice.id)).toEqual([]);

    // Réafficher rend le lieu, pas l'épingle : elle a été retirée, pas suspendue.
    expect(await basculerMasque(alice.id, cree.value.id)).toBe(false);
    expect(await lieuxMasques(alice.id)).toEqual([]);
    expect(await lieuxFavoris(alice.id)).toEqual([]);
  });
});

describe("Retirer un lieu du catalogue", () => {
  it("le lieu disparaît des recherches, et son nom redevient libre", async () => {
    const alice = await createAccount("Alice");
    const cree = await createPlace(alice.id, { name: "Parc du Gué" });
    if (!cree.ok) return;

    expect(await archiverLieu(cree.value.id)).toEqual({ ok: true, value: undefined });
    expect(await searchPlaces()).toHaveLength(0);

    // Un nom archivé n'est plus un doublon : le lieu peut renaître, neuf.
    const renaissance = await createPlace(alice.id, { name: "Parc du Gué" });
    expect(renaissance.ok).toBe(true);
    if (renaissance.ok) expect(renaissance.value.id).not.toBe(cree.value.id);
  });

  it("retirer deux fois ne retire qu'une fois", async () => {
    const alice = await createAccount("Alice");
    const cree = await createPlace(alice.id, { name: "Parc du Gué" });
    if (!cree.ok) return;

    await archiverLieu(cree.value.id);
    expect(await archiverLieu(cree.value.id)).toEqual({ ok: false, reason: "lieu_inconnu" });
  });
});

describe("Classer un lieu", () => {
  it("remplit un vide, une fois et une seule", async () => {
    const alice = await createAccount("Alice");
    const cree = await createPlace(alice.id, { name: "Parc du Gué" });
    if (!cree.ok) return;

    expect(await completerCategorie(cree.value.id, "parc")).toEqual({
      ok: true,
      value: undefined,
    });
    // Déjà classé : la seconde tentative ne défait pas le geste de la première.
    expect(await completerCategorie(cree.value.id, "piscine")).toEqual({
      ok: false,
      reason: "categorie_deja_connue",
    });

    const [apres] = await searchPlaces("Parc du Gué");
    expect(apres.categorie).toBe("parc");
  });

  it("refuse une catégorie inventée", async () => {
    const alice = await createAccount("Alice");
    const cree = await createPlace(alice.id, { name: "Parc du Gué" });
    if (!cree.ok) return;

    expect(await completerCategorie(cree.value.id, "volcan")).toEqual({
      ok: false,
      reason: "categorie_invalide",
    });
  });
});

describe("L'adresse d'un lieu", () => {
  it("s'enregistre à la création", async () => {
    const alice = await createAccount("Alice");
    const lieu = await createPlace(alice.id, {
      name: "Parc du Gué",
      commune: "Petit-Lancy",
      address: "Chemin du Gué 12",
    });

    expect(lieu.ok && lieu.value.address).toBe("Chemin du Gué 12");
  });

  it("reste vide quand personne ne la donne", async () => {
    const alice = await createAccount("Alice");
    const lieu = await createPlace(alice.id, { name: "Parc des Evaux" });

    expect(lieu.ok && lieu.value.address).toBeNull();
  });

  it("se complète quand elle manque", async () => {
    const alice = await createAccount("Alice");
    const lieu = await createPlace(alice.id, { name: "Parc des Evaux" });
    if (!lieu.ok) throw new Error("le lieu devait être créé");

    const resultat = await completerAdresse(lieu.value.id, "  Route de Chancy 1  ");

    expect(resultat.ok).toBe(true);
    const relu = await searchPlaces("Evaux");
    expect(relu[0].address).toBe("Route de Chancy 1");
  });

  it("ne s'écrase pas une fois connue", async () => {
    const alice = await createAccount("Alice");
    const lieu = await createPlace(alice.id, {
      name: "Parc du Gué",
      address: "Chemin du Gué 12",
    });
    if (!lieu.ok) throw new Error("le lieu devait être créé");

    // Remplir un vide n'est pas défaire le travail de quelqu'un ; corriger, si.
    const resultat = await completerAdresse(lieu.value.id, "Ailleurs 99");

    expect(resultat).toEqual({ ok: false, reason: "adresse_deja_connue" });
    const relu = await searchPlaces("Gué");
    expect(relu[0].address).toBe("Chemin du Gué 12");
  });

  it("refuse une saisie vide", async () => {
    const alice = await createAccount("Alice");
    const lieu = await createPlace(alice.id, { name: "Parc des Evaux" });
    if (!lieu.ok) throw new Error("le lieu devait être créé");

    expect(await completerAdresse(lieu.value.id, "   ")).toEqual({
      ok: false,
      reason: "adresse_invalide",
    });
  });
});

describe("Corriger une adresse déjà écrite", () => {
  async function unLieuAdresse() {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carla = await createAccount("Carla");
    const lieu = await createPlace(alice.id, {
      name: "Maison de quartier",
      address: "Rue Fausse 1",
    });
    if (!lieu.ok) throw new Error("le lieu devait être créé");
    return { alice, bob, carla, lieuId: lieu.value.id };
  }

  it("ne prend effet qu'après validation par plusieurs personnes", async () => {
    const { alice, bob, carla, lieuId } = await unLieuAdresse();

    const proposition = await proposeAddress(alice.id, lieuId, "Avenue Juste 7");
    if (!proposition.ok) throw new Error("la proposition devait être ouverte");
    expect(proposition.value.votes).toBe(1);

    // Une voix ne suffit pas : sinon corriger reviendrait à écraser, ce que le produit
    // refuse depuis le début.
    expect((await searchPlaces("Maison"))[0].address).toBe("Rue Fausse 1");

    await voteRename(bob.id, proposition.value.id);
    expect((await searchPlaces("Maison"))[0].address).toBe("Rue Fausse 1");

    const derniere = await voteRename(carla.id, proposition.value.id);
    expect(derniere.ok && derniere.value.votes).toBe(VALIDATIONS_RENOMMAGE);
    expect((await searchPlaces("Maison"))[0].address).toBe("Avenue Juste 7");
  });

  /*
    Le piège de ce chantier.

    Les coordonnées ont été demandées à OpenStreetMap pour l'ancienne adresse. Les garder
    ferait tomber le lien de carte sur l'ancien point, avec la nouvelle adresse écrite juste
    à côté : une famille suivrait le repère sans jamais lire l'adresse, et se tromperait de
    quartier. Un mauvais point est pire que pas de point.
  */
  it("oublie les coordonnées de l'ancienne adresse", async () => {
    const { alice, bob, carla, lieuId } = await unLieuAdresse();

    await db.execute(
      sql`update place set lat = 46.2, lon = 6.1, geocoded_at = now() where id = ${lieuId}`,
    );

    const proposition = await proposeAddress(alice.id, lieuId, "Avenue Juste 7");
    if (!proposition.ok) throw new Error("la proposition devait être ouverte");
    await voteRename(bob.id, proposition.value.id);
    await voteRename(carla.id, proposition.value.id);

    const [apres] = await db.execute<{
      lat: number | null;
      lon: number | null;
      geocoded_at: Date | null;
    }>(sql`select lat, lon, geocoded_at from place where id = ${lieuId}`);

    // Remis à zéro, donc le prochain passage de géocodage le reprendra : c'est lui qui ne
    // traite que ce qui n'a jamais été tenté.
    expect(apres.lat).toBeNull();
    expect(apres.lon).toBeNull();
    expect(apres.geocoded_at).toBeNull();
  });

  it("laisse le vide se remplir sans vote", async () => {
    const alice = await createAccount("Alice");
    const lieu = await createPlace(alice.id, { name: "Parc des Evaux" });
    if (!lieu.ok) throw new Error("le lieu devait être créé");

    // Rien à corriger tant qu'il n'y a rien d'écrit : c'est `completerAdresse` qui sert.
    expect(await proposeAddress(alice.id, lieu.value.id, "Route de Chancy 1")).toEqual({
      ok: false,
      reason: "adresse_deja_connue",
    });
  });

  it("ne balaie pas les corrections de nom en cours", async () => {
    const { alice, bob, carla, lieuId } = await unLieuAdresse();

    const surLeNom = await proposeRename(alice.id, lieuId, "Maison de quartier des Evaux");
    const surLAdresse = await proposeAddress(alice.id, lieuId, "Avenue Juste 7");
    if (!surLeNom.ok || !surLAdresse.ok) throw new Error("les propositions devaient s'ouvrir");

    await voteRename(bob.id, surLAdresse.value.id);
    await voteRename(carla.id, surLAdresse.value.id);

    // L'adresse est tranchée ; le nom, lui, n'a pas été voté, et les voix déjà données
    // dessus doivent survivre.
    const restantes = await pendingRenames(lieuId);
    expect(restantes.map((p) => p.id)).toEqual([surLeNom.value.id]);
  });
});

describe("Renommer un lieu", () => {
  it("ne prend effet qu'après validation par plusieurs personnes", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carla = await createAccount("Carla");

    const lieu = await createPlace(alice.id, { name: "Parc du gué" });
    if (!lieu.ok) return;

    const proposition = await proposeRename(alice.id, lieu.value.id, "Parc du Gué (Lancy)");
    expect(proposition.ok).toBe(true);
    if (!proposition.ok) return;
    expect(proposition.value.votes).toBe(1);
    expect(proposition.value.needed).toBe(VALIDATIONS_RENOMMAGE);

    // Après une seule voix supplémentaire, le lieu porte toujours son ancien nom.
    await voteRename(bob.id, proposition.value.id);
    expect((await searchPlaces("Parc"))[0].name).toBe("Parc du gué");

    await voteRename(carla.id, proposition.value.id);
    expect((await searchPlaces("Parc"))[0].name).toBe("Parc du Gué (Lancy)");
  });

  it("une même personne ne peut pas valider deux fois", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");

    const lieu = await createPlace(alice.id, { name: "Parc du gué" });
    if (!lieu.ok) return;
    const proposition = await proposeRename(alice.id, lieu.value.id, "Parc du Gué");
    if (!proposition.ok) return;

    await voteRename(bob.id, proposition.value.id);
    const rejoue = await voteRename(bob.id, proposition.value.id);

    expect(rejoue.ok).toBe(true);
    if (!rejoue.ok) return;
    expect(rejoue.value.votes).toBe(2);
    expect((await searchPlaces("Parc"))[0].name).toBe("Parc du gué");
  });

  it("proposer un nom déjà proposé ajoute sa voix au lieu d'ouvrir un doublon", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");

    const lieu = await createPlace(alice.id, { name: "Parc du gué" });
    if (!lieu.ok) return;

    await proposeRename(alice.id, lieu.value.id, "Parc du Gué");
    const seconde = await proposeRename(bob.id, lieu.value.id, "parc du gué");

    expect(seconde.ok).toBe(true);
    if (!seconde.ok) return;
    expect(seconde.value.votes).toBe(2);
    expect(await pendingRenames(lieu.value.id)).toHaveLength(1);
  });

  it("un renommage appliqué clôt les autres propositions du même lieu", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carla = await createAccount("Carla");

    const lieu = await createPlace(alice.id, { name: "Parc" });
    if (!lieu.ok) return;

    const autre = await proposeRename(bob.id, lieu.value.id, "Parc de Lancy");
    const gagnante = await proposeRename(alice.id, lieu.value.id, "Parc du Gué");
    if (!autre.ok || !gagnante.ok) return;

    await voteRename(bob.id, gagnante.value.id);
    await voteRename(carla.id, gagnante.value.id);

    expect(await pendingRenames(lieu.value.id)).toEqual([]);
    expect(await voteRename(carla.id, autre.value.id)).toEqual({
      ok: false,
      reason: "proposition_close",
    });
  });

  it("refuse un lieu inconnu et une proposition inconnue", async () => {
    const alice = await createAccount("Alice");
    const inexistant = "00000000-0000-0000-0000-000000000000";

    expect(await proposeRename(alice.id, inexistant, "Parc")).toEqual({
      ok: false,
      reason: "lieu_inconnu",
    });
    expect(await voteRename(alice.id, inexistant)).toEqual({
      ok: false,
      reason: "proposition_inconnue",
    });
  });
});
