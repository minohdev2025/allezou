/**
 * Ce que ces tests garantissent sur la photo d'une activité : ce qui est gardé est ce que
 * le serveur a réencodé, sans les métadonnées de la prise de vue et sans dépasser la
 * taille annoncée ; ce qui n'est pas une image est refusé ; et une activité effacée
 * n'abandonne pas sa photo derrière elle.
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { COTE_MAX, enregistrerPhoto, lirePhoto, normaliser } from "@/lib/photos";
import { createAccount, createEvent, resetDatabase } from "@/test/helpers";

beforeEach(async () => {
  await resetDatabase();
});

/** Une vraie image JPEG, de la taille demandée, avec les métadonnées d'un appareil photo. */
async function photoDeTelephone(largeur: number, hauteur: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: {
      width: largeur,
      height: hauteur,
      channels: 3,
      background: { r: 120, g: 180, b: 90 },
    },
  })
    .withExif({
      IFD0: { Make: "Allezou", Model: "Téléphone" },
      // IFD3 est le répertoire GPS : ce que porte une photo prise dehors, c'est-à-dire
      // l'endroit exact où se trouvait la famille au moment du déclenchement.
      IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "E" },
    })
    .jpeg()
    .toBuffer();
}

describe("Photo d'une activité", () => {
  it("réencode, réduit, et n'emporte aucune métadonnée de prise de vue", async () => {
    const originale = await photoDeTelephone(3000, 2000);
    const normalisee = await normaliser(originale);

    expect(normalisee.ok).toBe(true);
    if (!normalisee.ok) return;

    expect(normalisee.value.mime).toBe("image/webp");
    expect(normalisee.value.largeur).toBe(COTE_MAX);
    expect(normalisee.value.hauteur).toBe(Math.round((COTE_MAX * 2000) / 3000));

    const sharp = (await import("sharp")).default;
    const dedans = await sharp(normalisee.value.contenu).metadata();
    expect(dedans.exif).toBeUndefined();
    expect(dedans.format).toBe("webp");
  });

  it("laisse une petite photo à sa taille plutôt que de l'étirer", async () => {
    const normalisee = await normaliser(await photoDeTelephone(400, 300));
    if (!normalisee.ok) throw new Error(normalisee.reason);

    expect(normalisee.value.largeur).toBe(400);
    expect(normalisee.value.hauteur).toBe(300);
  });

  it("refuse ce qui n'est pas une image, et ce qui est vide", async () => {
    expect(await normaliser(Buffer.from("%PDF-1.7 ceci est un PDF"))).toEqual({
      ok: false,
      reason: "photo_illisible",
    });
    expect(await normaliser(Buffer.alloc(0))).toEqual({
      ok: false,
      reason: "photo_absente",
    });
  });

  it("refuse un fichier au-delà de la taille acceptée, sans le décoder", async () => {
    expect(await normaliser(Buffer.alloc(11 * 1024 * 1024))).toEqual({
      ok: false,
      reason: "photo_trop_lourde",
    });
  });

  it("se joint à l'activité, et se remplace sans se dédoubler", async () => {
    const alice = await createAccount("Alice");
    const evenement = await createEvent({ by: alice });

    expect(await enregistrerPhoto(evenement.id, alice.id, await photoDeTelephone(800, 600))).toEqual(
      { ok: true },
    );
    expect(await enregistrerPhoto(evenement.id, alice.id, await photoDeTelephone(600, 800))).toEqual(
      { ok: true },
    );

    const photo = await lirePhoto(evenement.id);
    expect(photo?.largeur).toBe(600);
    expect(photo?.hauteur).toBe(800);
    expect(photo?.octets).toBe(photo?.contenu.length);

    const lignes = await db
      .select()
      .from(s.eventPhoto)
      .where(eq(s.eventPhoto.eventId, evenement.id));
    expect(lignes).toHaveLength(1);
  });

  it("ne sert pas la photo d'une activité qui attend la relecture", async () => {
    const evenement = await createEvent();
    await enregistrerPhoto(evenement.id, null, await photoDeTelephone(400, 300));
    expect(await lirePhoto(evenement.id)).not.toBeNull();

    await db
      .update(s.event)
      .set({ publishedAt: null })
      .where(eq(s.event.id, evenement.id));

    expect(await lirePhoto(evenement.id)).toBeNull();
  });

  it("disparaît avec l'activité", async () => {
    const evenement = await createEvent();
    await enregistrerPhoto(evenement.id, null, await photoDeTelephone(400, 300));

    await db.delete(s.event).where(eq(s.event.id, evenement.id));

    expect(await db.select().from(s.eventPhoto)).toEqual([]);
  });
});
