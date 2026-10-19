/**
 * Qui voit les disponibilités, et ce qu'elles disent.
 *
 * Ce que ces tests garantissent : on ne voit les disponibilités de quelqu'un que s'il nous
 * a nommé, et seulement tant qu'on partage un cercle sans lien coupé. Ex-membre, lien
 * coupé, compte supprimé, personne non nommée : chacun a son cas, comme pour les sorties.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { deleteAccount } from "@/lib/account";
import { db } from "@/lib/db";
import {
  ajouterCreneau,
  creneauxDuJour,
  etenduesPendant,
  mesDisponibilites,
  purgerSemainesPassees,
  reglerLecteurs,
  reglerSemaine,
  reglerVacances,
  retirerCreneau,
} from "@/lib/disponibilites";
import { VACANCES_GENEVE } from "@/lib/vacances";
import { visibleDisponibilites } from "@/lib/visibility";
import {
  createAccount,
  createCircle,
  cutLink,
  join,
  leave,
  resetDatabase,
  type Account,
} from "@/test/helpers";

const ete2027 = VACANCES_GENEVE.find((v) => v.id === "ete-2027")!;
const AVANT_L_ETE = "2027-06-01";

beforeEach(async () => {
  await resetDatabase();
});

/** Alice dit « le mercredi de 16h à 20h » et nomme Bob ; ils sont dans la même classe. */
async function aliceEtBob() {
  const alice = await createAccount("Alice");
  const bob = await createAccount("Bob");
  const classe = await createCircle(alice, "Classe 4P");
  await join(classe, bob);
  expect((await ajouterCreneau(alice.id, { jour: "3", de: "16:00", a: "20:00" })).ok).toBe(true);
  expect((await reglerLecteurs(alice.id, [bob.id])).ok).toBe(true);
  return { alice, bob, classe };
}

const qui = async (lecteur: Account, circleId?: string) =>
  (await visibleDisponibilites(lecteur.id, { circleId })).map((d) => d.displayName);

describe("Qui voit les disponibilités", () => {
  it("la personne nommée, dans un cercle commun", async () => {
    const { bob } = await aliceEtBob();
    const [vue] = await visibleDisponibilites(bob.id);
    expect(vue.displayName).toBe("Alice");
    expect(vue.creneaux).toEqual([{ jour: 3, debut: 960, fin: 1200 }]);
  });

  it("pas un autre membre du cercle, que personne n'a nommé", async () => {
    const { classe } = await aliceEtBob();
    const carla = await createAccount("Carla");
    await join(classe, carla);
    expect(await qui(carla)).toEqual([]);
  });

  it("plus personne dès qu'on ne partage plus de cercle", async () => {
    const { bob, classe } = await aliceEtBob();
    await leave(classe, bob);
    expect(await qui(bob)).toEqual([]);
  });

  it("plus personne quand le lien est coupé — dans un sens comme dans l'autre", async () => {
    const { alice, bob, classe } = await aliceEtBob();
    await cutLink(classe, bob, alice, bob);
    expect(await qui(bob)).toEqual([]);
  });

  it("un lien coupé dans un cercle laisse voir par un autre, mais pas sur la page du premier", async () => {
    const { alice, bob, classe } = await aliceEtBob();
    const voisins = await createCircle(alice, "Voisinage");
    await join(voisins, bob);
    await cutLink(classe, alice, bob);

    expect(await qui(bob)).toEqual(["Alice"]);
    expect(await qui(bob, voisins.id)).toEqual(["Alice"]);
    expect(await qui(bob, classe.id)).toEqual([]);
  });

  it("rien d'un compte supprimé", async () => {
    const { alice, bob } = await aliceEtBob();
    await deleteAccount(alice.id);
    expect(await qui(bob)).toEqual([]);
    const restes = await db.execute(sql`
      select (select count(*) from disponibilite_hebdo)::int as h,
             (select count(*) from disponibilite_lecteur)::int as l
    `);
    expect(restes[0]).toEqual({ h: 0, l: 0 });
  });

  it("une archive de cercle éteint aussi ce qu'on y voyait", async () => {
    const { bob, classe } = await aliceEtBob();
    await db.execute(sql`update circle set archived_at = now() where id = ${classe.id}`);
    expect(await qui(bob)).toEqual([]);
  });

  it("on ne se voit pas soi-même parmi les autres", async () => {
    const { alice } = await aliceEtBob();
    expect(await qui(alice)).toEqual([]);
  });

  it("une personne qui n'a rien renseigné n'apparaît pas", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    await reglerLecteurs(alice.id, [bob.id]);
    expect(await qui(bob)).toEqual([]);
  });
});

describe("Nommer les personnes", () => {
  it("la liste remplace la précédente : décocher retire", async () => {
    const { alice, bob, classe } = await aliceEtBob();
    const carla = await createAccount("Carla");
    await join(classe, carla);

    await reglerLecteurs(alice.id, [carla.id]);
    expect(await qui(bob)).toEqual([]);
    expect(await qui(carla)).toEqual(["Alice"]);
    expect((await mesDisponibilites(alice.id)).lecteurs).toEqual([carla.id]);
  });

  it("on ne nomme pas quelqu'un hors de ses cercles", async () => {
    const alice = await createAccount("Alice");
    const inconnu = await createAccount("Inconnu");
    await createCircle(alice);
    expect(await reglerLecteurs(alice.id, [inconnu.id])).toEqual({
      ok: false,
      reason: "lecteur_interdit",
    });
  });

  it("ni quelqu'un dont on a coupé le lien", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const classe = await createCircle(alice);
    await join(classe, bob);
    await cutLink(classe, alice, bob);
    expect((await reglerLecteurs(alice.id, [bob.id])).ok).toBe(false);
  });
});

describe("Les habitudes de la semaine", () => {
  it("refuse un créneau à l'envers ou trop court, accepte une fin à minuit", async () => {
    const alice = await createAccount("Alice");
    expect((await ajouterCreneau(alice.id, { jour: "3", de: "20:00", a: "16:00" })).ok).toBe(false);
    expect((await ajouterCreneau(alice.id, { jour: "3", de: "16:00", a: "16:05" })).ok).toBe(false);
    expect((await ajouterCreneau(alice.id, { jour: "8", de: "16:00", a: "18:00" })).ok).toBe(false);
    expect((await ajouterCreneau(alice.id, { jour: "5", de: "20:00", a: "00:00" })).ok).toBe(true);
    expect((await mesDisponibilites(alice.id)).creneaux).toMatchObject([
      { jour: 5, debut: 1200, fin: 1440 },
    ]);
  });

  it("un double toucher ne fait qu'une ligne, et retirer est réservé à son auteur", async () => {
    const { alice, bob } = await aliceEtBob();
    await ajouterCreneau(alice.id, { jour: "3", de: "16:00", a: "20:00" });
    const [creneau] = (await mesDisponibilites(alice.id)).creneaux;
    expect((await mesDisponibilites(alice.id)).creneaux).toHaveLength(1);

    await retirerCreneau(bob.id, creneau.id);
    expect((await mesDisponibilites(alice.id)).creneaux).toHaveLength(1);
    await retirerCreneau(alice.id, creneau.id);
    expect((await mesDisponibilites(alice.id)).creneaux).toHaveLength(0);
  });

  it("le créneau du jour s'efface quand on est absent cette semaine de vacances", () => {
    const dispo = {
      creneaux: [{ jour: 3, debut: 960, fin: 1200 }],
      semaines: [{ lundi: "2026-10-19", statut: "absent" as const }],
    };
    // Mercredi 21 octobre 2026 : vacances d'automne, famille absente.
    expect(creneauxDuJour(dispo, "2026-10-21", 600)).toEqual([]);
    // Mercredi 28 octobre : école, l'habitude vaut.
    expect(creneauxDuJour(dispo, "2026-10-28", 600)).toEqual([{ debut: 960, fin: 1200 }]);
    // Passé 20h, elle ne s'annonce plus pour aujourd'hui.
    expect(creneauxDuJour(dispo, "2026-10-28", 1210)).toEqual([]);
  });
});

describe("Les vacances, semaine par semaine", () => {
  it("se règlent par semaine et se lisent en étendues", async () => {
    const { alice, bob } = await aliceEtBob();
    expect((await reglerVacances(alice.id, "ete-2027", "present", AVANT_L_ETE)).ok).toBe(true);
    expect((await reglerSemaine(alice.id, "2027-07-19", "absent", AVANT_L_ETE)).ok).toBe(true);
    expect((await reglerSemaine(alice.id, "2027-07-26", "absent", AVANT_L_ETE)).ok).toBe(true);

    const [vue] = await visibleDisponibilites(bob.id);
    expect(etenduesPendant(vue.semaines, ete2027, AVANT_L_ETE)).toEqual({
      etendues: [
        { debut: "2027-07-05", fin: "2027-07-18", statut: "present" },
        { debut: "2027-07-19", fin: "2027-08-01", statut: "absent" },
        { debut: "2027-08-02", fin: "2027-08-25", statut: "present" },
      ],
      complete: false,
    });
  });

  it("une période entière au même statut se dit sans dates", () => {
    const automne = VACANCES_GENEVE.find((v) => v.id === "automne-2026")!;
    expect(
      etenduesPendant([{ lundi: "2026-10-19", statut: "absent" }], automne, "2026-10-01"),
    ).toEqual({
      etendues: [{ debut: "2026-10-19", fin: "2026-10-23", statut: "absent" }],
      complete: true,
    });
  });

  it("refuse une semaine d'école, ou une semaine passée", async () => {
    const alice = await createAccount("Alice");
    expect((await reglerSemaine(alice.id, "2026-11-02", "absent", "2026-10-01")).ok).toBe(false);
    expect((await reglerSemaine(alice.id, "2026-10-19", "absent", "2026-11-01")).ok).toBe(false);
    expect((await reglerSemaine(alice.id, "2026-10-19", "absent", "2026-10-01")).ok).toBe(true);
  });

  it("rien renseigné, c'est rien : effacer un statut le retire", async () => {
    const alice = await createAccount("Alice");
    await reglerSemaine(alice.id, "2026-12-28", "absent", "2026-10-01");
    await reglerSemaine(alice.id, "2026-12-28", null, "2026-10-01");
    expect((await mesDisponibilites(alice.id)).semaines).toEqual({});
  });

  it("la maintenance efface les semaines passées, pas les habitudes", async () => {
    const { alice } = await aliceEtBob();
    await db.execute(sql`
      insert into disponibilite_vacances (account_id, semaine, statut)
      values (${alice.id}, date '2020-10-19', 'absent')
    `);
    await reglerSemaine(alice.id, "2028-07-03", "absent", "2026-10-01");

    expect(await purgerSemainesPassees()).toBe(1);
    const mes = await mesDisponibilites(alice.id);
    expect(Object.keys(mes.semaines)).toEqual(["2028-07-03"]);
    expect(mes.creneaux).toHaveLength(1);
  });
});
