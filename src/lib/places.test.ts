/**
 * Ce que ces tests garantissent : le catalogue ne se remplit pas de doublons, et personne
 * ne renomme un lieu seul dans son coin.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  VALIDATIONS_RENOMMAGE,
  createPlace,
  pendingRenames,
  proposeRename,
  searchPlaces,
  voteRename,
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

  it("se cherche par fragment de nom", async () => {
    const alice = await createAccount("Alice");
    await createPlace(alice.id, { name: "Parc du Gué" });
    await createPlace(alice.id, { name: "École de Lancy" });

    expect((await searchPlaces("parc")).map((p) => p.name)).toEqual(["Parc du Gué"]);
    expect(await searchPlaces()).toHaveLength(2);
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
