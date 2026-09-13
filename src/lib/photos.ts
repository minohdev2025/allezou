/**
 * La photo d'une activité de l'agenda.
 *
 * Trois règles tiennent ce fichier :
 *
 * 1. **On ne garde jamais le fichier reçu.** Il est décodé puis réencodé par le serveur.
 *    C'est ce qui efface les métadonnées d'une photo de téléphone — l'endroit et l'heure
 *    de la prise de vue, parfois l'appareil — que DONNEES.md promet de ne pas garder. Un
 *    client peut envoyer ce qu'il veut : ce qui entre en base sort de notre encodeur.
 * 2. **On croit les octets, pas l'étiquette.** Le type annoncé par le navigateur est une
 *    déclaration ; c'est le décodeur qui tranche. Un fichier qui n'est pas une image qu'il
 *    reconnaît est refusé, quel que soit son nom ou son en-tête.
 * 3. **Une taille bornée à l'entrée comme à la sortie.** À l'entrée pour ne pas décoder une
 *    bombe de décompression ; à la sortie pour que la base et ses sauvegardes ne dérivent
 *    pas photo après photo.
 */

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "./db";
import * as s from "./db/schema";

/** Ce qu'on accepte de recevoir. Au-delà, on ne décode même pas. */
export const MAX_PHOTO_OCTETS = 10 * 1024 * 1024;

/**
 * Le plus grand côté après réencodage. 1600 px suffit à remplir l'écran d'un téléphone
 * comme la moitié d'un écran de bureau ; au-delà on garderait des pixels que personne ne
 * regarde, dans une base qu'on sauvegarde tous les jours.
 */
export const COTE_MAX = 1600;

/** Le format de sortie. WebP tient l'affiche lisible autour de cent kilooctets. */
const MIME_SORTIE = "image/webp";
const QUALITE = 78;

export type PhotoError = "photo_absente" | "photo_trop_lourde" | "photo_illisible";

export type PhotoResult = { ok: true } | { ok: false; reason: PhotoError };

export type Photo = {
  mime: string;
  octets: number;
  largeur: number;
  hauteur: number;
  contenu: Buffer;
  updatedAt: Date;
};

/**
 * `sharp` voyage avec Next, qui s'en sert pour ses propres images. On l'importe à la
 * demande plutôt qu'au chargement du module : les écrans de l'agenda importent cette
 * bibliothèque pour savoir s'il *existe* une photo, et n'ont pas à payer le chargement
 * d'un module natif pour cette seule question.
 */
async function encodeur() {
  return (await import("sharp")).default;
}

/**
 * Réencode une image reçue : orientation appliquée, métadonnées effacées, plus grand côté
 * ramené à `COTE_MAX`. `withoutEnlargement` garde une petite photo telle quelle plutôt que
 * de l'étirer en une image floue et plus lourde que l'originale.
 */
export async function normaliser(
  fichier: Buffer,
): Promise<
  { ok: true; value: Omit<Photo, "updatedAt"> } | { ok: false; reason: PhotoError }
> {
  if (fichier.length === 0) return { ok: false, reason: "photo_absente" };
  if (fichier.length > MAX_PHOTO_OCTETS) return { ok: false, reason: "photo_trop_lourde" };

  try {
    const sharp = await encodeur();
    const { data, info } = await sharp(fichier, { failOn: "error" })
      // `rotate()` sans argument applique l'orientation déclarée puis l'oublie : sans lui,
      // une photo prise à la verticale s'affiche couchée une fois les métadonnées parties.
      .rotate()
      .resize({ width: COTE_MAX, height: COTE_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITE })
      .toBuffer({ resolveWithObject: true });

    return {
      ok: true,
      value: {
        mime: MIME_SORTIE,
        octets: data.length,
        largeur: info.width,
        hauteur: info.height,
        contenu: data,
      },
    };
  } catch {
    // Un PDF renommé en .jpg, un fichier tronqué, un format que le décodeur ne connaît
    // pas : tout cela est la même chose pour le parent — cette photo ne passe pas.
    return { ok: false, reason: "photo_illisible" };
  }
}

/**
 * Joint une photo à une activité, ou remplace celle qui y est.
 *
 * Rien ne vérifie ici qui a le droit : c'est à l'appelant de le savoir, comme partout
 * ailleurs dans les bibliothèques de ce dossier.
 */
export async function enregistrerPhoto(
  eventId: string,
  actorId: string | null,
  fichier: Buffer,
): Promise<PhotoResult> {
  const normalisee = await normaliser(fichier);
  if (!normalisee.ok) return normalisee;

  const valeurs = { ...normalisee.value, eventId, addedBy: actorId, updatedAt: new Date() };

  await db
    .insert(s.eventPhoto)
    .values(valeurs)
    .onConflictDoUpdate({ target: s.eventPhoto.eventId, set: valeurs });

  return { ok: true };
}

/** La photo d'une activité, octets compris. Ne sert qu'à la route qui la sert. */
export async function lirePhoto(eventId: string): Promise<Photo | null> {
  const [row] = await db
    .select({
      mime: s.eventPhoto.mime,
      octets: s.eventPhoto.octets,
      largeur: s.eventPhoto.largeur,
      hauteur: s.eventPhoto.hauteur,
      contenu: s.eventPhoto.contenu,
      updatedAt: s.eventPhoto.updatedAt,
    })
    .from(s.eventPhoto)
    .innerJoin(s.event, eq(s.event.id, s.eventPhoto.eventId))
    // Publiée seulement : une activité qui attend la relecture n'expose pas sa photo.
    .where(and(eq(s.eventPhoto.eventId, eventId), isNotNull(s.event.publishedAt)))
    .limit(1);

  return row ?? null;
}

/** Retire la photo d'une activité. Sans photo, il n'y a rien à faire et ce n'est pas une erreur. */
export async function retirerPhoto(eventId: string): Promise<void> {
  await db.delete(s.eventPhoto).where(eq(s.eventPhoto.eventId, eventId));
}
