/**
 * Ce que ces tests garantissent : un changement de /donnees est annoncé à chaque compte qui
 * existait avant lui, une seule fois, et la version du code ne peut pas prendre du retard
 * sur la date écrite en bas de la page.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { consumeMagicLink, requestMagicLink } from "@/lib/auth";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { VERSION_DONNEES, donneesAAnnoncer, marquerDonneesLues } from "@/lib/donnees";
import { sentMails } from "@/lib/mail";
import { createAccount, resetDatabase } from "@/test/helpers";

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

async function versionLue(accountId: string): Promise<string | null> {
  const [row] = await db
    .select({ lue: s.account.donneesLues })
    .from(s.account)
    .where(eq(s.account.id, accountId));
  return row.lue;
}

beforeEach(async () => {
  await resetDatabase();
  sentMails.length = 0;
});

describe("Version de /donnees", () => {
  it("est la date de la dernière mise à jour écrite en bas de DONNEES.md", () => {
    // Le français fait foi : c'est sa date que la version doit suivre.
    const source = readFileSync(join(process.cwd(), "DONNEES.md"), "utf8");
    const m = source.match(/Dernière mise à jour : (\d{1,2}) (\p{L}+) (\d{4})/u);
    expect(m).not.toBeNull();
    const [, jour, mois, annee] = m!;
    const date = `${annee}-${String(MOIS.indexOf(mois) + 1).padStart(2, "0")}-${jour.padStart(2, "0")}`;
    expect(VERSION_DONNEES).toBe(date);
  });

  it("s'annonce à qui n'a rien lu, ou une version plus ancienne", () => {
    expect(donneesAAnnoncer(null)).toBe(true);
    expect(donneesAAnnoncer("2026-08-09")).toBe(true);
  });

  it("ne s'annonce plus une fois lue, ni après un retour en arrière du code", () => {
    expect(donneesAAnnoncer(VERSION_DONNEES)).toBe(false);
    expect(donneesAAnnoncer("2099-01-01")).toBe(false);
  });
});

describe("Annonce par compte", () => {
  it("un compte antérieur au changement le voit annoncé, puis plus après « J'ai lu »", async () => {
    const sophie = await createAccount("Sophie");
    expect(donneesAAnnoncer(await versionLue(sophie.id))).toBe(true);

    await marquerDonneesLues(sophie.id);
    expect(await versionLue(sophie.id)).toBe(VERSION_DONNEES);
    expect(donneesAAnnoncer(await versionLue(sophie.id))).toBe(false);
  });

  it("lire ne vaut que pour soi", async () => {
    const sophie = await createAccount("Sophie");
    const karim = await createAccount("Karim");
    await marquerDonneesLues(sophie.id);
    expect(donneesAAnnoncer(await versionLue(karim.id))).toBe(true);
  });

  it("un compte créé aujourd'hui découvre la page en entier, pas comme un changement", async () => {
    await requestMagicLink("nouvelle@example.test");
    const jeton = sentMails.at(-1)!.text.match(/\/connexion\/([A-Za-z0-9_-]+)/)![1];
    const result = await consumeMagicLink(jeton);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isNew).toBe(true);
    expect(donneesAAnnoncer(result.account.donneesLues)).toBe(false);
  });
});
