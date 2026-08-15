/**
 * Adaptateur pour les agendas qui n'exposent aucune donnée structurée — typiquement les
 * sites des communes (Lancy, Onex, Carouge n'offrent ni JSON-LD ni iCal).
 *
 * La page est lue par MiniMax M3, qui en extrait des événements. Ce chemin ne publie
 * jamais directement : tout ce qui en sort attend une relecture humaine. Une date inventée
 * qui atteindrait le calendrier coûterait plus cher que l'absence de la source.
 *
 * Deux garde-fous devant les contrôles : la réponse est validée par un schéma strict, et
 * toute date hors d'une fenêtre plausible est écartée avant même d'entrer en base.
 *
 * L'année manquante se déduit désormais de la date du jour, au lieu de faire écarter
 * l'événement. C'est ce qui rendait Lancy muette : sa liste écrit « Vendredi 14 août, 21h00 »
 * sans année, et la consigne d'alors interdisait de rendre un événement dont l'année n'était
 * pas écrite. Six activités sur dix-sept passaient, toutes celles dont le titre portait un
 * millésime. Ce relâchement n'est tenable que depuis les contrôles : le jour et le mois, eux,
 * doivent figurer en clair sur la page.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { normaliser } from "../texte";
import { lireTarifEtAcces } from "./tarif";
import {
  clamp,
  lireTexte,
  parseAgeRange,
  USER_AGENT,
  type Adapter,
  type RawEvent,
} from "./types";

const MINIMAX_URL = "https://api.minimax.io/v1/chat/completions";
const MINIMAX_MODEL = "MiniMax-M3";

/**
 * Fenêtre de plausibilité. Le futur se mesure sur le début — rien ne commence dans deux
 * ans. Le passé se mesure sur la fin : une activité commencée en juin et ouverte jusqu'en
 * septembre est en cours, pas périmée.
 */
const FENETRE_PASSE_MS = 24 * 3_600_000;
const FENETRE_FUTUR_MS = 365 * 24 * 3_600_000;

/**
 * Un champ absent et un champ à `null` veulent dire la même chose ici : le modèle renvoie
 * volontiers `"lieu": null` plutôt que d'omettre la clé, et refuser cette forme faisait
 * échouer toute la page pour un seul événement incomplet.
 */
const texteFacultatif = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

const extractedEvent = z.object({
  titre: z.string().min(1),
  description: texteFacultatif,
  debut: z.string(),
  fin: texteFacultatif,
  lieu: texteFacultatif,
  url: texteFacultatif,
  /** Recopié tel qu'écrit sur la page (« dès 5 ans »), jamais estimé par le modèle. */
  age: texteFacultatif,
});

/**
 * Le modèle ne renvoie pas toujours la clé demandée : parfois « événements » avec accents,
 * parfois « events », parfois le tableau nu. Ces variantes disent la même chose — les
 * refuser ferait échouer une page entière pour une question d'orthographe.
 */
const listeEvenements = z.array(extractedEvent);

const extractedPayload = z
  .union([
    z.object({ evenements: listeEvenements }),
    z.object({ événements: listeEvenements }),
    z.object({ events: listeEvenements }),
    listeEvenements.transform((evenements) => ({ evenements })),
    // Une page qui n'annonce qu'un événement se voit répondre par l'objet seul, sans
    // enveloppe ni tableau. Placée en dernier, cette forme n'éclipse aucune des autres :
    // elle exige `titre` et `debut`, qu'aucune enveloppe ne porte à sa racine.
    extractedEvent.transform((evenement) => ({ evenements: [evenement] })),
  ])
  .transform((v) =>
    "evenements" in v
      ? v
      : { evenements: "événements" in v ? v["événements"] : v.events },
  );

function apiKey(): string {
  if (process.env.MINIMAX_API_KEY) return process.env.MINIMAX_API_KEY.trim();
  try {
    return readFileSync(join(homedir(), ".config", "minimax", "api_key"), "utf8").trim();
  } catch {
    throw new Error(
      "Clé MiniMax introuvable — définir MINIMAX_API_KEY ou ~/.config/minimax/api_key",
    );
  }
}

/** Réduit une page à son texte lisible : le modèle n'a pas besoin du balisage. */
export function htmlToText(html: string, max = 30_000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * MiniMax M3 est un modèle à raisonnement : sa réponse commence par un bloc `<think>` et
 * peut être entourée d'une clôture markdown. On isole donc l'objet JSON plutôt que de
 * supposer que la réponse en est un.
 */
export function parseModelJson(content: string): unknown {
  const nettoye = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    // La balise ouvrante manque parfois, la fermante reste. Sans cette ligne, le raisonnement
    // survit au nettoyage — et il pèse dix fois la réponse, brouillons JSON compris : c'est
    // un brouillon qui serait lu à la place de la réponse.
    .replace(/^[\s\S]*?<\/think>/i, "")
    .replace(/<think>[\s\S]*/i, "")
    .replace(/```(?:json)?/gi, "")
    .trim();

  // Le modèle répond tantôt par l'objet demandé, tantôt par le tableau nu — forme que le
  // schéma accepte plus bas. Ne chercher que l'accolade rendait alors le premier événement
  // du tableau, que plus rien ne pouvait valider.
  //
  // On essaie chaque ouvrant dans l'ordre et on garde le premier qui se lit vraiment : une
  // énumération en prose (« voici [les activités] : ») ouvre un crochet qui n'est pas du
  // JSON, et s'arrêter au premier ouvrant venu ferait échouer la page entière sur ce détail.
  let ouvrants = 0;
  let complets = 0;

  for (let debut = 0; debut < nettoye.length; debut += 1) {
    const ouvrant = nettoye[debut];
    if (ouvrant !== "{" && ouvrant !== "[") continue;

    const bloc = blocEquilibre(nettoye, debut);
    if (bloc) {
      complets += 1;
      try {
        return JSON.parse(bloc);
      } catch {
        // Du texte qui ressemblait à du JSON : on continue plus loin.
      }
    }

    ouvrants += 1;
    // Garde-fou : un raisonnement qui aurait échappé au nettoyage contient des dizaines de
    // brouillons, et chaque tentative relit la réponse. Au-delà, ce n'est plus une réponse.
    if (ouvrants > 20) break;
  }

  // Les trois cas ne se diagnostiquent pas pareil : rien à lire, une réponse coupée en
  // route — le raisonnement de M3 mange l'essentiel du quota de sortie —, ou du texte qui
  // ouvrait une accolade sans jamais former du JSON.
  if (ouvrants === 0) throw new Error("MiniMax : aucun objet JSON dans la réponse");
  if (complets === 0) {
    throw new Error("MiniMax : objet JSON incomplet dans la réponse — réponse coupée ?");
  }
  throw new Error("MiniMax : aucun objet JSON lisible dans la réponse");
}

/**
 * Rend le bloc JSON qui s'ouvre à `debut`, accolades et crochets équilibrés, ou `null` s'il
 * ne se referme jamais. On suit la profondeur plutôt que de prendre jusqu'au dernier
 * caractère : le modèle ajoute parfois une phrase après l'objet, et une accolade dans cette
 * phrase suffisait à rendre l'extraction invalide. Ce qui est entre guillemets est ignoré.
 */
function blocEquilibre(texte: string, debut: number): string | null {
  let profondeur = 0;
  let dansUneChaine = false;
  let echappe = false;

  for (let i = debut; i < texte.length; i += 1) {
    const c = texte[i];

    if (dansUneChaine) {
      if (echappe) echappe = false;
      else if (c === "\\") echappe = true;
      else if (c === '"') dansUneChaine = false;
      continue;
    }

    if (c === '"') dansUneChaine = true;
    else if (c === "{" || c === "[") profondeur += 1;
    else if (c === "}" || c === "]") {
      profondeur -= 1;
      if (profondeur === 0) return texte.slice(debut, i + 1);
    }
  }

  return null;
}

const SYSTEME = [
  "Tu extrais des événements d'une page d'agenda communal suisse romand.",
  "Réponds uniquement par un objet JSON, sans texte autour, de la forme :",
  '{"evenements":[{"titre":"...","description":"...","debut":"2026-01-04T14:00:00+01:00","fin":"...","lieu":"...","url":"..."}]}',
  "Règles strictes :",
  "- N'invente jamais une date. Si le jour ou le mois d'un événement est absent, ne le retourne pas.",
  "- Les dates sont au format ISO 8601 avec fuseau horaire, heure de Genève (+01:00 en hiver, +02:00 en été).",
  "- Si l'année n'est pas écrite à côté de la date, déduis-la de la date du jour : prends la",
  "  prochaine occurrence du jour et du mois annoncés.",
  "- Ne retourne que des événements ouverts au public, susceptibles d'intéresser des familles avec enfants.",
  "- La description recopie une phrase de la page. Si la page n'en donne pas, omets le champ :",
  "  ne résume pas, ne complète pas de mémoire.",
  "- Le champ « age » recopie mot pour mot la tranche d'âge écrite sur la page (« dès 5 ans »,",
  "  « 3-6 ans »). Si la page n'en indique pas, omets le champ : ne l'estime jamais.",
  "- Si la page ne contient aucun événement exploitable, réponds {\"evenements\":[]}.",
].join("\n");

export async function extractEventsWithMiniMax(
  pageText: string,
  pageUrl: string,
): Promise<RawEvent[]> {
  const response = await fetch(MINIMAX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEME },
        {
          role: "user",
          content: `Page : ${pageUrl}\nDate du jour : ${new Date().toISOString()}\n\n${pageText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`MiniMax : HTTP ${response.status} ${await lireTexte(response, 500)}`);
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("MiniMax : réponse vide");

  // La page lue repart avec chaque activité : c'est elle que les contrôles reliront pour
  // vérifier que la date, le titre et le lieu annoncés y figurent vraiment.
  return eventsFromPayload(parseModelJson(content), pageUrl).map((event) => ({
    ...event,
    texteSource: pageText,
  }));
}

/** Le jour d'une date à l'heure de Genève : « 2026-09-12 ». */
function jourGenevois(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * L'identité d'une activité chez une source sans identifiant.
 *
 * Le titre normalisé et le jour, sans l'heure. Une commune qui corrige un horaire, une
 * majuscule ou un accent parle de la même sortie : la faire entrer sous une nouvelle
 * identité créerait un doublon et laisserait l'ancienne version publiée à côté. Le jour
 * suffit à séparer deux occurrences d'un rendez-vous hebdomadaire.
 */
export function identiteLue(titre: string, debut: Date): string {
  return clamp(`${normaliser(titre)}|${jourGenevois(debut)}`, 200)!;
}

/**
 * Valide ce que le modèle a rendu, puis le met en forme. Fonction pure : c'est elle que
 * les tests verrouillent.
 */
export function eventsFromPayload(
  brut: unknown,
  pageUrl: string,
  maintenant = Date.now(),
): RawEvent[] {
  const parsed = extractedPayload.safeParse(brut);
  if (!parsed.success) {
    // Sans extrait, on ignore ce que le modèle a dit ; sans la forme reçue, on ignore où
    // regarder. « Invalid input » est tout ce que zod dit d'une union dont aucune branche
    // n'a pris, et ne distingue pas une enveloppe absente d'un champ fautif.
    const forme = Array.isArray(brut)
      ? `tableau de ${brut.length}`
      : brut && typeof brut === "object"
        ? `objet {${Object.keys(brut).slice(0, 8).join(", ")}}`
        : typeof brut;
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "racine"} : ${i.message}`)
      .join(" ; ");
    throw new Error(
      `MiniMax : réponse hors format — reçu ${forme} — ${detail} — ` +
        JSON.stringify(brut).slice(0, 500),
    );
  }

  const events: RawEvent[] = [];

  for (const evenement of parsed.data.evenements) {
    const startsAt = new Date(evenement.debut);
    if (Number.isNaN(startsAt.getTime())) continue;
    if (startsAt.getTime() - maintenant > FENETRE_FUTUR_MS) continue;

    const fin = evenement.fin ? new Date(evenement.fin) : undefined;
    const endsAt = fin && !Number.isNaN(fin.getTime()) ? fin : undefined;

    // Le passé se mesure sur la fin. Écarter tout ce qui a commencé hier vidait l'agenda
    // de ses activités régulières : sur dix-sept activités lancéennes, treize tombaient,
    // dont neuf encore ouvertes — expositions, marchés hebdomadaires, cours de l'année.
    // Le calendrier sait déjà les présenter comme « en cours ».
    if ((endsAt ?? startsAt).getTime() - maintenant < -FENETRE_PASSE_MS) continue;

    events.push({
      // Le titre et le jour font l'identité : beaucoup de pages d'agenda communal
      // renvoient la même URL pour tous leurs événements, qui s'écraseraient sinon.
      externalId: identiteLue(evenement.titre, startsAt),
      title: clamp(evenement.titre, 120)!,
      description: clamp(evenement.description, 280),
      startsAt,
      endsAt,
      placeLabel: clamp(evenement.lieu, 120),
      url: clamp(evenement.url ?? pageUrl, 500),
      ...parseAgeRange(evenement.age),
      // Lu dans ce que le modèle a recopié, par mots exacts. Le modèle n'a pas son mot à
      // dire sur le prix : on ne lui demande pas de conclure, on relit ce qu'il a copié.
      ...lireTarifEtAcces(evenement.titre, evenement.description),
    });
  }

  return events;
}

/**
 * Les liens de fiche d'une page de liste, rangés par le libellé qu'ils portent.
 *
 * `htmlToText` retire toutes les balises avant d'envoyer la page au modèle : les `href`
 * n'arrivent jamais jusqu'à lui, et il ne peut donc pas rendre un lien qu'il n'a pas vu.
 * On les récupère donc ici, dans le HTML brut, et on les rapproche des titres après coup.
 * C'est déterministe : aucun lien ne sort d'une invention.
 *
 * `motif` écarte la navigation du site, qui porte elle aussi des libellés longs. Sans lui,
 * « Bibliobus » tombait sur la page du bibliobus scolaire au lieu de la fiche d'agenda.
 */
export function ancresDeFiches(html: string, base: string, motif: string): Map<string, string> {
  const liens = new Map<string, string>();

  for (const [, href, contenu] of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!href.includes(motif)) continue;

    const libelle = normaliser(htmlToText(contenu, 200));
    if (!libelle) continue;

    try {
      const url = new URL(href, base).toString();
      if (!liens.has(libelle)) liens.set(libelle, url);
    } catch {
      // Un href relatif illisible ne vaut pas la peine d'arrêter la lecture.
    }
  }

  return liens;
}

/**
 * Le lien de la fiche qui porte ce titre.
 *
 * Deux formes acceptées, et pas une de plus : le libellé du lien est le titre, ou il
 * commence par lui. Lancy écrit le titre seul, Vernier le fait suivre de la date et du
 * début de la description. Chercher le titre n'importe où dans le libellé ouvrirait la
 * porte à un mauvais lien, et un parent envoyé sur la mauvaise activité est plus mal servi
 * que celui qu'on renvoie à la page de la commune.
 */
export function lienDeLActivite(
  liens: Map<string, string>,
  titre: string,
): string | undefined {
  const cible = normaliser(titre);
  if (cible.length < 3) return undefined;

  const exact = liens.get(cible);
  if (exact) return exact;

  for (const [libelle, url] of liens) {
    if (libelle.startsWith(cible)) return url;
  }

  return undefined;
}

type MiniMaxConfig = {
  /**
   * Nombre de pages de liste à lire. Les pages sont réunies en un seul appel au modèle :
   * une page de plus coûte quelques milliers de caractères de contexte, pas un appel.
   */
  maxPages?: number;
  /**
   * Fragment que doit contenir un lien pour désigner une fiche d'activité. Absent, on ne
   * cherche pas de lien et chaque activité renvoie à la page de liste, comme avant.
   */
  itemPattern?: string;
};

/**
 * Ne garde d'une page que ce qui la distingue de la première. Menu de navigation et pied
 * de page se répètent à l'identique et pèsent plus lourd que la liste d'événements
 * elle-même ; les répéter noierait les activités dans le décor du site.
 *
 * Rend une chaîne vide quand la page n'apporte rien de neuf — c'est ainsi qu'on reconnaît
 * un site qui ignore le paramètre `page`, ou une pagination épuisée.
 */
export function sansPartieCommune(reference: string, texte: string): string {
  let debut = 0;
  while (debut < reference.length && debut < texte.length && reference[debut] === texte[debut]) {
    debut += 1;
  }

  let fin = 0;
  while (
    fin < reference.length - debut &&
    fin < texte.length - debut &&
    reference[reference.length - 1 - fin] === texte[texte.length - 1 - fin]
  ) {
    fin += 1;
  }

  // Page identique à la première : rien de neuf, et rien à reculer.
  if (debut >= texte.length - fin) return "";

  // Les deux coupes reculent jusqu'au blanc le plus proche. « Aquafitness » et « Aquabike »
  // partagent quatre lettres, que la coupe au caractère près retirerait au titre de la
  // seconde page : garder un mot de trop ne coûte rien, en amputer un fait lire une
  // activité de travers.
  while (debut > 0 && !/\s/.test(texte[debut - 1])) debut -= 1;
  while (fin > 0 && !/\s/.test(texte[texte.length - fin])) fin -= 1;

  return texte.slice(debut, texte.length - fin).trim();
}

/**
 * Les agendas communaux paginent : Onex n'affiche que neuf entrées sur cent quinze, Lancy
 * en garde autant pour la page suivante. Lire la seule première page revenait à ignorer
 * l'essentiel de l'agenda — et, à Onex, à ne voir qu'une page de cours de fitness pour
 * adultes que le modèle écarte à raison, d'où une source « ok » qui ne rapportait rien.
 */
async function lirePages(
  url: string,
  maxPages: number,
  motif: string | undefined,
): Promise<{ texte: string; liens: Map<string, string> }> {
  const pages: string[] = [];
  const liens = new Map<string, string>();

  for (let page = 0; page < maxPages; page += 1) {
    const pageUrl = new URL(url);
    // Convention des deux communes, et déjà celle de l'adaptateur JSON-LD : la première
    // page est l'URL nue, les suivantes portent ?page=1, ?page=2…
    if (page > 0) pageUrl.searchParams.set("page", String(page));

    // La première page fait la source : si elle tombe, la source a échoué. Les suivantes
    // sont un supplément — une pagination épuisée ne répond pas toujours par un 200, et un
    // réseau capricieux ne doit pas faire perdre les pages déjà lues.
    let reponse: Response;
    try {
      reponse = await fetch(pageUrl, { headers: { "User-Agent": USER_AGENT } });
    } catch (erreur) {
      if (page === 0) throw erreur;
      break;
    }

    if (!reponse.ok) {
      if (page === 0) throw new Error(`${url} : HTTP ${reponse.status}`);
      break;
    }

    const html = await lireTexte(reponse);
    if (motif) {
      for (const [libelle, lien] of ancresDeFiches(html, pageUrl.toString(), motif)) {
        if (!liens.has(libelle)) liens.set(libelle, lien);
      }
    }

    const texte = htmlToText(html);
    const utile = page === 0 ? texte : sansPartieCommune(pages[0], texte);
    if (!utile) break;
    pages.push(utile);
  }

  return { texte: pages.join("\n\n---\n\n").slice(0, 30_000), liens };
}

export const minimaxAdapter: Adapter = async (source) => {
  const config = (source.config ?? {}) as MiniMaxConfig;
  const maxPages = Math.min(Math.max(config.maxPages ?? 3, 1), 15);

  const { texte, liens } = await lirePages(source.url, maxPages, config.itemPattern);
  const events = await extractEventsWithMiniMax(texte, source.url);

  // Le lien de la fiche remplace celui de la liste quand on l'a retrouvé. Sinon rien ne
  // change : mieux vaut la page de la commune qu'une adresse devinée.
  return events.map((event) => {
    const lien = lienDeLActivite(liens, event.title);
    return lien ? { ...event, url: clamp(lien, 500) } : event;
  });
};
