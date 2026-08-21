/**
 * Ce que ces tests garantissent : suivre un lien d'invitation ne fait entrer personne,
 * seul un administrateur fait entrer quelqu'un, et un cercle n'est jamais sans administrateur.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/lib/audit";
import {
  DUREE_INVITATION_JOURS,
  DUREE_INVITATION_MAX_JOURS,
  USAGES_INVITATION_MAX,
  approveJoin,
  createCircle,
  circleNameForInvite,
  createInvite,
  cutLink,
  leaveCircle,
  listPendingRequests,
  rejectJoin,
  removeMember,
  coparentCircles,
  requestJoin,
  requestJoinAsCoparent,
  restoreLink,
  revokeInvite,
  setRole,
  setCircleAlias,
} from "@/lib/circles";
import { acceptCoparent, inviteCoparent } from "@/lib/children";
import { db } from "@/lib/db";
import { prefsParCercle } from "@/lib/notifications";
import {
  isActiveMember,
  isCircleAdmin,
  readerCircles,
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

describe("Portée d'une invitation", () => {
  it("retient le nombre de familles et la durée annoncés", async () => {
    const alice = await createAccount("Alice");
    const cercle = await createCircle(alice.id, "Classe 4P");
    if (!cercle.ok) return;

    const invite = await createInvite(alice.id, cercle.value.id, { maxUses: 8, days: 3 });
    expect(invite.ok).toBe(true);
    if (!invite.ok) return;

    expect(invite.value.invite.maxUses).toBe(8);
    const jours = (invite.value.invite.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(jours)).toBe(3);
  });

  it("par défaut, une semaine", async () => {
    const alice = await createAccount("Alice");
    const cercle = await createCircle(alice.id, "Classe 4P");
    if (!cercle.ok) return;

    const invite = await createInvite(alice.id, cercle.value.id);
    if (!invite.ok) return;

    const jours = (invite.value.invite.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(jours)).toBe(DUREE_INVITATION_JOURS);
  });

  it("borne les valeurs extravagantes sans faire échouer la demande", async () => {
    // Une action serveur est joignable par une requête directe : les bornes de l'écran ne
    // protègent rien, celles-ci si.
    const alice = await createAccount("Alice");
    const cercle = await createCircle(alice.id, "Classe 4P");
    if (!cercle.ok) return;

    const enorme = await createInvite(alice.id, cercle.value.id, {
      maxUses: 100_000,
      days: 3_650,
    });
    if (!enorme.ok) return;
    expect(enorme.value.invite.maxUses).toBe(USAGES_INVITATION_MAX);
    const jours = (enorme.value.invite.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(jours)).toBe(DUREE_INVITATION_MAX_JOURS);

    const negatif = await createInvite(alice.id, cercle.value.id, { maxUses: -5, days: -5 });
    if (!negatif.ok) return;
    expect(negatif.value.invite.maxUses).toBe(1);
  });
});

describe("Le nom du cercle derrière une invitation", () => {
  /*
    Ce que l'écran d'arrivée peut dire avant qu'on ait donné son adresse électronique.

    Le nom se lit avec un jeton valable, et rien ne se lit avec les quatre formes
    d'invalidité. C'est le « rien » qui compte : si l'un des quatre répondait autrement que
    les trois autres, essayer des jetons au hasard apprendrait lesquels ont déjà servi.
  */
  it("se lit avec un jeton valable", async () => {
    const alice = await createAccount("Alice");
    const cercle = await createCircle(alice.id, "Classe de Jules");
    if (!cercle.ok) throw new Error("le cercle devait être créé");
    const invite = await createInvite(alice.id, cercle.value.id);
    if (!invite.ok) throw new Error("l'invitation devait être créée");

    expect(await circleNameForInvite(invite.value.token)).toBe("Classe de Jules");
  });

  it("ne se lit pas avec un jeton révoqué, expiré, épuisé ou inventé", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice);

    const revoque = await createInvite(alice.id, circleId);
    if (!revoque.ok) throw new Error("l'invitation devait être créée");
    await revokeInvite(alice.id, revoque.value.invite.id);

    const epuise = await createInvite(alice.id, circleId, { maxUses: 1 });
    if (!epuise.ok) throw new Error("l'invitation devait être créée");
    expect((await requestJoin(bob.id, epuise.value.token)).ok).toBe(true);

    const expire = await createInvite(alice.id, circleId);
    if (!expire.ok) throw new Error("l'invitation devait être créée");
    await db.execute(
      sql`update circle_invite set expires_at = now() - interval '1 second'
          where id = ${expire.value.invite.id}`,
    );

    // Témoin : une quatrième invitation, intacte, doit continuer de se lire. Sans elle, un
    // `circleNameForInvite` qui rendrait toujours null passerait ce test sans rien prouver.
    const intacte = await createInvite(alice.id, circleId);
    if (!intacte.ok) throw new Error("l'invitation devait être créée");

    expect(await circleNameForInvite(revoque.value.token)).toBeNull();
    expect(await circleNameForInvite(epuise.value.token)).toBeNull();
    expect(await circleNameForInvite(expire.value.token)).toBeNull();
    expect(await circleNameForInvite("jeton-invente")).toBeNull();
    expect(await circleNameForInvite(intacte.value.token)).not.toBeNull();
  });

  it("rend le nom d'origine, jamais l'alias que quelqu'un s'est donné", async () => {
    const alice = await createAccount("Alice");
    const cercle = await createCircle(alice.id, "Classe 4P");
    if (!cercle.ok) throw new Error("le cercle devait être créé");
    await setCircleAlias(alice.id, cercle.value.id, "Classe de Jules");
    const invite = await createInvite(alice.id, cercle.value.id);
    if (!invite.ok) throw new Error("l'invitation devait être créée");

    // L'alias appartient à celui qui l'a posé : il n'a rien à faire chez quelqu'un qui
    // n'est pas encore entré, et qui entendra les autres parler de « Classe 4P ».
    expect(await circleNameForInvite(invite.value.token)).toBe("Classe 4P");
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

describe("Le nom d'un cercle, chez chacun", () => {
  /** Fait entrer quelqu'un, comme les autres tests de ce fichier. */
  async function faireEntrer(admin: Account, membre: Account, circleId: string) {
    await requestJoin(membre.id, await unLien(admin, circleId));
    const attente = await listPendingRequests(admin.id, circleId);
    if (!attente.ok) throw new Error(attente.reason);
    await approveJoin(admin.id, attente.value[0].id);
  }

  it("chacun voit le nom qu'il a posé", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice, "Classe 4P");
    await faireEntrer(alice, bob, circleId);

    await setCircleAlias(bob.id, circleId, "Classe de Jules");

    expect((await readerCircles(bob.id))[0].name).toBe("Classe de Jules");
    // Celui d'à côté ne voit rien de ce changement.
    expect((await readerCircles(alice.id))[0].name).toBe("Classe 4P");
  });

  it("efface l'alias quand il redit le nom d'origine", async () => {
    const alice = await createAccount("Alice");
    const circleId = await unCercle(alice, "Classe 4P");

    await setCircleAlias(alice.id, circleId, "  Classe 4P  ");

    // Sans cet effacement, un renommage ultérieur laisserait une copie figée de l'ancien nom.
    const rows = await db.execute<{ alias: string | null }>(
      sql`select alias from circle_membership`,
    );
    expect(rows[0].alias).toBeNull();
  });

  it("revient au nom du cercle quand on vide le champ", async () => {
    const alice = await createAccount("Alice");
    const circleId = await unCercle(alice, "Classe 4P");

    await setCircleAlias(alice.id, circleId, "Chez nous");
    await setCircleAlias(alice.id, circleId, "");

    expect((await readerCircles(alice.id))[0].name).toBe("Classe 4P");
  });

  it("refuse à qui n'est pas membre", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice, "Classe 4P");

    expect(await setCircleAlias(bob.id, circleId, "Chez moi")).toEqual({
      ok: false,
      reason: "pas_membre",
    });
  });

  it("porte aussi sur ce que la notification annonce", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const circleId = await unCercle(alice, "Classe 4P");
    await faireEntrer(alice, bob, circleId);

    await setCircleAlias(bob.id, circleId, "Classe de Jules");

    // Le titre d'une notification est un nom de cercle : celui de qui la reçoit.
    const prefs = await prefsParCercle(bob.id);
    expect(prefs[0].circleName).toBe("Classe de Jules");
  });
});

describe("Les cercles de l'autre parent", () => {
  async function deuxParentsLies() {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const { token } = await inviteCoparent(alice.id);
    await acceptCoparent(bob.id, token);
    return { alice, bob };
  }

  it("propose les cercles où l'autre parent est, et pas moi", async () => {
    const { alice, bob } = await deuxParentsLies();
    const classe = await unCercle(alice, "Classe 4P");
    const voisinage = await unCercle(bob, "Voisinage");

    expect(await coparentCircles(bob.id)).toEqual([
      { circleId: classe, circleName: "Classe 4P", coparentName: "Alice", demandee: false },
    ]);
    expect(await coparentCircles(alice.id)).toEqual([
      { circleId: voisinage, circleName: "Voisinage", coparentName: "Bob", demandee: false },
    ]);
  });

  it("ne propose rien à qui n'a pas de co-parent", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    await unCercle(alice, "Classe 4P");

    expect(await coparentCircles(bob.id)).toEqual([]);
  });

  it("demander dépose une demande, et ne fait entrer personne", async () => {
    const { alice, bob } = await deuxParentsLies();
    const classe = await unCercle(alice, "Classe 4P");

    const result = await requestJoinAsCoparent(bob.id, classe);

    expect(result.ok).toBe(true);
    expect(await isActiveMember(bob.id, classe)).toBe(false);
    const attente = await listPendingRequests(alice.id, classe);
    expect(attente.ok && attente.value.map((d) => d.displayName)).toEqual(["Bob"]);
    expect((await coparentCircles(bob.id))[0].demandee).toBe(true);
  });

  it("demander deux fois ne dépose qu'une demande", async () => {
    const { alice, bob } = await deuxParentsLies();
    const classe = await unCercle(alice, "Classe 4P");

    await requestJoinAsCoparent(bob.id, classe);
    await requestJoinAsCoparent(bob.id, classe);

    const attente = await listPendingRequests(alice.id, classe);
    expect(attente.ok && attente.value).toHaveLength(1);
  });

  it("sans lien de co-parent, le cercle reste inconnu", async () => {
    const alice = await createAccount("Alice");
    const carla = await createAccount("Carla");
    const classe = await unCercle(alice, "Classe 4P");

    expect(await requestJoinAsCoparent(carla.id, classe)).toEqual({
      ok: false,
      reason: "cercle_inconnu",
    });
  });
});
