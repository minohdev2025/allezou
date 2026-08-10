/**
 * La preuve d'isolation exigée par PRODUIT.md.
 *
 * Ces tests ne vérifient pas que le code « marche » : ils énumèrent, cas par cas, qui voit
 * quoi et qui ne voit rien. Ils sont écrits pour être lisibles par quelqu'un qui ne
 * programme pas — c'est ce document-là qu'on montre à une association de parents.
 *
 * Chaque appel à `voit()` vérifie au passage que les deux portes de lecture
 * (`visiblePublications` et `canSeePublication`) répondent toujours la même chose.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import {
  canSeePublication,
  isActiveMember,
  isCircleAdmin,
  readerCircles,
  visibleCircleMembers,
  visiblePublications,
} from "@/lib/visibility";
import {
  archiveCircle,
  createAccount,
  createCircle,
  createEvent,
  createPlace,
  cutLink,
  declareAttendance,
  declarePresence,
  deleteAccount,
  join,
  leave,
  minutesFromNow,
  resetDatabase,
  withdraw,
  type Account,
  type Publication,
} from "@/test/helpers";

/** Le lecteur voit-il cette publication ? Vérifie aussi la cohérence des deux portes. */
async function voit(reader: Account, publication: Publication): Promise<boolean> {
  const feed = await visiblePublications(reader.id);
  const dansLaListe = feed.some((p) => p.id === publication.id);
  const enDirect = await canSeePublication(reader.id, publication.id);

  expect(
    enDirect,
    "visiblePublications et canSeePublication doivent toujours répondre la même chose",
  ).toBe(dansLaListe);

  return dansLaListe;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("1. Il faut un cercle en commun au moment de la lecture", () => {
  it("un membre du même cercle voit la présence déclarée", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    await join(classe, bob);
    const parc = await createPlace("Parc du Gué");

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });

    expect(await voit(bob, presence)).toBe(true);
  });

  it("une personne qui n'est dans aucun cercle ne voit rien", async () => {
    const alice = await createAccount("Alice");
    const inconnu = await createAccount("Inconnu");
    const classe = await createCircle(alice);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });

    expect(await voit(inconnu, presence)).toBe(false);
  });

  it("un membre d'un autre cercle ne voit rien", async () => {
    const alice = await createAccount("Alice");
    const carla = await createAccount("Carla");
    const classe = await createCircle(alice, "Classe 4P");
    const voisinage = await createCircle(carla, "Voisinage");
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });

    expect(await voit(carla, presence)).toBe(false);
    expect(voisinage.id).not.toBe(classe.id);
  });

  it("une personne qui a quitté le cercle ne voit plus ce qui s'y partage", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect(await voit(bob, presence)).toBe(true);

    await leave(classe, bob);

    expect(await voit(bob, presence)).toBe(false);
  });

  it("une personne qui rejoint le cercle voit les présences encore en cours", async () => {
    // Conséquence assumée de la règle : elle s'évalue à la lecture, pas à la publication.
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect(await voit(bob, presence)).toBe(false);

    await join(classe, bob);

    expect(await voit(bob, presence)).toBe(true);
  });

  it("si l'auteur quitte le cercle, sa présence y disparaît pour les autres", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect(await voit(bob, presence)).toBe(true);

    await leave(classe, alice);

    expect(await voit(bob, presence)).toBe(false);
  });

  it("une publication sans cercle destinataire n'est vue de personne", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [] });

    expect(await voit(bob, presence)).toBe(false);
  });

  it("une publication adressée à deux cercles n'apparaît qu'une fois", async () => {
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

    const feed = await visiblePublications(bob.id);
    expect(feed.filter((p) => p.id === presence.id)).toHaveLength(1);
  });

  it("un cercle archivé ne laisse plus rien voir", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect(await voit(bob, presence)).toBe(true);

    await archiveCircle(classe);

    expect(await voit(bob, presence)).toBe(false);
  });
});

describe("2. Le lien coupé entre deux membres est symétrique", () => {
  it("après coupure, celui qui a coupé ne voit plus l'autre", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    await cutLink(classe, bob, alice, bob);

    expect(await voit(bob, presence)).toBe(false);
  });

  it("et l'autre ne le voit plus non plus, sans que rien ne le lui signale", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    // Bob coupe. C'est la publication d'Alice qu'on regarde : elle ne doit plus voir Bob non plus.
    const deBob = await declarePresence({ author: bob, place: parc, circles: [classe] });
    await cutLink(classe, bob, alice, bob);

    expect(await voit(alice, deBob)).toBe(false);
  });

  it("la coupure ne vaut que dans le cercle où elle a été faite", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    const voisinage = await createCircle(alice, "Voisinage");
    await join(classe, bob);
    await join(voisinage, bob);
    const parc = await createPlace();

    await cutLink(classe, alice, bob, alice);

    const dansLaClasse = await declarePresence({ author: alice, place: parc, circles: [classe] });
    const dansLeVoisinage = await declarePresence({
      author: alice,
      place: parc,
      circles: [voisinage],
    });

    expect(await voit(bob, dansLaClasse)).toBe(false);
    expect(await voit(bob, dansLeVoisinage)).toBe(true);
  });

  it("une publication adressée aux deux cercles reste visible par le cercle non coupé", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    const voisinage = await createCircle(alice, "Voisinage");
    await join(classe, bob);
    await join(voisinage, bob);
    const parc = await createPlace();

    await cutLink(classe, alice, bob, alice);

    const presence = await declarePresence({
      author: alice,
      place: parc,
      circles: [classe, voisinage],
    });

    expect(await voit(bob, presence)).toBe(true);
  });

  it("la base refuse une coupure enregistrée à l'envers", async () => {
    // L'ordre canonique est une contrainte de la base : il n'existe aucun état
    // où A masque B sans que B masque A.
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    const [petit, grand] = alice.id < bob.id ? [alice.id, bob.id] : [bob.id, alice.id];

    await expect(
      db.insert(s.circleLinkCut).values({
        circleId: classe.id,
        accountA: grand,
        accountB: petit,
        cutBy: alice.id,
      }),
    ).rejects.toThrow();
  });
});

describe("3. Expiration et retrait", () => {
  it("une présence expirée n'est plus visible", async () => {
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

    expect(await voit(bob, presence)).toBe(false);
  });

  it("une présence retirée n'est plus visible", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    await withdraw(presence);

    expect(await voit(bob, presence)).toBe(false);
  });

  it("une participation à venir est visible, mais pas dans « en ce moment »", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const musee = await createEvent({ title: "Visite du Muséum" });

    const participation = await declareAttendance({
      author: alice,
      event: musee,
      circles: [classe],
    });

    expect(await voit(bob, participation)).toBe(true);

    const enCours = await visiblePublications(bob.id, { onlyStarted: true });
    expect(enCours.some((p) => p.id === participation.id)).toBe(false);
  });

  it("on peut ne demander que les participations à une activité précise", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();
    const musee = await createEvent();

    await declarePresence({ author: alice, place: parc, circles: [classe] });
    const participation = await declareAttendance({
      author: alice,
      event: musee,
      circles: [classe],
    });

    const auMusee = await visiblePublications(bob.id, { eventId: musee.id });
    expect(auMusee.map((p) => p.id)).toEqual([participation.id]);
  });
});

describe("4. Exclusion ponctuelle d'une publication", () => {
  it("la personne exclue ne voit pas, les autres du cercle voient", async () => {
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

    expect(await voit(bob, presence)).toBe(false);
    expect(await voit(carla, presence)).toBe(true);
  });
});

describe("5. Compte supprimé", () => {
  it("les publications d'un compte supprimé disparaissent", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    expect(await voit(bob, presence)).toBe(true);

    await deleteAccount(alice);

    expect(await voit(bob, presence)).toBe(false);
  });
});

describe("6. L'auteur", () => {
  it("voit toujours ce qu'il a publié", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });

    expect(await voit(alice, presence)).toBe(true);
  });

  it("le voit même après avoir quitté le cercle destinataire", async () => {
    const alice = await createAccount("Alice");
    const classe = await createCircle(alice);
    const parc = await createPlace();

    const presence = await declarePresence({ author: alice, place: parc, circles: [classe] });
    await leave(classe, alice);

    expect(await voit(alice, presence)).toBe(true);
  });
});

describe("7. La liste des membres d'un cercle", () => {
  it("un non-membre n'apprend même pas qui en fait partie", async () => {
    const alice = await createAccount("Alice");
    const inconnu = await createAccount("Inconnu");
    const classe = await createCircle(alice);

    expect(await visibleCircleMembers(inconnu.id, classe.id)).toEqual([]);
  });

  it("un membre voit les autres, avec l'indication du lien coupé", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carla = await createAccount("Carla");
    const classe = await createCircle(alice);
    await join(classe, bob);
    await join(classe, carla);

    await cutLink(classe, bob, carla, bob);

    const vus = await visibleCircleMembers(bob.id, classe.id);
    expect(vus.map((m) => m.displayName)).toEqual(["Alice", "Bob", "Carla"]);
    expect(vus.find((m) => m.displayName === "Carla")?.linkCut).toBe(true);
    expect(vus.find((m) => m.displayName === "Alice")?.linkCut).toBe(false);
  });

  it("une personne partie n'apparaît plus dans la liste", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    await leave(classe, bob);

    const vus = await visibleCircleMembers(alice.id, classe.id);
    expect(vus.map((m) => m.displayName)).toEqual(["Alice"]);
  });

  it("un compte supprimé n'apparaît plus dans la liste", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    await deleteAccount(bob);

    const vus = await visibleCircleMembers(alice.id, classe.id);
    expect(vus.map((m) => m.displayName)).toEqual(["Alice"]);
  });
});

describe("8. Formes renvoyées", () => {
  it("les horodatages sont de vraies dates, pas des chaînes", async () => {
    // Les requêtes SQL brutes renvoient des chaînes ; un type qui annonce Date sans
    // convertir ne casse qu'à l'usage, loin de sa cause.
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    const parc = await createPlace();
    await declarePresence({ author: alice, place: parc, circles: [classe] });

    const [publication] = await visiblePublications(bob.id);
    expect(publication.startsAt).toBeInstanceOf(Date);
    expect(publication.endsAt).toBeInstanceOf(Date);

    const [membre] = await visibleCircleMembers(bob.id, classe.id);
    expect(membre.joinedAt).toBeInstanceOf(Date);
  });
});

describe("9. Appartenance et rôle", () => {
  it("distingue membre actif, ancien membre et non-membre", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const inconnu = await createAccount("Inconnu");
    const classe = await createCircle(alice);
    await join(classe, bob);

    expect(await isActiveMember(alice.id, classe.id)).toBe(true);
    expect(await isActiveMember(bob.id, classe.id)).toBe(true);
    expect(await isActiveMember(inconnu.id, classe.id)).toBe(false);

    await leave(classe, bob);
    expect(await isActiveMember(bob.id, classe.id)).toBe(false);
  });

  it("distingue administrateur et membre", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);

    expect(await isCircleAdmin(alice.id, classe.id)).toBe(true);
    expect(await isCircleAdmin(bob.id, classe.id)).toBe(false);
  });

  it("ne propose à la publication que les cercles dont on est membre actif", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice, "Classe 4P");
    const voisinage = await createCircle(alice, "Voisinage");
    await join(classe, bob);

    expect((await readerCircles(bob.id)).map((c) => c.name)).toEqual(["Classe 4P"]);
    expect((await readerCircles(alice.id)).map((c) => c.name)).toEqual([
      "Classe 4P",
      "Voisinage",
    ]);
    expect(voisinage.name).toBe("Voisinage");
  });
});
