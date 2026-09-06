/**
 * Lecture d'une annonce d'activité : photo d'affiche, lien vers une page, ou texte collé.
 *
 * C'est Allezou qui analyse l'annonce, côté serveur, pour pré-remplir le formulaire
 * « Annoncer une sortie ». Rien n'est publié par ce chemin : le parent relit, corrige et
 * valide lui-même. Une lecture approximative coûte donc un coup d'œil, pas une entrée
 * fausse dans le calendrier.
 *
 * Le modèle lit l'image directement (pas d'OCR local) et rend un JSON strict, validé par
 * un schéma avant d'atteindre le formulaire. Les heures sont ramenées à l'heure murale de
 * Genève pour les champs `datetime-local`.
 */

import { cookies } from "next/headers";
import { z } from "zod";

import { appelMiniMax, appelMiniMaxVision, htmlToText, parseModelJson } from "./ingest/minimax";
import { USER_AGENT } from "./ingest/types";

/** Le témoin qui porte l'annonce lue de l'action vers le formulaire. Un quart d'heure. */
const COOKIE_ANNONCE = "totir_annonce";
const MAX_IMAGE_OCTETS = 8 * 1024 * 1024;
const MIMES_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_TEXTE = 30_000;

/** Comme l'ingest : rien ne commence dans deux ans, rien n'a commencé il y a un mois. */
const FENETRE_PASSE_MS = 24 * 3_600_000;
const FENETRE_FUTUR_MS = 365 * 24 * 3_600_000;

const texteFacultatif = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

const annonceSchema = z.object({
  titre: z.string().min(1).max(200),
  debut: z.string().min(1),
  fin: texteFacultatif,
  lieu: texteFacultatif,
});

/**
 * Le modèle renvoie tantôt l'enveloppe demandée, tantôt l'objet nu. Les deux formes
 * disent la même chose ; ne pas accepter la seconde ferait échouer une lecture correcte.
 */
const payloadSchema = z.union([
  z.object({ annonce: annonceSchema.nullable() }),
  annonceSchema.transform((annonce) => ({ annonce })),
]);

const SYSTEME = [
  "Tu lis l'annonce d'une activité qu'un parent de Genève veut signaler à son agenda familial.",
  "L'annonce peut être une affiche (image), le texte d'une page web, ou un message collé.",
  "Réponds uniquement par un objet JSON, sans texte autour, de la forme :",
  '{"annonce":{"titre":"...","debut":"2026-01-04T14:00:00+01:00","fin":"...","lieu":"..."}}',
  "Règles strictes :",
  "- « titre » est le nom de l'activité tel qu'écrit, sans la rubrique, la date ni le lieu.",
  "- « debut » et « fin » sont en ISO 8601 avec le fuseau de Genève (+01:00 en hiver,",
  "  +02:00 en été). Si l'année n'est pas écrite, déduis-la de la date du jour : prochaine",
  "  occurrence du jour et du mois annoncés.",
  "- N'invente jamais une date ni une heure. Si aucune heure n'est écrite, mets T00:00:00.",
  "- « fin » : omets le champ si l'annonce ne donne pas d'heure ou de jour de fin.",
  "- « lieu » recopie le lieu tel qu'écrit (« Parc La Grange, Genève »). Omets-le s'il est absent.",
  "- Ne décris pas, ne complète pas de mémoire : recopie ce que l'annonce dit.",
  "- Si l'annonce ne décrit pas une activité datée, réponds {\"annonce\":null}.",
].join("\n");

export type AnnonceLue = {
  titre: string;
  /** Heure murale de Genève, prête pour `datetime-local` : « 2026-08-15T15:00 ». */
  debut: string;
  fin?: string;
  lieu?: string;
};

export type ResultatLecture =
  | ({ ok: true } & AnnonceLue)
  | { ok: false; raison: RaisonEchec };

export type RaisonEchec =
  | "image_invalide"
  | "lien_invalide"
  | "texte_trop_court"
  | "rien_trouve"
  | "date_invraisemblable";

/**
 * « 2026-08-15T15:00:00+02:00 » → l'heure murale de Genève au format `datetime-local`.
 * Deux passes ne sont pas nécessaires ici : on part d'un instant exact (le fuseau est
 * écrit), on ne fait que l'afficher dans la zone.
 */
export function murDeGeneve(iso: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;

  const parties = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Zurich",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);

  const lire = (type: string) => parties.find((p) => p.type === type)?.value ?? "";
  const heure = lire("hour") === "24" ? "00" : lire("hour");
  const mur = `${lire("year")}-${lire("month")}-${lire("day")}T${heure}:${lire("minute")}`;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(mur) ? mur : null;
}

/**
 * Garde-fou SSRF : l'URL vient d'un utilisateur, le fetch part du serveur. On refuse tout
 * ce qui n'est pas http(s), et tout hôte qui sonne local ou privé. Les hôtes privés en
 * littéral IP sont couverts ; un nom DNS qui résoudrait vers une IP privée reste possible,
 * mais l'appel ne renvoie rien d'autre que du texte public déjà limité en taille.
 */
export function urlPubliqueSure(valeur: string): URL | null {
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const hote = url.hostname.toLowerCase();
  if (hote === "localhost" || hote.endsWith(".local") || hote.endsWith(".internal")) {
    return null;
  }
  if (/^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hote)) {
    return null;
  }
  // IPv6 littéral : boucle (::1), non spécifié, lien local (fe80::/10), unique local (fc00::/7).
  if (hote.startsWith("[")) {
    const ip = hote.slice(1, -1);
    if (ip === "::1" || ip === "::" || /^fe[89ab]/i.test(ip) || /^f[cd]/i.test(ip)) {
      return null;
    }
  }
  return url;
}

function dansLaFenetre(instant: Date): boolean {
  const maintenant = Date.now();
  return (
    instant.getTime() >= maintenant - FENETRE_PASSE_MS &&
    instant.getTime() <= maintenant + FENETRE_FUTUR_MS
  );
}

/** Valide la réponse du modèle et rend l'annonce prête pour le formulaire. */
export function annonceDepuisPayload(payload: unknown): ResultatLecture {
  const lu = payloadSchema.safeParse(payload);
  if (!lu.success) return { ok: false, raison: "rien_trouve" };
  const annonce = lu.data.annonce;
  if (!annonce) return { ok: false, raison: "rien_trouve" };

  const debutInstant = new Date(annonce.debut);
  if (Number.isNaN(debutInstant.getTime())) return { ok: false, raison: "rien_trouve" };
  if (!dansLaFenetre(debutInstant)) return { ok: false, raison: "date_invraisemblable" };

  const debut = murDeGeneve(annonce.debut);
  if (!debut) return { ok: false, raison: "rien_trouve" };

  const fin = annonce.fin ? murDeGeneve(annonce.fin) ?? undefined : undefined;
  const titre = annonce.titre.trim().slice(0, 120);
  if (titre.length < 3) return { ok: false, raison: "rien_trouve" };

  return {
    ok: true,
    titre,
    debut,
    fin,
    lieu: annonce.lieu?.trim().slice(0, 120) || undefined,
  };
}

const utilisateur = () => `Date du jour : ${new Date().toISOString()}`;

/** Photo d'affiche : le modèle lit l'image directement, aucun OCR local. */
export async function extraireDePhoto(fichier: File): Promise<ResultatLecture> {
  if (!MIMES_IMAGE.has(fichier.type) || fichier.size === 0 || fichier.size > MAX_IMAGE_OCTETS) {
    return { ok: false, raison: "image_invalide" };
  }
  const base64 = Buffer.from(await fichier.arrayBuffer()).toString("base64");
  const content = await appelMiniMaxVision(
    SYSTEME,
    `${utilisateur()}\n\nVoici la photo d'une annonce.`,
    { mime: fichier.type, base64 },
  );
  return annonceDepuisPayload(parseModelJson(content));
}

/** Lien vers une page : fetch côté serveur (URL filtrée), puis lecture du texte. */
export async function extraireDeLien(lien: string): Promise<ResultatLecture> {
  const url = urlPubliqueSure(lien);
  if (!url) return { ok: false, raison: "lien_invalide" };

  let reponse: Response;
  try {
    reponse = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
  } catch {
    return { ok: false, raison: "lien_invalide" };
  }
  if (!reponse.ok) return { ok: false, raison: "lien_invalide" };

  const texte = htmlToText(await reponse.text(), MAX_TEXTE);
  if (texte.length < 40) return { ok: false, raison: "rien_trouve" };

  const content = await appelMiniMax(
    SYSTEME,
    `${utilisateur()}\nPage : ${url.href}\n\n${texte}`,
  );
  return annonceDepuisPayload(parseModelJson(content));
}

/** Texte collé : le chemin le plus court, sans fetch ni image. */
export async function extraireDeTexte(texte: string): Promise<ResultatLecture> {
  const propre = texte.trim().slice(0, MAX_TEXTE);
  if (propre.length < 20) return { ok: false, raison: "texte_trop_court" };

  const content = await appelMiniMax(SYSTEME, `${utilisateur()}\n\n${propre}`);
  return annonceDepuisPayload(parseModelJson(content));
}

/** Pose l'annonce lue dans un témoin, entre l'action qui lit et le formulaire qui affiche. */
export async function poserAnnonceCookie(annonce: AnnonceLue): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_ANNONCE, encodeURIComponent(JSON.stringify(annonce)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
}

/** Lit sans consommer : une page ne peut pas effacer un témoin (pattern de `lireSuite`). */
export async function lireAnnonceCookie(): Promise<AnnonceLue | undefined> {
  const store = await cookies();
  const brut = store.get(COOKIE_ANNONCE)?.value;
  if (!brut) return undefined;
  try {
    const lu = z
      .object({
        titre: z.string().min(1),
        debut: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
        fin: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
        lieu: z.string().min(1).optional(),
      })
      .safeParse(JSON.parse(decodeURIComponent(brut)));
    return lu.success ? lu.data : undefined;
  } catch {
    return undefined;
  }
}
