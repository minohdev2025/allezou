/**
 * Ce que ces tests garantissent : la phrase « vous pouvez supprimer votre compte, ce qui
 * efface vos données » de la page d'information est vraie.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { deleteAccount } from "@/lib/account";
import { addChild, inviteCoparent, acceptCoparent, myChildren } from "@/lib/children";
import { db } from "@/lib/db";
import { joinPresence } from "@/lib/publications";
import { isCircleAdmin, visibleCircleMembers, visiblePublications } from "@/lib/visibility";
import {
  createAccount,
  createCircle,
  createPlace,
  declarePresence,
  join,
  resetDatabase,
} from "@/test/helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("Supprimer son compte", () => {
  it("efface les sorties, l'adresse et le nom affiché", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();
    await declarePresence({ author: alice, place: parc, circles: [classe] });

    const rapport = await deleteAccount(alice.id);

    expect(rapport.sortiesEffacees).toBe(1);
    expect(await visiblePublications(bob.id)).toEqual([]);

    const [compte] = await db.execute<{ email: string; display_name: string }>(
      sql`select email, display_name from account where id = ${alice.id}`,
    );
    expect(compte.email).not.toContain("@example.test");
    expect(compte.display_name).toBe("Compte supprimé");
  });

  it("retire la personne des cercles et laisse un administrateur derrière elle", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    await deleteAccount(alice.id);

    expect(await isCircleAdmin(bob.id, classe.id)).toBe(true);
    expect((await visibleCircleMembers(bob.id, classe.id)).map((m) => m.displayName)).toEqual([
      "Bob",
    ]);
  });

  it("disparaît de la liste des participants d'une sortie qu'elle avait rejointe", async () => {
    const maman = await createAccount("Maman de Matéo");
    const sarah = await createAccount("Sarah");
    const classe = await createCircle(maman);
    await join(classe, sarah);
    const parc = await createPlace();
    const sortie = await declarePresence({ author: maman, place: parc, circles: [classe] });
    await joinPresence(sarah.id, sortie.id);

    await deleteAccount(sarah.id);

    const [vue] = await visiblePublications(maman.id);
    expect(vue.otherParticipants).toBe(0);
  });

  it("efface la fiche d'un enfant dont elle était le seul parent", async () => {
    const alice = await createAccount("Alice");
    const enfant = await addChild(alice.id, { firstName: "Matéo" });
    if (!enfant.ok) return;

    const rapport = await deleteAccount(alice.id);

    expect(rapport.enfantsDetaches).toBe(1);
    const [fiche] = await db.execute<{ deleted_at: Date | null }>(
      sql`select deleted_at from child where id = ${enfant.value.id}`,
    );
    expect(fiche.deleted_at).not.toBeNull();
  });

  it("laisse l'enfant à l'autre parent", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    await addChild(alice.id, { firstName: "Matéo" });
    const { token } = await inviteCoparent(alice.id);
    await acceptCoparent(bob.id, token);

    await deleteAccount(alice.id);

    expect((await myChildren(bob.id)).map((c) => c.firstName)).toEqual(["Matéo"]);
  });

  it("efface les sessions, les appareils et les réglages", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice);
    const { subscribe, setPrefs } = await import("@/lib/notifications");
    await subscribe(alice.id, {
      endpoint: "https://push.test/alice",
      keys: { p256dh: "cle", auth: "secret" },
    });
    await setPrefs(alice.id, classe.id, { onPresence: false });

    await deleteAccount(alice.id);

    for (const table of ["push_subscription", "session", "notification_pref"]) {
      const rows = await db.execute(
        sql`select 1 from ${sql.identifier(table)} where account_id = ${alice.id}`,
      );
      expect(rows, `${table} doit être vide`).toHaveLength(0);
    }
  });

  it("garde la trace des actes dans le journal, sans les personnes", async () => {
    const { createCircle: creerCercle } = await import("@/lib/circles");
    const alice = await createAccount("Alice");
    await creerCercle(alice.id, "Classe 4P");

    await deleteAccount(alice.id);

    const journal = await db.execute<{ action: string; actor_id: string | null }>(
      sql`select action, actor_id from audit_log order by at asc`,
    );
    expect(journal.map((r) => r.action)).toContain("cercle.cree");
    expect(journal.every((r) => r.actor_id === null)).toBe(true);
  });
});
