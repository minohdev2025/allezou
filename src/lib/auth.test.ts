/**
 * Ce que ces tests garantissent : aucun mot de passe n'existe, un lien ne sert qu'une fois,
 * et le jeton en clair ne se trouve nulle part en base.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MAGIC_LINK_MAX_PAR_MINUTE,
  consumeMagicLink,
  destroySession,
  requestMagicLink,
  resolveSession,
  setDisplayName,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { lienDeConnexionEnDeveloppement, sentMails } from "@/lib/mail";
import { deleteAccount, resetDatabase, type Account } from "@/test/helpers";

/** Récupère le jeton du dernier courriel envoyé. */
function dernierJeton(): string {
  const mail = sentMails.at(-1);
  if (!mail) throw new Error("aucun courriel envoyé");
  const match = mail.text.match(/\/connexion\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("aucun lien dans le courriel");
  return match[1];
}

async function demanderUnLien(email: string): Promise<string> {
  const result = await requestMagicLink(email);
  expect(result.ok).toBe(true);
  return dernierJeton();
}

beforeEach(async () => {
  await resetDatabase();
  sentMails.length = 0;
});

describe("Demande d'un lien de connexion", () => {
  it("refuse une adresse invalide", async () => {
    expect(await requestMagicLink("pas-une-adresse")).toEqual({
      ok: false,
      reason: "adresse_invalide",
    });
    expect(sentMails).toHaveLength(0);
  });

  it("normalise l'adresse (espaces, majuscules)", async () => {
    await requestMagicLink("  Sophie@Example.TEST  ");
    expect(sentMails.at(-1)?.to).toBe("sophie@example.test");
  });

  it("refuse une deuxième demande immédiate pour la même adresse", async () => {
    await requestMagicLink("sophie@example.test");
    expect(await requestMagicLink("sophie@example.test")).toEqual({
      ok: false,
      reason: "trop_de_demandes",
    });
    expect(sentMails).toHaveLength(1);
  });

  it("refuse au-delà du plafond global, adresses différentes comprises", async () => {
    // La minimisation interdit de compter par adresse IP : sans plafond global, on
    // servirait de relais de courrier à qui parcourrait des milliers d'adresses.
    for (let i = 0; i < MAGIC_LINK_MAX_PAR_MINUTE; i += 1) {
      expect((await requestMagicLink(`parent${i}@example.test`)).ok).toBe(true);
    }

    expect(await requestMagicLink("un-de-plus@example.test")).toEqual({
      ok: false,
      reason: "service_sature",
    });
  });
});

describe("Suivi du lien", () => {
  it("crée le compte à la première connexion", async () => {
    const jeton = await demanderUnLien("sophie@example.test");

    const result = await consumeMagicLink(jeton);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isNew).toBe(true);
    expect(result.account.email).toBe("sophie@example.test");
    expect(result.sessionToken).toBeTruthy();
  });

  it("retrouve le même compte à la connexion suivante", async () => {
    const premier = await consumeMagicLink(await demanderUnLien("sophie@example.test"));
    expect(premier.ok).toBe(true);
    if (!premier.ok) return;

    await db.execute(sql`delete from magic_link`);
    const second = await consumeMagicLink(await demanderUnLien("sophie@example.test"));

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.account.id).toBe(premier.account.id);
    expect(second.isNew).toBe(false);
  });

  it("un lien ne fonctionne qu'une seule fois", async () => {
    const jeton = await demanderUnLien("sophie@example.test");

    expect((await consumeMagicLink(jeton)).ok).toBe(true);
    expect(await consumeMagicLink(jeton)).toEqual({
      ok: false,
      reason: "lien_deja_utilise",
    });
  });

  it("un lien expiré ne fonctionne pas", async () => {
    const jeton = await demanderUnLien("sophie@example.test");
    await db.execute(sql`update magic_link set expires_at = now() - interval '1 second'`);

    expect(await consumeMagicLink(jeton)).toEqual({ ok: false, reason: "lien_expire" });
  });

  it("un jeton inventé ne fonctionne pas", async () => {
    expect(await consumeMagicLink("jeton-invente")).toEqual({
      ok: false,
      reason: "lien_inconnu",
    });
  });
});

describe("Le lien affiché en développement", () => {
  it("apparaît quand aucun SMTP n'est configuré", async () => {
    await demanderUnLien("sophie@example.test");
    expect(lienDeConnexionEnDeveloppement()).toMatch(/\/connexion\/[A-Za-z0-9_-]+$/);
  });

  it("n'apparaît jamais en production", async () => {
    await demanderUnLien("sophie@example.test");

    // Afficher un lien de connexion sans l'envoyer permettrait d'entrer dans le compte
    // de n'importe quelle adresse.
    expect(lienDeConnexionEnDeveloppement("production")).toBeNull();
  });
});

describe("Le jeton en clair n'est jamais stocké", () => {
  it("ni pour le lien de connexion, ni pour la session", async () => {
    const jeton = await demanderUnLien("sophie@example.test");
    const result = await consumeMagicLink(jeton);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const liens = await db.execute<{ token_hash: string }>(
      sql`select token_hash from magic_link`,
    );
    const sessions = await db.execute<{ token_hash: string }>(
      sql`select token_hash from session`,
    );

    expect(liens.map((l) => l.token_hash)).not.toContain(jeton);
    expect(sessions.map((s) => s.token_hash)).not.toContain(result.sessionToken);
    // Une empreinte SHA-256 en hexadécimal, rien qui ressemble au jeton d'origine.
    expect(sessions[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Session", () => {
  async function ouvrirUneSession(): Promise<{ account: Account; token: string }> {
    const result = await consumeMagicLink(await demanderUnLien("sophie@example.test"));
    if (!result.ok) throw new Error("connexion impossible");
    return { account: result.account as Account, token: result.sessionToken };
  }

  it("retrouve le compte", async () => {
    const { account, token } = await ouvrirUneSession();
    expect((await resolveSession(token))?.id).toBe(account.id);
  });

  it("ne retrouve rien avec un jeton inconnu", async () => {
    expect(await resolveSession("inconnu")).toBeNull();
  });

  it("ne retrouve rien après expiration", async () => {
    const { token } = await ouvrirUneSession();
    await db.execute(sql`update session set expires_at = now() - interval '1 second'`);

    expect(await resolveSession(token)).toBeNull();
  });

  it("ne retrouve rien si le compte a été supprimé", async () => {
    const { account, token } = await ouvrirUneSession();
    await deleteAccount(account);

    expect(await resolveSession(token)).toBeNull();
  });

  it("la déconnexion invalide le jeton", async () => {
    const { token } = await ouvrirUneSession();
    await destroySession(token);

    expect(await resolveSession(token)).toBeNull();
  });
});

describe("Nom affiché", () => {
  it("est choisi librement par le parent", async () => {
    const result = await consumeMagicLink(await demanderUnLien("sophie@example.test"));
    if (!result.ok) return;

    expect(await setDisplayName(result.account.id, "Maman de Léa")).toEqual({ ok: true });

    const relu = await resolveSession(result.sessionToken);
    expect(relu?.displayName).toBe("Maman de Léa");
  });

  it("refuse un nom vide", async () => {
    const result = await consumeMagicLink(await demanderUnLien("sophie@example.test"));
    if (!result.ok) return;

    const nom = await setDisplayName(result.account.id, "   ");
    expect(nom.ok).toBe(false);
  });
});
