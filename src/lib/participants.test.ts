/**
 * « La maman de Matéo est au parc, +2 » � et en dépliant le +2, qui exactement.
 *
 * Ce que ces tests garantissent : le compteur et la liste disent toujours la même chose, et
 * rejoindre une sortie ne rend visible qu'aux personnes avec qui on partage déjà un cercle.
 * Quelqu'un venu par le voisinage n'apparaît jamais à un parent de la classe.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { addChild } from "@/lib/children";
import {
  declarePresence,
  joinPresence,
  leavePresence,
  withdraw,
} from "@/lib/publications";
import { visibleParticipants, visiblePublications } from "@/lib/visibility";
import {
  createAccount,
  createChild,
  createCircle,
  createPlace,
  cutLink,
  join,
  leave,
  resetDatabase,
  type Account,
} from "@/test/helpers";

/** Le compteur affiché et la liste dépliée doivent toujours coïncider. */
async function vueDe(reader: Account, publicationId: string) {
  const [publication] = (await visiblePublications(reader.id)).filter(
    (p) => p.id === publicationId,
  );
  const liste = await visibleParticipants(reader.id, publicationId);

  if (publication) {
    expect(
      publication.otherParticipants,
      "le « +n » doit annoncer exactement ce que la liste montre",
    ).toBe(liste.filter((p) => !p.isAuthor).length);
  }

  return { publication, liste };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("Les enfants présents sont nommés", () => {
  it("la sortie porte le prénom des enfants amenés", async () => {
    const maman = await createAccount("Maman de Matéo");
    const bob = await createAccount("Bob");
    const classe = await createCircle(maman, "Classe 4P");
    await join(classe, bob);
    const parc = await createPlace("Parc du Gué");

    const mateo = await addChild(maman.id, {
      firstName: "Matéo",
    });
    if (!mateo.ok) return;

    const sortie = await declarePresence(maman.id, {
      placeId: parc.id,
      childIds: [mateo.value.id],
    });
    if (!sortie.ok) return;

    const { publication } = await vueDe(bob, sortie.value.publicationId);
    expect(publication.placeName).toBe("Parc du Gué");
    expect(publication.authorChildren).toEqual(["Matéo"]);
    expect(publication.otherParticipants).toBe(0);
  });

  it("on ne peut pas déclarer présent l'enfant de quelqu'un d'autre", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    await createCircle(alice);
    const parc = await createPlace();
    const enfantDeBob = await createChild(bob, "Léa");

    expect(
      await declarePresence(alice.id, { placeId: parc.id, childIds: [enfantDeBob.id] }),
    ).toEqual({ ok: false, reason: "enfant_inconnu" });
  });
});

describe("Rejoindre une sortie", () => {
  async function sortieAuParc() {
    const maman = await createAccount("Maman de Matéo");
    const sarah = await createAccount("Sarah");
    const jose = await createAccount("José");
    const classe = await createCircle(maman, "Classe 4P");
    await join(classe, sarah);
    await join(classe, jose);
    const parc = await createPlace("Parc du Gué");
    const mateo = await createChild(maman, "Matéo");

    const sortie = await declarePresence(maman.id, {
      placeId: parc.id,
      childIds: [mateo.id],
    });
    if (!sortie.ok) throw new Error(sortie.reason);

    return { maman, sarah, jose, classe, parc, publicationId: sortie.value.publicationId };
  }

  it("le compteur monte et la liste se déplie", async () => {
    const { maman, sarah, jose, publicationId } = await sortieAuParc();
    const lea = await createChild(sarah, "Léa");

    expect((await joinPresence(sarah.id, publicationId, [lea.id])).ok).toBe(true);
    expect((await joinPresence(jose.id, publicationId)).ok).toBe(true);

    const { publication, liste } = await vueDe(maman, publicationId);
    expect(publication.otherParticipants).toBe(2);
    expect(liste.map((p) => p.displayName)).toEqual(["Maman de Matéo", "Sarah", "José"]);
    expect(liste[0].isAuthor).toBe(true);
    expect(liste[0].children).toEqual(["Matéo"]);
    expect(liste[1].children).toEqual(["Léa"]);
    expect(liste[2].children).toEqual([]);
  });

  it("on ne rejoint que ce qu'on voit", async () => {
    const { publicationId } = await sortieAuParc();
    const inconnu = await createAccount("Inconnu");

    expect(await joinPresence(inconnu.id, publicationId)).toEqual({
      ok: false,
      reason: "sortie_invisible",
    });
  });

  it("rejoindre deux fois corrige la liste d'enfants au lieu de la doubler", async () => {
    const { maman, sarah, publicationId } = await sortieAuParc();
    const lea = await createChild(sarah, "Léa");
    const tom = await createChild(sarah, "Tom");

    await joinPresence(sarah.id, publicationId, [lea.id]);
    await joinPresence(sarah.id, publicationId, [lea.id, tom.id]);

    const { publication, liste } = await vueDe(maman, publicationId);
    expect(publication.otherParticipants).toBe(1);
    expect(liste[1].children).toEqual(["Léa", "Tom"]);
  });

  it("on se retire d'une sortie qu'on avait rejointe", async () => {
    const { maman, sarah, publicationId } = await sortieAuParc();
    await joinPresence(sarah.id, publicationId);

    expect((await leavePresence(sarah.id, publicationId)).ok).toBe(true);

    const { publication } = await vueDe(maman, publicationId);
    expect(publication.otherParticipants).toBe(0);
  });

  it("l'auteur ne se retire pas : il retire sa sortie", async () => {
    const { maman, sarah, publicationId } = await sortieAuParc();

    expect(await leavePresence(maman.id, publicationId)).toEqual({
      ok: false,
      reason: "pas_auteur",
    });

    await withdraw(maman.id, publicationId);
    expect((await vueDe(sarah, publicationId)).publication).toBeUndefined();
  });

  it("on ne rejoint pas une inscription à une activité : on s'y inscrit soi-même", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    const { createEventAndAttend } = await import("@/lib/publications");
    const activite = await createEventAndAttend(alice.id, {
      title: "Visite du Muséum",
      startsAt: new Date(Date.now() + 3_600_000),
    });
    if (!activite.ok) return;

    expect(await joinPresence(bob.id, activite.value.publicationId)).toEqual({
      ok: false,
      reason: "pas_une_presence",
    });
  });
});

describe("Le « +n » respecte l'isolation entre cercles", () => {
  it("Sarah venue par le voisinage n'apparaît pas à José, de la classe", async () => {
    const maman = await createAccount("Maman de Matéo");
    const jose = await createAccount("José");
    const sarah = await createAccount("Sarah");

    const classe = await createCircle(maman, "Classe 4P");
    const voisinage = await createCircle(maman, "Voisinage");
    await join(classe, jose);
    await join(voisinage, sarah);
    const parc = await createPlace("Parc du Gué");

    const sortie = await declarePresence(maman.id, {
      placeId: parc.id,
      circleIds: [classe.id, voisinage.id],
    });
    if (!sortie.ok) return;

    await joinPresence(sarah.id, sortie.value.publicationId);
    await joinPresence(jose.id, sortie.value.publicationId);

    // L'auteur, qui partage un cercle avec chacun, voit les deux.
    const vueMaman = await vueDe(maman, sortie.value.publicationId);
    expect(vueMaman.liste.map((p) => p.displayName)).toEqual([
      "Maman de Matéo",
      "Sarah",
      "José",
    ]);

    // José ne voit que lui-même et l'auteur : Sarah lui est étrangère.
    const vueJose = await vueDe(jose, sortie.value.publicationId);
    expect(vueJose.liste.map((p) => p.displayName)).toEqual(["Maman de Matéo", "José"]);
    expect(vueJose.publication.otherParticipants).toBe(1);

    // Et réciproquement.
    const vueSarah = await vueDe(sarah, sortie.value.publicationId);
    expect(vueSarah.liste.map((p) => p.displayName)).toEqual(["Maman de Matéo", "Sarah"]);
  });

  it("un lien coupé retire la personne de la liste, dans les deux sens", async () => {
    const maman = await createAccount("Maman de Matéo");
    const sarah = await createAccount("Sarah");
    const jose = await createAccount("José");
    const classe = await createCircle(maman, "Classe 4P");
    await join(classe, sarah);
    await join(classe, jose);
    const parc = await createPlace();

    const sortie = await declarePresence(maman.id, { placeId: parc.id });
    if (!sortie.ok) return;
    await joinPresence(sarah.id, sortie.value.publicationId);
    await joinPresence(jose.id, sortie.value.publicationId);

    await cutLink(classe, sarah, jose, jose);

    const vueJose = await vueDe(jose, sortie.value.publicationId);
    expect(vueJose.liste.map((p) => p.displayName)).toEqual(["Maman de Matéo", "José"]);

    const vueSarah = await vueDe(sarah, sortie.value.publicationId);
    expect(vueSarah.liste.map((p) => p.displayName)).toEqual(["Maman de Matéo", "Sarah"]);
  });

  it("quelqu'un qui quitte le cercle disparaît de la liste", async () => {
    const maman = await createAccount("Maman de Matéo");
    const sarah = await createAccount("Sarah");
    const jose = await createAccount("José");
    const classe = await createCircle(maman, "Classe 4P");
    await join(classe, sarah);
    await join(classe, jose);
    const parc = await createPlace();

    const sortie = await declarePresence(maman.id, { placeId: parc.id });
    if (!sortie.ok) return;
    await joinPresence(sarah.id, sortie.value.publicationId);
    await joinPresence(jose.id, sortie.value.publicationId);

    await leave(classe, sarah);

    const vueJose = await vueDe(jose, sortie.value.publicationId);
    expect(vueJose.liste.map((p) => p.displayName)).toEqual(["Maman de Matéo", "José"]);
  });

  it("un non-membre ne voit ni la sortie ni ses participants", async () => {
    const maman = await createAccount("Maman de Matéo");
    const sarah = await createAccount("Sarah");
    const inconnu = await createAccount("Inconnu");
    const classe = await createCircle(maman);
    await join(classe, sarah);
    const parc = await createPlace();

    const sortie = await declarePresence(maman.id, { placeId: parc.id });
    if (!sortie.ok) return;
    await joinPresence(sarah.id, sortie.value.publicationId);

    expect(await visibleParticipants(inconnu.id, sortie.value.publicationId)).toEqual([]);
  });
});
