/**
 * Ce que ces tests garantissent : les nombres comptent les familles qui existent, et rien
 * d'autre.
 *
 * Trois vérifications pour trois nombres, ce qui est le bon rapport. Un écran de mesure se
 * met à grossir dès qu'on le laisse faire, et ce qui s'y ajoute finit toujours par regarder
 * quelqu'un.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { mesures } from "@/lib/mesures";
import {
  createAccount,
  createChild,
  deleteAccount as supprimerCompte,
  resetDatabase,
} from "@/test/helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("Les familles, en trois nombres", () => {
  it("compte les comptes, et ceux qui ont déclaré un enfant", async () => {
    const alice = await createAccount("Alice");
    await createAccount("Bob");
    await createChild(alice, "Léa");

    const m = await mesures();

    expect(m.comptes).toBe(2);
    // L'écart entre les deux est le seul endroit où une arrivée interrompue se voit.
    expect(m.comptesAvecEnfant).toBe(1);
  });

  it("ne compte pas un compte supprimé", async () => {
    const alice = await createAccount("Alice");
    await createAccount("Bob");
    await supprimerCompte(alice);

    expect((await mesures()).comptes).toBe(1);
  });

  it("compte comme nouvelle une famille arrivée cette semaine", async () => {
    await createAccount("Alice");

    expect((await mesures()).comptesNouveaux7j).toBe(1);
  });
});
