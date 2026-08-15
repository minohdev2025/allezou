/**
 * Ce que ce test garantit : le nombre affiché compte les comptes qui existent, et un compte
 * supprimé n'en fait plus partie.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { comptesOuverts } from "@/lib/mesures";
import { createAccount, deleteAccount, resetDatabase } from "@/test/helpers";

beforeEach(async () => {
  await resetDatabase();
});

describe("Le nombre de comptes ouverts", () => {
  it("compte ceux qui existent, pas ceux qui sont supprimés", async () => {
    const alice = await createAccount("Alice");
    await createAccount("Bob");
    expect(await comptesOuverts()).toBe(2);

    await deleteAccount(alice);
    expect(await comptesOuverts()).toBe(1);
  });
});
