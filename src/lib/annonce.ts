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

import { lookup } from "node:dns/promises";

import { cookies } from "next/headers";
import { z } from "zod";

import {
  FENETRE_FUTUR_MS,
  FENETRE_PASSE_MS,
  appelMiniMax,
  htmlToText,
  parseModelJson,
} from "./ingest/minimax";
import { TAILLE_MAX_REPONSE, USER_AGENT, lireTexte } from "./ingest/types";
import { UN_QUART_D_HEURE, poserTemoin } from "./session";

/** Le témoin qui porte l'annonce lue de l'action vers le formulaire. Un quart d'heure. */
const COOKIE_ANNONCE = "totir_annonce";
const MAX_IMAGE_OCTETS = 8 * 1024 * 1024;
const MIMES_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_TEXTE = 30_000;

/**
 * Un parent attend devant un bouton : au-delà, on lui rend la main plutôt que de garder
 * l'appel ouvert. Une affiche de cinq mégaoctets se lit en une dizaine de secondes.
 */
const MODELE_TIMEOUT_MS = 45_000;
/** Une page publique répond en quelques secondes ; on ne suit pas une chaîne sans fin. */
const PAGE_TIMEOUT_MS = 15_000;
const REDIRECTIONS_MAX = 5;

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
  | "date_invraisemblable"
  /** Le modèle n'a pas répondu (clé absente, quota, panne) : ce n'est pas l'annonce. */
  | "indisponible";

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
 * Une adresse IP qui n'a rien à faire dans un lien public : boucle locale, réseaux privés,
 * lien local (dont 169.254.169.254, les métadonnées d'un hébergeur), non spécifiée.
 *
 * Reçoit l'adresse telle que `new URL()` ou `dns.lookup` la donnent. Une IPv6 mappée sur
 * IPv4 (« ::ffff:7f00:1 » pour 127.0.0.1) est ramenée à son IPv4 avant d'être jugée : sans
 * cela, elle échappait aux deux listes et ouvrait la boucle locale.
 */
export function adressePrivee(adresse: string): boolean {
  let ip = adresse.toLowerCase().replace(/^\[|\]$/g, "");

  const mappee = /^::ffff:(.+)$/.exec(ip);
  if (mappee) {
    const reste = mappee[1];
    if (reste.includes(".")) {
      ip = reste;
    } else {
      // Deux groupes hexadécimaux : « 7f00:1 » → 127.0.0.1.
      const [haut = "0", bas = "0"] = reste.split(":");
      const h = parseInt(haut, 16);
      const b = parseInt(bas, 16);
      ip = `${h >> 8}.${h & 255}.${b >> 8}.${b & 255}`;
    }
  }

  if (ip.includes(":")) {
    // IPv6 : boucle (::1), non spécifiée (::), lien local (fe80::/10), unique locale (fc00::/7).
    return ip === "::1" || ip === "::" || /^fe[89ab]/.test(ip) || /^f[cd]/.test(ip);
  }
  return /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

/**
 * Garde-fou SSRF : l'URL vient d'un utilisateur, le fetch part du serveur. On refuse tout
 * ce qui n'est pas http(s), et tout hôte qui sonne local ou privé. Ce contrôle est
 * syntaxique et synchrone ; `hoteResoutEnPublic` vérifie ensuite ce que le DNS en fait,
 * et `extraireDeLien` repasse les deux à chaque redirection.
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
  if (adressePrivee(hote)) return null;
  return url;
}

/**
 * Le nom résout-il vers des adresses publiques, et rien d'autre ?
 *
 * Un nom DNS qui pointe vers 127.0.0.1 ou vers le réseau interne passerait le contrôle
 * syntaxique. On résout donc avant d'ouvrir, et toutes les réponses doivent être publiques.
 * Un nom introuvable est refusé comme un nom privé. Un littéral IP se juge sans DNS.
 */
export async function hoteResoutEnPublic(url: URL): Promise<boolean> {
  const hote = url.hostname;
  if (hote.startsWith("[") || /^\d+(\.\d+){3}$/.test(hote)) return !adressePrivee(hote);
  try {
    const adresses = await lookup(hote, { all: true });
    return adresses.length > 0 && adresses.every((a) => !adressePrivee(a.address));
  } catch {
    return false;
  }
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
  const content = await appelMiniMax(
    SYSTEME,
    `${utilisateur()}\n\nVoici la photo d'une annonce.`,
    { image: { mime: fichier.type, base64 }, timeoutMs: MODELE_TIMEOUT_MS },
  );
  return annonceDepuisPayload(parseModelJson(content));
}

/**
 * Ouvre une page publique en suivant les redirections une à une.
 *
 * `redirect: "follow"` aurait suivi vers n'importe où : le contrôle SSRF ne portait que
 * sur l'adresse tapée, et une page publique qui renvoie vers 169.254.169.254 aurait été
 * lue depuis le serveur. Chaque saut repasse donc les deux contrôles, syntaxique et DNS.
 * Null si un saut est refusé, si la chaîne est trop longue, ou si la page ne répond pas.
 */
async function ouvrirPagePublique(depart: URL): Promise<Response | null> {
  let url = depart;
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut += 1) {
    if (!(await hoteResoutEnPublic(url))) return null;

    let reponse: Response;
    try {
      reponse = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        redirect: "manual",
      });
    } catch {
      return null;
    }

    if (reponse.status >= 300 && reponse.status < 400) {
      await reponse.body?.cancel().catch(() => undefined);
      const destination = reponse.headers.get("location");
      const suivante = destination ? urlPubliqueSure(new URL(destination, url).href) : null;
      if (!suivante) return null;
      url = suivante;
      continue;
    }
    return reponse;
  }
  return null;
}

/** Lien vers une page : fetch côté serveur (URL filtrée), puis lecture du texte. */
export async function extraireDeLien(lien: string): Promise<ResultatLecture> {
  const url = urlPubliqueSure(lien);
  if (!url) return { ok: false, raison: "lien_invalide" };

  const reponse = await ouvrirPagePublique(url);
  if (!reponse || !reponse.ok) return { ok: false, raison: "lien_invalide" };

  // Une page d'annonce est du HTML ou du texte. Un PDF ou une image passerait par
  // `htmlToText` pour ne donner que du bruit, après avoir été lu en entier.
  const type = reponse.headers.get("content-type") ?? "";
  if (!/^(text\/|application\/xhtml)/i.test(type)) {
    await reponse.body?.cancel().catch(() => undefined);
    return { ok: false, raison: "lien_invalide" };
  }

  // `lireTexte` s'arrête à deux mégaoctets et referme la connexion, comme pour les
  // sources de l'agenda : ce qu'on lit d'un site inconnu a un plafond.
  const texte = htmlToText(await lireTexte(reponse, TAILLE_MAX_REPONSE), MAX_TEXTE);
  if (texte.length < 40) return { ok: false, raison: "rien_trouve" };

  const content = await appelMiniMax(
    SYSTEME,
    `${utilisateur()}\nPage : ${reponse.url || url.href}\n\n${texte}`,
    { timeoutMs: MODELE_TIMEOUT_MS },
  );
  return annonceDepuisPayload(parseModelJson(content));
}

/** Texte collé : le chemin le plus court, sans fetch ni image. */
export async function extraireDeTexte(texte: string): Promise<ResultatLecture> {
  const propre = texte.trim().slice(0, MAX_TEXTE);
  if (propre.length < 20) return { ok: false, raison: "texte_trop_court" };

  const content = await appelMiniMax(SYSTEME, `${utilisateur()}\n\n${propre}`, {
    timeoutMs: MODELE_TIMEOUT_MS,
  });
  return annonceDepuisPayload(parseModelJson(content));
}

/** Pose l'annonce lue dans un témoin, entre l'action qui lit et le formulaire qui affiche. */
export async function poserAnnonceCookie(annonce: AnnonceLue): Promise<void> {
  await poserTemoin(
    COOKIE_ANNONCE,
    encodeURIComponent(JSON.stringify(annonce)),
    UN_QUART_D_HEURE,
  );
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
