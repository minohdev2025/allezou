/**
 * Adaptateur pour les agendas qui n'exposent aucune donnée structurée — typiquement les
 * sites des communes (Lancy, Onex, Carouge n'offrent ni JSON-LD ni iCal).
 *
 * La page est lue par MiniMax M3, qui en extrait des événements. Ce chemin ne publie
 * jamais directement : tout ce qui en sort attend une relecture humaine. Une date inventée
 * qui atteindrait le calendrier coûterait plus cher que l'absence de la source.
 *
 * Deux garde-fous en plus de la relecture : la réponse est validée par un schéma strict,
 * et toute date hors d'une fenêtre plausible est écartée avant même d'arriver en file.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { clamp, parseAgeRange, USER_AGENT, type Adapter, type RawEvent } from "./types";

const MINIMAX_URL = "https://api.minimax.io/v1/chat/completions";
const MINIMAX_MODEL = "MiniMax-M3";

/** Fenêtre de plausibilité : hier au plus tôt, un an au plus tard. */
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
    .replace(/<think>[\s\S]*/i, "")
    .replace(/```(?:json)?/gi, "")
    .trim();

  const debut = nettoye.indexOf("{");
  if (debut === -1) throw new Error("MiniMax : aucun objet JSON dans la réponse");

  // On suit la profondeur des accolades plutôt que de prendre jusqu'à la dernière : le
  // modèle ajoute parfois une phrase après l'objet, et une accolade dans cette phrase
  // suffisait à rendre l'extraction invalide. Les accolades entre guillemets sont ignorées.
  let profondeur = 0;
  let dansUneChaine = false;
  let echappe = false;

  for (let i = debut; i < nettoye.length; i += 1) {
    const c = nettoye[i];

    if (dansUneChaine) {
      if (echappe) echappe = false;
      else if (c === "\\") echappe = true;
      else if (c === '"') dansUneChaine = false;
      continue;
    }

    if (c === '"') dansUneChaine = true;
    else if (c === "{") profondeur += 1;
    else if (c === "}") {
      profondeur -= 1;
      if (profondeur === 0) return JSON.parse(nettoye.slice(debut, i + 1));
    }
  }

  throw new Error("MiniMax : objet JSON incomplet dans la réponse");
}

const SYSTEME = [
  "Tu extrais des événements d'une page d'agenda communal suisse romand.",
  "Réponds uniquement par un objet JSON, sans texte autour, de la forme :",
  '{"evenements":[{"titre":"...","description":"...","debut":"2026-01-04T14:00:00+01:00","fin":"...","lieu":"...","url":"..."}]}',
  "Règles strictes :",
  "- N'invente jamais une date. Si la date d'un événement est absente ou ambiguë, ne le retourne pas.",
  "- Les dates sont au format ISO 8601 avec fuseau horaire, heure de Genève (+01:00 en hiver, +02:00 en été).",
  "- Si l'année n'est pas écrite sur la page, ne retourne pas l'événement.",
  "- Ne retourne que des événements ouverts au public, susceptibles d'intéresser des familles avec enfants.",
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
    throw new Error(`MiniMax : HTTP ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("MiniMax : réponse vide");

  const brut = parseModelJson(content);
  const parsed = extractedPayload.safeParse(brut);
  if (!parsed.success) {
    // L'extrait rend l'erreur exploitable : sans lui, on ne sait pas ce que le modèle a dit.
    const extrait = JSON.stringify(brut).slice(0, 200);
    throw new Error(
      `MiniMax : réponse hors format (${parsed.error.issues[0]?.message}) — ${extrait}`,
    );
  }

  const maintenant = Date.now();
  const events: RawEvent[] = [];

  for (const brut of parsed.data.evenements) {
    const startsAt = new Date(brut.debut);
    if (Number.isNaN(startsAt.getTime())) continue;

    const ecart = startsAt.getTime() - maintenant;
    if (ecart < -FENETRE_PASSE_MS || ecart > FENETRE_FUTUR_MS) continue;

    const endsAt = brut.fin ? new Date(brut.fin) : undefined;

    events.push({
      // Le titre et la date font l'identité : beaucoup de pages d'agenda communal
      // renvoient la même URL pour tous leurs événements, qui s'écraseraient sinon.
      externalId: clamp(`${brut.titre}|${startsAt.toISOString()}`, 200)!,
      title: clamp(brut.titre, 120)!,
      description: clamp(brut.description, 280),
      startsAt,
      endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : undefined,
      placeLabel: clamp(brut.lieu, 120),
      url: clamp(brut.url ?? pageUrl, 500),
      ...parseAgeRange(brut.age),
    });
  }

  return events;
}

export const minimaxAdapter: Adapter = async (source) => {
  const html = await fetch(source.url, { headers: { "User-Agent": USER_AGENT } }).then((r) => {
    if (!r.ok) throw new Error(`${source.url} : HTTP ${r.status}`);
    return r.text();
  });

  return extractEventsWithMiniMax(htmlToText(html), source.url);
};
