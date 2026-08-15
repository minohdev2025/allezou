/**
 * Ce que ces tests garantissent : on n'est jamais notifié de ce qu'on ne verrait pas, et
 * le contenu envoyé ne raconte rien sur un écran verrouillé.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  ajouterMotCle,
  mesMotsCles,
  muteMember,
  notifyJoinRequest,
  notifyNewlyPublished,
  notifyPublication,
  pauseCircle,
  payloadFor,
  recipientsFor,
  reglerAlerteInscription,
  retirerMotCle,
  setPrefs,
  subscribe,
  unmuteMember,
  type PushPayload,
  type Sender,
} from "@/lib/notifications";
import {
  createAccount,
  createCircle,
  createEvent,
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

  /*
    Une sortie adressée à deux cercles, un lien coupé dans un seul.

    Bob voit bien la sortie : il la reçoit par le voisinage, où rien n'est coupé. Mais le
    titre de la notification est un nom de cercle, et nommer la classe lui apprendrait
    qu'Alice y a publié — alors que dans la classe, précisément, elle ne veut plus rien
    partager avec lui. Une notification en dit toujours un peu, et ce peu doit venir du
    chemin par lequel on a le droit de voir.
  */
  it("nomme le cercle par lequel on voit, jamais celui où le lien est coupé", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    const voisinage = await createCircle(alice, "Voisinage");
    await join(classe, bob);
    await join(voisinage, bob);
    const parc = await createPlace();

    await cutLink(classe, alice, bob, bob);
    const presence = await declarePresence({
      author: alice,
      place: parc,
      circles: [classe, voisinage],
    });

    const destinataires = await recipientsFor(presence.id);

    expect(destinataires.map((r) => r.circleName)).toEqual(["Voisinage"]);
    expect(destinataires.map((r) => r.accountId)).toEqual([bob.id]);
  });

  it("ne nomme pas un cercle que l'auteur a quitté depuis", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    const voisinage = await createCircle(alice, "Voisinage");
    await join(classe, bob);
    await join(voisinage, bob);
    const parc = await createPlace();

    const presence = await declarePresence({
      author: alice,
      place: parc,
      circles: [classe, voisinage],
    });
    // Alice quitte la classe : la sortie n'y est plus visible, et son nom n'a donc plus à
    // titrer quoi que ce soit. Bob continue de la voir par le voisinage.
    await leave(classe, alice);

    const destinataires = await recipientsFor(presence.id);

    expect(destinataires.map((r) => r.circleName)).toEqual(["Voisinage"]);
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

describe("Demande d'entrée dans un cercle", () => {
  it("prévient les administrateurs, sans nommer le demandeur", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    await join(classe, bob, { role: "admin" });
    await abonner(alice);
    await abonner(bob);

    const { envois, send } = expediteur();
    const rapport = await notifyJoinRequest(classe.id, send);

    expect(rapport.recipients).toBe(2);
    expect(rapport.sent).toBe(2);
    expect(envois[0].payload.title).toBe("Classe 4P");
    expect(envois[0].payload.body).toBe("Quelqu'un demande à rejoindre ce cercle");
    expect(envois[0].payload.url).toBe(`/cercles/${classe.id}`);
  });

  it("ne prévient pas les simples membres", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    await join(classe, bob);
    await abonner(alice);
    await abonner(bob);

    const { envois, send } = expediteur();
    await notifyJoinRequest(classe.id, send);

    expect(envois.map((e) => e.accountId)).toEqual([alice.id]);
  });

  it("respecte la mise en pause du cercle", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice, "Classe 4P");
    await abonner(alice);
    await pauseCircle(alice.id, classe.id, 4);

    const { send } = expediteur();
    expect((await notifyJoinRequest(classe.id, send)).recipients).toBe(0);
  });

  it("prévient même quand les sorties sont coupées : ce n'est pas le même sujet", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice, "Classe 4P");
    await abonner(alice);
    await setPrefs(alice.id, classe.id, { onPresence: false, onAttendance: false });

    const { send } = expediteur();
    expect((await notifyJoinRequest(classe.id, send)).sent).toBe(1);
  });
});

describe("Mots-clés de l'agenda", () => {
  it("garde le mot tel qu'il a été tapé, et compare sans accents", async () => {
    const alice = await createAccount("Alice");
    await ajouterMotCle(alice.id, "  Théâtre  ");

    expect(await mesMotsCles(alice.id)).toEqual([{ word: "theatre", label: "Théâtre" }]);
  });

  it("refuse un mot trop court, qui remonterait tout", async () => {
    const alice = await createAccount("Alice");
    const result = await ajouterMotCle(alice.id, "à");

    expect(result).toEqual({ ok: false, reason: "mot_trop_court" });
    expect(await mesMotsCles(alice.id)).toEqual([]);
  });

  it("n'ajoute pas deux fois le même mot", async () => {
    const alice = await createAccount("Alice");
    await ajouterMotCle(alice.id, "piscine");
    await ajouterMotCle(alice.id, "PISCINE");

    expect(await mesMotsCles(alice.id)).toHaveLength(1);
  });

  it("s'arrête à dix mots", async () => {
    const alice = await createAccount("Alice");
    for (let i = 0; i < 10; i += 1) await ajouterMotCle(alice.id, `mot${i}${i}${i}`);

    expect(await ajouterMotCle(alice.id, "onzieme")).toEqual({
      ok: false,
      reason: "trop_de_mots",
    });
  });

  it("se retire", async () => {
    const alice = await createAccount("Alice");
    await ajouterMotCle(alice.id, "judo");
    await retirerMotCle(alice.id, "judo");

    expect(await mesMotsCles(alice.id)).toEqual([]);
  });
});

describe("Alertes de l'agenda", () => {
  it("prévient qui surveille un mot présent dans l'activité", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    await abonner(alice);
    await abonner(bob);
    await ajouterMotCle(alice.id, "piscine");
    await ajouterMotCle(bob.id, "judo");
    await createEvent({ title: "Ouverture de la piscine de Marignac" });

    const { envois, send } = expediteur();
    const rapport = await notifyNewlyPublished(send);

    expect(rapport.recipients).toBe(1);
    expect(envois.map((e) => e.accountId)).toEqual([alice.id]);
    // Le mot appartient à Alice : le message peut le nommer. Le titre de l'activité, non.
    expect(envois[0].payload.body).toBe("Une activité correspond à « piscine »");
  });

  it("ne se répète pas au passage suivant des sources", async () => {
    const alice = await createAccount("Alice");
    await abonner(alice);
    await ajouterMotCle(alice.id, "piscine");
    await createEvent({ title: "Ouverture de la piscine" });

    const premier = expediteur();
    await notifyNewlyPublished(premier.send);
    const second = expediteur();
    await notifyNewlyPublished(second.send);

    expect(premier.envois).toHaveLength(1);
    expect(second.envois).toHaveLength(0);
  });

  it("trouve le mot malgré les accents et le pluriel", async () => {
    const alice = await createAccount("Alice");
    await abonner(alice);
    await ajouterMotCle(alice.id, "théâtre");
    await createEvent({ title: "Deux theatres de marionnettes" });

    const { envois, send } = expediteur();
    await notifyNewlyPublished(send);

    expect(envois).toHaveLength(1);
  });

  it("ne prévient pas pour un mot qui n'y est pas", async () => {
    const alice = await createAccount("Alice");
    await abonner(alice);
    await ajouterMotCle(alice.id, "piscine");
    await createEvent({ title: "Atelier chocolat" });

    const { envois, send } = expediteur();
    await notifyNewlyPublished(send);

    expect(envois).toEqual([]);
  });

  it("prévient de l'inscription qui l'a demandé, dès la publication", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    await abonner(alice);
    await abonner(bob);
    await reglerAlerteInscription(alice.id, true);
    await createEvent({ title: "Atelier chocolat", acces: "inscription" });

    const { envois, send } = expediteur();
    await notifyNewlyPublished(send);

    expect(envois.map((e) => e.accountId)).toEqual([alice.id]);
    expect(envois[0].payload.body).toBe("Une activité sur inscription vient de paraître");
  });

  it("ne prévient de l'inscription que pour les activités concernées", async () => {
    const alice = await createAccount("Alice");
    await abonner(alice);
    await reglerAlerteInscription(alice.id, true);
    await createEvent({ title: "Marché de Noël", acces: "libre" });

    const { envois, send } = expediteur();
    await notifyNewlyPublished(send);

    expect(envois).toEqual([]);
  });

  it("envoie un seul message quand les deux raisons se rejoignent", async () => {
    const alice = await createAccount("Alice");
    await abonner(alice);
    await ajouterMotCle(alice.id, "poterie");
    await reglerAlerteInscription(alice.id, true);
    await createEvent({ title: "Atelier poterie", acces: "inscription" });

    const { envois, send } = expediteur();
    await notifyNewlyPublished(send);

    expect(envois).toHaveLength(1);
    // Le mot-clé dit pourquoi ; l'autre message dirait seulement qu'il y a quelque chose.
    expect(envois[0].payload.body).toBe("Une activité correspond à « poterie »");
  });

  it("ne prévient pas d'une activité déjà commencée", async () => {
    const alice = await createAccount("Alice");
    await abonner(alice);
    await ajouterMotCle(alice.id, "piscine");
    await createEvent({
      title: "Ouverture de la piscine",
      startsAt: minutesFromNow(-120),
      endsAt: minutesFromNow(120),
    });

    const { envois, send } = expediteur();
    await notifyNewlyPublished(send);

    expect(envois).toEqual([]);
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
