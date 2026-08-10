/**
 * Ce que ces tests garantissent : ce que la page d'information promet arrive vraiment.
 * Une présence passée disparaît, le journal ne devient pas une archive, et rien de tout
 * cela n'exige qu'un humain y pense.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  purgeAccessTokens,
  purgeAll,
  purgeAuditLog,
  purgeDeadSubscriptions,
} from "@/lib/maintenance";
import { requestMagicLink } from "@/lib/auth";
import { subscribe } from "@/lib/notifications";
import {
  createAccount,
  createCircle,
  createPlace,
  declarePresence,
  minutesFromNow,
  resetDatabase,
} from "@/test/helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("Rétention", () => {
  it("efface les présences expirées et les activités anciennes", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice);
    const parc = await createPlace();

    await declarePresence({
      author: alice,
      place: parc,
      circles: [classe],
      startsAt: minutesFromNow(-60 * 32),
      endsAt: minutesFromNow(-60 * 30),
    });
    await declarePresence({ author: alice, place: parc, circles: [classe] });

    const rapport = await purgeAll();

    expect(rapport.presencesExpirees).toBe(1);
    const restantes = await db.execute(sql`select id from publication`);
    expect(restantes).toHaveLength(1);
  });

  it("le journal d'audit ne devient pas une archive", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice);

    await recordAudit(db, { action: "cercle.role.change", actorId: alice.id, circleId: classe.id });
    await db.execute(sql`update audit_log set at = now() - interval '13 months'`);
    await recordAudit(db, { action: "cercle.membre.exclu", actorId: alice.id, circleId: classe.id });

    expect(await purgeAuditLog()).toBe(1);

    const restant = await db.execute<{ action: string }>(sql`select action from audit_log`);
    expect(restant.map((r) => r.action)).toEqual(["cercle.membre.exclu"]);
  });

  it("efface les liens de connexion utilisés et les sessions périmées", async () => {
    await requestMagicLink("sophie@example.test");

    const rapport = await purgeAccessTokens();

    // Le lien est encore valable et non utilisé : il reste.
    expect(rapport.links).toBe(0);

    await db.execute(sql`update magic_link set used_at = now()`);
    expect((await purgeAccessTokens()).links).toBe(1);
  });

  it("efface les abonnements push définitivement muets", async () => {
    const alice = await createAccount("Alice");
    await subscribe(alice.id, {
      endpoint: "https://push.test/mort",
      keys: { p256dh: "cle", auth: "secret" },
    });
    await db.execute(sql`update push_subscription set failed_at = now() - interval '40 days'`);

    expect(await purgeDeadSubscriptions()).toBe(1);
  });

  it("ne touche à rien quand il n'y a rien à effacer", async () => {
    expect(await purgeAll()).toEqual({
      presencesExpirees: 0,
      activitesPassees: 0,
      journalAudit: 0,
      liensDeConnexion: 0,
      sessions: 0,
      abonnementsMorts: 0,
    });
  });
});
