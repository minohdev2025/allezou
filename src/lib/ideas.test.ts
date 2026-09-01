/**
 * Ce que ces tests garantissent : tout le monde lit et vote, seuls l'auteur et le support
 * écrivent dans le fil, l'état d'une idée se déduit du fil sans jamais mentir, et fermer ne
 * rouvre pas par accident.
 */

import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import {
  creerIdee,
  detailIdee,
  fermerIdee,
  mesIdees,
  repondreIdee,
  toutesLesIdees,
  voterIdee,
} from "@/lib/ideas";
import { createAccount, resetDatabase, type Account } from "@/test/helpers";

const SUPPORT = "support@example.test";

async function createSupport(): Promise<Account> {
  const [row] = await db
    .insert(s.account)
    .values({ email: SUPPORT, displayName: "Support" })
    .returning();
  return row;
}

const envSauve = process.env.ADMIN_EMAILS;

beforeEach(async () => {
  await resetDatabase();
  process.env.ADMIN_EMAILS = SUPPORT;
});

afterEach(() => {
  process.env.ADMIN_EMAILS = envSauve;
});

describe("Créer une idée", () => {
  it("ouvre une idée avec son premier message dans le fil", async () => {
    const alice = await createAccount("Alice");

    const resultat = await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Mode hors-ligne",
      texte: "Pourrait-on garder les dernières activités sans réseau ?",
    });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const detail = await detailIdee(alice, resultat.value.id);
    expect(detail?.messages).toHaveLength(1);
    expect(detail?.messages[0].texte).toBe("Pourrait-on garder les dernières activités sans réseau ?");
    expect(detail?.messages[0].support).toBe(false);
    expect(detail?.etat).toBe("nouvelle");
  });

  it("refuse un titre ou un texte invalide", async () => {
    const alice = await createAccount("Alice");

    expect(
      await creerIdee(alice, { type: "fonctionnalite", titre: "x", texte: "un texte suffisant" }),
    ).toEqual({ ok: false, reason: "contenu_invalide" });
    expect(
      await creerIdee(alice, { type: "n importe quoi", titre: "un titre", texte: "un texte suffisant" }),
    ).toEqual({ ok: false, reason: "contenu_invalide" });
  });
});

describe("Répondre dans le fil", () => {
  it("le support répond et l'idée passe à « repondu »", async () => {
    const alice = await createAccount("Alice");
    const support = await createSupport();
    const cree = await creerIdee(alice, {
      type: "bug",
      titre: "Carte blanche",
      texte: "La carte reste blanche au chargement.",
    });
    if (!cree.ok) throw new Error("création ratée");

    const rep = await repondreIdee(support, cree.value.id, "Merci, on regarde ça.");
    expect(rep.ok).toBe(true);

    const detail = await detailIdee(alice, cree.value.id);
    expect(detail?.etat).toBe("repondu");
    expect(detail?.messages[1].support).toBe(true);
  });

  it("un étranger au fil n'écrit pas", async () => {
    const alice = await createAccount("Alice");
    const carol = await createAccount("Carol");
    const cree = await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Un titre long",
      texte: "Une idée argumentée comme il faut.",
    });
    if (!cree.ok) throw new Error("création ratée");

    expect(await repondreIdee(carol, cree.value.id, "Moi je dirais plutôt…")).toEqual({
      ok: false,
      reason: "pas_autorise",
    });
  });

  it("l'auteur relance après la réponse du support", async () => {
    const alice = await createAccount("Alice");
    const support = await createSupport();
    const cree = await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Rappel quotidien",
      texte: "Une notification le soir pour demain.",
    });
    if (!cree.ok) throw new Error("création ratée");

    await repondreIdee(support, cree.value.id, "Bonne idée, on note.");
    await repondreIdee(alice, cree.value.id, "Super, merci du retour !");

    const detail = await detailIdee(alice, cree.value.id);
    expect(detail?.etat).toBe("relancee");
  });

  it("une idée fermée ne se rouvre pas par un message", async () => {
    const alice = await createAccount("Alice");
    const support = await createSupport();
    const cree = await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Titre suffisant",
      texte: "Encore une idée tout à fait correcte.",
    });
    if (!cree.ok) throw new Error("création ratée");
    await repondreIdee(support, cree.value.id, "C'est fait, merci !");
    await fermerIdee(alice, cree.value.id);

    expect(await repondreIdee(alice, cree.value.id, "Encore un petit mot…")).toEqual({
      ok: false,
      reason: "deja_ferree",
    });
  });
});

describe("Voter", () => {
  it("+1 puis retrait, sans doublon", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const cree = await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Fil long",
      texte: "Quelqu'un d'autre aimerait ça ?",
    });
    if (!cree.ok) throw new Error("création ratée");

    expect(await voterIdee(bob, cree.value.id)).toBe(true);
    expect(await voterIdee(bob, cree.value.id)).toBe(false);

    const liste = await toutesLesIdees(bob.id);
    expect(liste[0].votes).toBe(0);
    expect(liste[0].vote).toBe(false);
  });

  it("le compte remonte les idées populaires et garde les fermées en bas", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    const carol = await createAccount("Carol");

    const peu = await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Idée peu votée",
      texte: "Personne n'y pense vraiment.",
    });
    const beaucoup = await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Idée populaire",
      texte: "Tout le monde la demande.",
    });
    const fermee = await creerIdee(alice, {
      type: "bug",
      titre: "Bug déjà réglé",
      texte: "Corrigé la semaine dernière.",
    });
    if (!peu.ok || !beaucoup.ok || !fermee.ok) throw new Error("créations ratées");

    await voterIdee(bob, beaucoup.value.id);
    await voterIdee(carol, beaucoup.value.id);
    await voterIdee(bob, peu.value.id);
    await fermerIdee(alice, fermee.value.id);

    const liste = await toutesLesIdees();
    expect(liste.map((i) => i.titre)).toEqual(["Idée populaire", "Idée peu votée", "Bug déjà réglé"]);
  });

  it("vote sur une idée inexistante : la base refuse", async () => {
    const bob = await createAccount("Bob");
    await expect(
      voterIdee(bob, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow();
  });
});

describe("Fermer", () => {
  it("l'auteur ferme, et le fil devient muet", async () => {
    const alice = await createAccount("Alice");
    const cree = await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Plus besoin",
      texte: "Le problème s'est résolu seul.",
    });
    if (!cree.ok) throw new Error("création ratée");

    const ferme = await fermerIdee(alice, cree.value.id);
    expect(ferme.ok).toBe(true);

    const detail = await detailIdee(alice, cree.value.id);
    expect(detail?.etat).toBe("fermee");
    expect(detail?.peutEcrire).toBe(false);
    expect(detail?.cloturePar).toBe("Alice");
  });

  it("un étranger ne ferme pas, et fermer deux fois ne compte pas", async () => {
    const alice = await createAccount("Alice");
    const carol = await createAccount("Carol");
    const cree = await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Mon idée à moi",
      texte: "Personne d'autre ne la touchera.",
    });
    if (!cree.ok) throw new Error("création ratée");

    expect(await fermerIdee(carol, cree.value.id)).toEqual({ ok: false, reason: "pas_autorise" });
    await fermerIdee(alice, cree.value.id);
    expect(await fermerIdee(alice, cree.value.id)).toEqual({ ok: false, reason: "deja_ferree" });
  });

  it("le support peut fermer si l'auteur a déserté", async () => {
    const alice = await createAccount("Alice");
    const support = await createSupport();
    const cree = await creerIdee(alice, {
      type: "bug",
      titre: "Signalement sans suite",
      texte: "Signalé puis disparu de la circulation.",
    });
    if (!cree.ok) throw new Error("création ratée");

    expect((await fermerIdee(support, cree.value.id)).ok).toBe(true);
  });
});

describe("Lister", () => {
  it("« Mes idées » ne montre que les miennes", async () => {
    const alice = await createAccount("Alice");
    const bob = await createAccount("Bob");
    await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "L'idée d'Alice",
      texte: "Rien que pour elle.",
    });
    await creerIdee(bob, {
      type: "fonctionnalite",
      titre: "L'idée de Bob",
      texte: "Rien que pour lui.",
    });

    const miennes = await mesIdees(alice.id);
    expect(miennes.map((i) => i.titre)).toEqual(["L'idée d'Alice"]);
  });

  it("toutesLesIdees ne lève pas pour un compte anonyme", async () => {
    const alice = await createAccount("Alice");
    await creerIdee(alice, {
      type: "fonctionnalite",
      titre: "Visible de tous",
      texte: "Même de qui n'a pas voté.",
    });

    const liste = await toutesLesIdees();
    expect(liste[0].vote).toBe(false);
  });
});
