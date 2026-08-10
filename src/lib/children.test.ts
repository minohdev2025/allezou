/**
 * Ce que ces tests garantissent : un enfant n'est qu'un prénom, on ne devient co-parent que
 * par invitation, et retirer un enfant ne le retire pas à l'autre parent.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  acceptCoparent,
  addChild,
  inviteCoparent,
  isParentOf,
  myChildren,
  removeChild,
  renameChild,
  revokeCoparentInvite,
} from "@/lib/children";
import { db } from "@/lib/db";
import { createAccount, resetDatabase } from "@/test/helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("Déclarer un enfant", () => {
  it("un prénom, et rien d'autre", async () => {
    const alice = await createAccount("Alice");

    const result = await addChild(alice.id, { firstName: "Matéo" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.firstName).toBe("Matéo");

    // La table ne porte rien d'autre : ni nom, ni âge, ni genre, ni photo, ni école.
    // Les membres d'un cercle connaissent déjà les enfants dont il est question.
    const colonnes = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_name = 'child' order by column_name
    `);
    expect(colonnes.map((c) => c.column_name).sort()).toEqual([
      "created_at",
      "deleted_at",
      "first_name",
      "id",
    ]);
  });

  it("refuse un prénom vide", async () => {
    const alice = await createAccount("Alice");

    expect(await addChild(alice.id, { firstName: "  " })).toEqual({
      ok: false,
      reason: "prenom_invalide",
    });
  });

  it("se liste par prénom", async () => {
    const alice = await createAccount("Alice");
    await addChild(alice.id, { firstName: "Matéo" });
    await addChild(alice.id, { firstName: "Léa" });

    expect((await myChildren(alice.id)).map((c) => c.firstName)).toEqual(["Léa", "Matéo"]);
  });

  it("se renomme, mais seulement par son parent", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const enfant = await addChild(alice.id, { firstName: "Mateo" });
    if (!enfant.ok) return;

    expect(await renameChild(bob.id, enfant.value.id, "Autre")).toEqual({
      ok: false,
      reason: "pas_parent",
    });
    expect((await renameChild(alice.id, enfant.value.id, "Matéo")).ok).toBe(true);
    expect((await myChildren(alice.id))[0].firstName).toBe("Matéo");
  });
});

describe("Co-parents", () => {
  async function alicePuisInvitation() {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    await addChild(alice.id, { firstName: "Matéo" });
    await addChild(alice.id, { firstName: "Léa" });
    const { token } = await inviteCoparent(alice.id);
    return { alice, bob, token };
  }

  it("l'invitation rattache les mêmes enfants aux deux comptes", async () => {
    const { alice, bob, token } = await alicePuisInvitation();

    const result = await acceptCoparent(bob.id, token);

    expect(result).toEqual({ ok: true, value: { children: 2 } });
    expect((await myChildren(bob.id)).map((c) => c.firstName)).toEqual(["Léa", "Matéo"]);
    expect((await myChildren(alice.id)).map((c) => c.firstName)).toEqual(["Léa", "Matéo"]);
  });

  it("l'invitation ne sert qu'une fois", async () => {
    const { bob, token } = await alicePuisInvitation();
    const carla = await createAccount("Carla");

    await acceptCoparent(bob.id, token);

    expect(await acceptCoparent(carla.id, token)).toEqual({
      ok: false,
      reason: "invitation_utilisee",
    });
  });

  it("se révoque avant usage", async () => {
    const { alice, bob, token } = await alicePuisInvitation();

    await revokeCoparentInvite(alice.id);

    expect(await acceptCoparent(bob.id, token)).toEqual({
      ok: false,
      reason: "invitation_revoquee",
    });
  });

  it("expire", async () => {
    const { bob, token } = await alicePuisInvitation();
    await db.execute(sql`update coparent_invite set expires_at = now() - interval '1 second'`);

    expect(await acceptCoparent(bob.id, token)).toEqual({
      ok: false,
      reason: "invitation_expiree",
    });
  });

  it("on ne devient pas co-parent de soi-même", async () => {
    const { alice, token } = await alicePuisInvitation();

    expect(await acceptCoparent(alice.id, token)).toEqual({
      ok: false,
      reason: "invitation_a_soi",
    });
  });

  it("un jeton inventé ne rattache rien", async () => {
    const bob = await createAccount("Bob");
    expect(await acceptCoparent(bob.id, "invente")).toEqual({
      ok: false,
      reason: "invitation_inconnue",
    });
  });
});

describe("Retirer un enfant", () => {
  it("ne le retire pas à l'autre parent", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const enfant = await addChild(alice.id, { firstName: "Matéo" });
    if (!enfant.ok) return;
    const { token } = await inviteCoparent(alice.id);
    await acceptCoparent(bob.id, token);

    await removeChild(alice.id, enfant.value.id);

    expect(await myChildren(alice.id)).toEqual([]);
    expect((await myChildren(bob.id)).map((c) => c.firstName)).toEqual(["Matéo"]);
    expect(await isParentOf(bob.id, enfant.value.id)).toBe(true);
  });

  it("efface la fiche quand plus personne n'y est rattaché", async () => {
    const alice = await createAccount("Alice");
    const enfant = await addChild(alice.id, { firstName: "Matéo" });
    if (!enfant.ok) return;

    await removeChild(alice.id, enfant.value.id);

    const rows = await db.execute<{ deleted_at: Date | null }>(
      sql`select deleted_at from child where id = ${enfant.value.id}`,
    );
    expect(rows[0].deleted_at).not.toBeNull();
    expect(await isParentOf(alice.id, enfant.value.id)).toBe(false);
  });
});
