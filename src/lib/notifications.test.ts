/**
 * Ce que ces tests garantissent : on n'est jamais notifié de ce qu'on ne verrait pas, et
 * le contenu envoyé ne raconte rien sur un écran verrouillé.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  muteMember,
  notifyPublication,
  pauseCircle,
  payloadFor,
  recipientsFor,
  setPrefs,
  subscribe,
  unmuteMember,
  type PushPayload,
  type Sender,
} from "@/lib/notifications";
import {
  createAccount,
  createCircle,
  createPlace,
  cutLink,
  declarePresence,
  join,
  leave,
  minutesFromNow,
  resetDatabase,
  type Account,
} from "@/test/helpers";

/** Expéditeur de test : n'envoie rien, enregistre tout. */
function expediteur() {
  const envois: { accountId: string; payload: PushPayload }[] = [];
  const send: Sender = async (target, payload) => {
    envois.push({ accountId: target.accountId, payload });
  };
  return { envois, send };
}

async function abonner(account: Account): Promise<void> {
  await subscribe(account.id, {
    endpoint: `https://push.test/${account.id}`,
    keys: { p256dh: "cle-publique", auth: "secret" },
  });
}

beforeEach(async () => {
  await resetDatabase();
});

describe("Destinataires", () => {
  it("les membres du cercle, sauf l'auteur", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });

    expect((await recipientsFor(presence.id)).map((r) => r.accountId)).toEqual([bob.id]);
  });

  it("personne en dehors du cercle", async () => {
    const alice = await createAccount("Alice");
    const inconnu = await createAccount("Inconnu");
    const classe = await createCircle(alice);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });

    expect(await recipientsFor(presence.id)).toEqual([]);
    expect(inconnu.id).toBeTruthy();
  });

  it("personne dont le lien est coupé — comme à l'écran", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    await cutLink(classe, alice, bob, bob);
    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });

    expect(await recipientsFor(presence.id)).toEqual([]);
  });

  it("personne exclue ponctuellement de la publication", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carla = await createAccount("Carla");
    const classe = await createCircle(alice);
    await join(classe, bob);
    await join(classe, carla);
    const parc = await createPlace();

    const presence = await declarePresence({
      author: alice,
      place: parc,
      circles: [classe],
      hiddenFrom: [bob],
    });

    expect((await recipientsFor(presence.id)).map((r) => r.accountId)).toEqual([carla.id]);
  });

  it("personne partie du cercle entre-temps", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    await leave(classe, bob);

    expect(await recipientsFor(presence.id)).toEqual([]);
  });

  it("aucune notification pour une publication déjà expirée", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({
      author: alice,
      place: parc,
      circles: [classe],
      startsAt: minutesFromNow(-120),
      endsAt: minutesFromNow(-1),
    });

    expect(await recipientsFor(presence.id)).toEqual([]);
  });
});

describe("Réglages", () => {
  async function deuxMembres() {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();
    return { alice, bob, classe, parc };
  }

  it("on peut couper les présences d'un cercle sans couper les inscriptions", async () => {
    const { alice, bob, classe, parc } = await deuxMembres();
    await setPrefs(bob.id, classe.id, { onPresence: false });

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect(await recipientsFor(presence.id)).toEqual([]);

    await setPrefs(bob.id, classe.id, { onPresence: true, onAttendance: false });
    const seconde = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect((await recipientsFor(seconde.id)).map((r) => r.accountId)).toEqual([bob.id]);
  });

  it("une pause temporaire suspend puis se lève d'elle-même", async () => {
    const { alice, bob, classe, parc } = await deuxMembres();

    await pauseCircle(bob.id, classe.id, 3);
    const pendant = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect(await recipientsFor(pendant.id)).toEqual([]);

    await pauseCircle(bob.id, classe.id, 0);
    const apres = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect((await recipientsFor(apres.id)).map((r) => r.accountId)).toEqual([bob.id]);
  });

  it("mettre une personne en sourdine ne la fait pas disparaître de l'écran", async () => {
    const { alice, bob, classe, parc } = await deuxMembres();
    await muteMember(bob.id, classe.id, alice.id);

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });

    // Plus de notification…
    expect(await recipientsFor(presence.id)).toEqual([]);
    // …mais la sortie reste visible dans l'application.
    const { canSeePublication } = await import("@/lib/visibility");
    expect(await canSeePublication(bob.id, presence.id)).toBe(true);

    await unmuteMember(bob.id, classe.id, alice.id);
    const seconde = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect((await recipientsFor(seconde.id)).map((r) => r.accountId)).toEqual([bob.id]);
  });
});

describe("Envoi", () => {
  it("ne dit ni qui ni où", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    await join(classe, bob);
    const parc = await createPlace("Parc du Gué");
    await abonner(bob);

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    const { envois, send } = expediteur();
    const rapport = await notifyPublication(presence.id, send);

    expect(rapport).toEqual({ sent: 1, failed: 0, recipients: 1 });
    const texte = JSON.stringify(envois[0].payload);
    expect(texte).not.toContain("Alice");
    expect(texte).not.toContain("Parc du Gué");
    expect(envois[0].payload.title).toBe("Classe 4P");
  });

  it("ne prévient qu'une fois une personne présente dans deux cercles destinataires", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    const voisinage = await createCircle(alice, "Voisinage");
    await join(classe, bob);
    await join(voisinage, bob);
    const parc = await createPlace();
    await abonner(bob);

    const presence = await declarePresence({
      author: alice,
      place: parc,
      circles: [classe, voisinage],
    });

    const { envois, send } = expediteur();
    await notifyPublication(presence.id, send);

    expect(envois).toHaveLength(1);
  });

  it("écarte un abonnement mort au lieu de le réessayer", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();
    await abonner(bob);

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    const casse: Sender = async () => {
      throw new Error("410 Gone");
    };

    expect(await notifyPublication(presence.id, casse)).toEqual({
      sent: 0,
      failed: 1,
      recipients: 1,
    });

    // Deuxième sortie : l'abonnement mort n'est plus sollicité.
    const seconde = await declarePresence({ author: alice, place: parc, circles: [classe] });
    const { envois, send } = expediteur();
    const rapport = await notifyPublication(seconde.id, send);

    expect(envois).toHaveLength(0);
    expect(rapport.failed).toBe(0);
  });

  it("le texte diffère selon la nature du signal", () => {
    expect(payloadFor("presence", "Classe 4P").body).toContain("sortie");
    expect(payloadFor("attendance", "Classe 4P").body).toContain("inscription");
  });
});
