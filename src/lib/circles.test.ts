/**
 * Ce que ces tests garantissent : suivre un lien d'invitation ne fait entrer personne,
 * seul un administrateur fait entrer quelqu'un, et un cercle n'est jamais sans administrateur.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/lib/audit";
import {
  approveJoin,
  createCircle,
  createInvite,
  cutLink,
  leaveCircle,
  listPendingRequests,
  rejectJoin,
  removeMember,
  requestJoin,
  restoreLink,
  revokeInvite,
  setRole,
} from "@/lib/circles";
import { db } from "@/lib/db";
import {
  isActiveMember,
  isCircleAdmin,
  visibleCircleMembers,
  visiblePublications,
} from "@/lib/visibility";
import {
  createAccount,
  createPlace,
  declarePresence,
  resetDatabase,
  type Account,
} from "@/test/helpers";

/** Raccourci : crée un cercle et renvoie son identifiant. */
async function unCercle(admin: Account, nom = "Classe 4P"): Promise<string> {
  const result = await createCircle(admin.id, nom);
  if (!result.ok) throw new Error(result.reason);
  return result.value.id;
}

async function unLien(membre: Account, circleId: string, options = {}): Promise<string> {
  const result = await createInvite(membre.id, circleId, options);
  if (!result.ok) throw new Error(result.reason);
  return result.value.token;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("Création d'un cercle", () => {
  it("le créateur en est administrateur", async () => {
    const alice = await createAccount("Alice");
    const circleId = await unCercle(alice);

    expect(await isCircleAdmin(alice.id, circleId)).toBe(true);
  });

  it("refuse un nom vide", async () => {
    const alice = await createAccount("Alice");
    expect(await createCircle(alice.id, "   ")).toEqual({ ok: false, reason: "nom_invalide" });
  });
});

describe("Le lien d'invitation ne fait entrer personne", () => {
  it("le suivre dépose une demande, et rien n'est encore visible", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);
    const parc = await createPlace();

    const presence = await declarePresence({
      author: alice,
      place: parc,
      circles: [{ id: circleId } as never],
    });

    const token = await unLien(alice, circleId);
    const demande = await requestJoin(bob.id, token);

    expect(demande.ok).toBe(true);
    expect(await isActiveMember(bob.id, circleId)).toBe(false);
    expect(await visiblePublications(bob.id)).toEqual([]);
    expect(await visibleCircleMembers(bob.id, circleId)).toEqual([]);
    expect(presence.id).toBeTruthy();
  });

  it("l'administrateur accepte, et seulement alors la personne entre", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);

    await requestJoin(bob.id, await unLien(alice, circleId));
    const attente = await listPendingRequests(alice.id, circleId);
    expect(attente.ok).toBe(true);
    if (!attente.ok) return;
    expect(attente.value.map((r) => r.displayName)).toEqual(["Bob"]);

    expect(await approveJoin(alice.id, attente.value[0].id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await isActiveMember(bob.id, circleId)).toBe(true);
  });

  it("un refus ne fait entrer personne", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);

    await requestJoin(bob.id, await unLien(alice, circleId));
    const attente = await listPendingRequests(alice.id, circleId);
    if (!attente.ok) return;

    await rejectJoin(alice.id, attente.value[0].id);
    expect(await isActiveMember(bob.id, circleId)).toBe(false);
  });

  it("un membre ordinaire ne peut ni voir ni accepter les demandes", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carla = await createAccount("Carla");
    const circleId = await unCercle(alice);

    await requestJoin(bob.id, await unLien(alice, circleId));
    const attente = await listPendingRequests(alice.id, circleId);
    if (!attente.ok) return;
    await approveJoin(alice.id, attente.value[0].id);

    // Bob est membre, mais pas administrateur.
    await requestJoin(carla.id, await unLien(bob, circleId));
    const vueDeBob = await listPendingRequests(bob.id, circleId);
    expect(vueDeBob).toEqual({ ok: false, reason: "pas_admin" });

    const attente2 = await listPendingRequests(alice.id, circleId);
    if (!attente2.ok) return;
    expect(await approveJoin(bob.id, attente2.value[0].id)).toEqual({
      ok: false,
      reason: "pas_admin",
    });
  });

  it("n'importe quel membre peut proposer quelqu'un", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);

    await requestJoin(bob.id, await unLien(alice, circleId));
    const attente = await listPendingRequests(alice.id, circleId);
    if (!attente.ok) return;
    await approveJoin(alice.id, attente.value[0].id);

    expect((await createInvite(bob.id, circleId)).ok).toBe(true);
  });

  it("un non-membre ne peut pas créer de lien", async () => {
    const alice = await createAccount("Alice");
    const inconnu = await createAccount("Inconnu");
    const circleId = await unCercle(alice);

    expect(await createInvite(inconnu.id, circleId)).toEqual({
      ok: false,
      reason: "pas_membre",
    });
  });
});

describe("Limites du lien d'invitation", () => {
  it("un lien révoqué ne fonctionne plus", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);

    const invite = await createInvite(alice.id, circleId);
    if (!invite.ok) return;
    await revokeInvite(alice.id, invite.value.invite.id);

    expect(await requestJoin(bob.id, invite.value.token)).toEqual({
      ok: false,
      reason: "invitation_revoquee",
    });
  });

  it("un lien expiré ne fonctionne plus", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);
    const token = await unLien(alice, circleId);

    await db.execute(sql`update circle_invite set expires_at = now() - interval '1 second'`);

    expect(await requestJoin(bob.id, token)).toEqual({
      ok: false,
      reason: "invitation_expiree",
    });
  });

  it("un lien à usage unique s'épuise après une personne", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carla = await createAccount("Carla");
    const circleId = await unCercle(alice);
    const token = await unLien(alice, circleId, { maxUses: 1 });

    expect((await requestJoin(bob.id, token)).ok).toBe(true);
    expect(await requestJoin(carla.id, token)).toEqual({
      ok: false,
      reason: "invitation_epuisee",
    });
  });

  it("cliquer deux fois sur le même lien ne consomme qu'un usage", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carla = await createAccount("Carla");
    const circleId = await unCercle(alice);
    const token = await unLien(alice, circleId, { maxUses: 2 });

    await requestJoin(bob.id, token);
    await requestJoin(bob.id, token);

    expect((await requestJoin(carla.id, token)).ok).toBe(true);
  });

  it("un jeton inventé ne fonctionne pas", async () => {
    const bob = await createAccount("Bob");
    expect(await requestJoin(bob.id, "jeton-invente")).toEqual({
      ok: false,
      reason: "invitation_inconnue",
    });
  });

  it("un membre déjà dans le cercle est éconduit sans consommer d'usage", async () => {
    const alice = await createAccount("Alice");
    const circleId = await unCercle(alice);
    const token = await unLien(alice, circleId, { maxUses: 1 });

    expect(await requestJoin(alice.id, token)).toEqual({ ok: false, reason: "deja_membre" });

    const bob = await createAccount("Bob");
    expect((await requestJoin(bob.id, token)).ok).toBe(true);
  });
});

describe("Départs, exclusions et rôles", () => {
  async function cercleAvecDeuxMembres() {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);
    await requestJoin(bob.id, await unLien(alice, circleId));
    const attente = await listPendingRequests(alice.id, circleId);
    if (!attente.ok) throw new Error("demande introuvable");
    await approveJoin(alice.id, attente.value[0].id);
    return { alice, bob, circleId };
  }

  it("un administrateur peut exclure un membre", async () => {
    const { alice, bob, circleId } = await cercleAvecDeuxMembres();

    expect(await removeMember(alice.id, circleId, bob.id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await isActiveMember(bob.id, circleId)).toBe(false);
  });

  it("un membre ordinaire ne peut exclure personne", async () => {
    const { alice, bob, circleId } = await cercleAvecDeuxMembres();

    expect(await removeMember(bob.id, circleId, alice.id)).toEqual({
      ok: false,
      reason: "pas_admin",
    });
    expect(await isActiveMember(alice.id, circleId)).toBe(true);
  });

  it("on ne s'exclut pas soi-même : on quitte", async () => {
    const { alice, circleId } = await cercleAvecDeuxMembres();

    expect(await removeMember(alice.id, circleId, alice.id)).toEqual({
      ok: false,
      reason: "action_sur_soi",
    });
    expect((await leaveCircle(alice.id, circleId)).ok).toBe(true);
  });

  it("quand le dernier administrateur part, le membre le plus ancien lui succède", async () => {
    const { alice, bob, circleId } = await cercleAvecDeuxMembres();
    expect(await isCircleAdmin(bob.id, circleId)).toBe(false);

    await leaveCircle(alice.id, circleId);

    expect(await isCircleAdmin(bob.id, circleId)).toBe(true);
  });

  it("le dernier administrateur ne peut pas laisser le cercle sans administrateur", async () => {
    const { alice, bob, circleId } = await cercleAvecDeuxMembres();

    await setRole(alice.id, circleId, alice.id, "member");

    // Alice renonce, Bob prend le relais : il reste toujours quelqu'un pour révoquer.
    expect(await isCircleAdmin(alice.id, circleId)).toBe(false);
    expect(await isCircleAdmin(bob.id, circleId)).toBe(true);
  });

  it("un cercle vidé de ses membres est archivé", async () => {
    const alice = await createAccount("Alice");
    const circleId = await unCercle(alice);

    await leaveCircle(alice.id, circleId);

    const rows = await db.execute<{ archived_at: Date | null }>(
      sql`select archived_at from circle where id = ${circleId}`,
    );
    expect(rows[0].archived_at).not.toBeNull();
  });

  it("quitter un cercle dont on n'est pas membre échoue", async () => {
    const alice = await createAccount("Alice");
    const inconnu = await createAccount("Inconnu");
    const circleId = await unCercle(alice);

    expect(await leaveCircle(inconnu.id, circleId)).toEqual({
      ok: false,
      reason: "pas_membre",
    });
  });
});

describe("Couper et rétablir un lien", () => {
  it("se coupe et se rétablit, et n'est possible qu'entre membres", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const inconnu = await createAccount("Inconnu");
    const circleId = await unCercle(alice);
    await requestJoin(bob.id, await unLien(alice, circleId));
    const attente = await listPendingRequests(alice.id, circleId);
    if (!attente.ok) return;
    await approveJoin(alice.id, attente.value[0].id);

    expect(await cutLink(alice.id, circleId, inconnu.id)).toEqual({
      ok: false,
      reason: "cible_inconnue",
    });
    expect(await cutLink(inconnu.id, circleId, alice.id)).toEqual({
      ok: false,
      reason: "pas_membre",
    });

    expect((await cutLink(alice.id, circleId, bob.id)).ok).toBe(true);
    const apresCoupure = await visibleCircleMembers(bob.id, circleId);
    expect(apresCoupure.find((m) => m.displayName === "Alice")?.linkCut).toBe(true);

    expect((await restoreLink(bob.id, circleId, alice.id)).ok).toBe(true);
    const apresRetablissement = await visibleCircleMembers(bob.id, circleId);
    expect(apresRetablissement.find((m) => m.displayName === "Alice")?.linkCut).toBe(false);
  });

  it("couper deux fois ne provoque pas d'erreur", async () => {
    const { alice, bob, circleId } = await (async () => {
      const alice = await createAccount("Alice");
      const bob = await createAccount("Bob");
      const circleId = await unCercle(alice);
      await requestJoin(bob.id, await unLien(alice, circleId));
      const attente = await listPendingRequests(alice.id, circleId);
      if (!attente.ok) throw new Error("demande introuvable");
      await approveJoin(alice.id, attente.value[0].id);
      return { alice, bob, circleId };
    })();

    expect((await cutLink(alice.id, circleId, bob.id)).ok).toBe(true);
    expect((await cutLink(bob.id, circleId, alice.id)).ok).toBe(true);
  });
});

describe("Le journal d'audit", () => {
  it("n'enregistre aucune action touchant aux publications", () => {
    const interdits = ["publication", "presence", "présence", "sortie", "participation", "lieu"];
    for (const action of AUDIT_ACTIONS) {
      for (const mot of interdits) {
        expect(action, `l'action « ${action} » ne doit pas exister`).not.toContain(mot);
      }
    }
  });

  it("trace les entrées et sorties de cercle", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);
    await requestJoin(bob.id, await unLien(alice, circleId));
    const attente = await listPendingRequests(alice.id, circleId);
    if (!attente.ok) return;
    await approveJoin(alice.id, attente.value[0].id);
    await removeMember(alice.id, circleId, bob.id);

    const rows = await db.execute<{ action: string }>(
      sql`select action from audit_log where circle_id = ${circleId} order by at asc`,
    );
    expect(rows.map((r) => r.action)).toEqual([
      "cercle.cree",
      "cercle.invitation.creee",
      "cercle.demande.deposee",
      "cercle.demande.acceptee",
      "cercle.membre.exclu",
    ]);
  });

  it("ne trace pas les liens coupés entre personnes", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);
    await requestJoin(bob.id, await unLien(alice, circleId));
    const attente = await listPendingRequests(alice.id, circleId);
    if (!attente.ok) return;
    await approveJoin(alice.id, attente.value[0].id);

    const avant = await db.execute(sql`select count(*)::int as n from audit_log`);
    await cutLink(alice.id, circleId, bob.id);
    const apres = await db.execute(sql`select count(*)::int as n from audit_log`);

    expect(apres[0]).toEqual(avant[0]);
  });
});
