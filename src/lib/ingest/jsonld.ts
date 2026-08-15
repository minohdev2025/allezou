/**
 * Adaptateur pour les agendas qui exposent du schema.org `Event` en JSON-LD.
 *
 * C'est le cas de l'agenda de la Ville de Genève : la page de liste n'expose rien, mais
 * chaque fiche d'événement contient un bloc JSON-LD complet (titre, dates, lieu, adresse).
 * On parcourt donc la liste filtrée « Enfants et famille », on suit les fiches, et on lit
 * la donnée structurée — aucune interprétation, aucune date inventée.
 */

import { lireTarifEtAcces, type Tarif } from "./tarif";
import {
  clamp,
  lireTexte,
  parseAgeRange,
  USER_AGENT,
  type Adapter,
  type RawEvent,
} from "./types";

/**
 * Combien de fiches on accepte de suivre en un passage.
 *
 * Une page de liste donne une trentaine de liens ; une page reprise par quelqu'un d'autre
 * pourrait en donner dix mille, et on les demanderait un par un. Ce qui est laissé de côté
 * est dit à voix haute : un plafond silencieux se lit comme une couverture complète.
 */
const FICHES_MAX = 200;

type JsonLdConfig = {
  /** Fragment que doit contenir un lien pour être considéré comme une fiche d'événement. */
  itemPattern?: string;
  /** Nombre de pages de liste à parcourir. Volontairement bas : on veut les prochains jours. */
  maxPages?: number;
};

type Offre = { price?: string | number; priceCurrency?: string };

type JsonLdEvent = {
  "@type"?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  typicalAgeRange?: string;
  location?: { name?: string; address?: { streetAddress?: string } };
  isAccessibleForFree?: boolean;
  offers?: Offre | Offre[];
};

/**
 * Ce que schema.org déclare du prix, quand il le déclare. Rend `null` quand la fiche n'en
 * dit rien : c'est alors au texte de répondre, et à lui seul.
 */
function tarifDeclare(event: JsonLdEvent): Tarif | null {
  if (typeof event.isAccessibleForFree === "boolean") {
    return event.isAccessibleForFree ? "gratuit" : "payant";
  }

  const montants = [event.offers ?? []]
    .flat()
    .map((offre) => Number(offre?.price))
    .filter((montant) => Number.isFinite(montant));

  if (montants.length === 0) return null;
  return montants.some((montant) => montant > 0) ? "payant" : "gratuit";
}

function extractJsonLd(html: string): unknown[] {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const out: unknown[] = [];
  for (const block of blocks) {
    try {
      out.push(JSON.parse(block[1]));
    } catch {
      // Un bloc illisible n'invalide pas les autres.
    }
  }
  return out;
}

/** Aplatit @graph et les tableaux pour retrouver les nœuds de type Event. */
function findEvents(node: unknown, found: JsonLdEvent[] = []): JsonLdEvent[] {
  if (Array.isArray(node)) {
    for (const item of node) findEvents(item, found);
    return found;
  }
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (typeof record["@type"] === "string" && record["@type"] === "Event") {
      found.push(record as JsonLdEvent);
    }
    if (record["@graph"]) findEvents(record["@graph"], found);
  }
  return found;
}

function toRawEvent(event: JsonLdEvent, pageUrl: string): RawEvent | null {
  if (!event.name || !event.startDate) return null;

  const startsAt = new Date(event.startDate);
  if (Number.isNaN(startsAt.getTime())) return null;

  // « 2026-09-12 » sans partie horaire : la fiche annonce un jour, pas un rendez-vous.
  const journeeEntiere = /^\d{4}-\d{2}-\d{2}$/.test(event.startDate.trim());

  const endsAt = event.endDate ? new Date(event.endDate) : undefined;

  /*
    Le nom du lieu, et rien de plus.

    Coller l'adresse postale derrière donnait « Musée d'art et d'histoire, Rue
    Charles-GALLAND 2 » : deux lignes sur un téléphone, avec un patronyme en capitales tel
    que la source l'écrit. Un parent genevois sait où est le Muséum ; l'adresse complète est
    à un lien de là, sur le site de l'organisateur. L'adresse ne sert que si le lieu n'a pas
    de nom du tout.
  */
  const lieu = event.location?.name || event.location?.address?.streetAddress;

  // schema.org expose parfois `typicalAgeRange` ; sinon la tranche est écrite en toutes
  // lettres dans la description (« dès 5 ans »). On ne devine rien au-delà.
  const age = event.typicalAgeRange
    ? parseAgeRange(event.typicalAgeRange)
    : parseAgeRange(event.description);

  const lu = lireTarifEtAcces(event.name, event.description);

  return {
    externalId: event.url ?? pageUrl,
    title: clamp(event.name, 120)!,
    description: clamp(event.description, 280),
    startsAt,
    endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : undefined,
    placeLabel: clamp(lieu, 120),
    url: clamp(event.url ?? pageUrl, 500),
    ...age,
    // Ce que la fiche déclare l'emporte sur ce que sa description raconte.
    tarif: tarifDeclare(event) ?? lu.tarif,
    acces: lu.acces,
    allDay: journeeEntiere,
  };
}

/** Extrait les événements d'une fiche. Fonction pure : c'est elle que les tests verrouillent. */
export function eventsFromHtml(html: string, pageUrl: string): RawEvent[] {
  const events: RawEvent[] = [];
  for (const bloc of extractJsonLd(html)) {
    for (const event of findEvents(bloc)) {
      const raw = toRawEvent(event, pageUrl);
      if (raw) events.push(raw);
    }
  }
  return events;
}

export const jsonLdAdapter: Adapter = async (source) => {
  const config = (source.config ?? {}) as JsonLdConfig;
  const itemPattern = config.itemPattern ?? "/agenda/";
  const maxPages = Math.min(config.maxPages ?? 3, 20);

  const base = new URL(source.url);
  const liens = new Set<string>();

  for (let page = 0; page < maxPages; page += 1) {
    const listUrl = new URL(source.url);
    if (page > 0) listUrl.searchParams.set("page", String(page));

    const html = await fetch(listUrl, { headers: { "User-Agent": USER_AGENT } }).then((r) => {
      if (!r.ok) throw new Error(`liste ${listUrl} : HTTP ${r.status}`);
      return lireTexte(r);
    });

    const avant = liens.size;
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const href = match[1];
      if (!href.includes(itemPattern)) continue;
      liens.add(new URL(href, base).toString());
    }
    // Plus rien de nouveau : la pagination est épuisée.
    if (liens.size === avant) break;
  }

  const aSuivre = [...liens].slice(0, FICHES_MAX);
  if (liens.size > FICHES_MAX) {
    console.warn(
      `${source.name} : ${liens.size} fiches annoncées, ${FICHES_MAX} suivies. ` +
        "Le motif de lien attrape peut-être plus que des activités.",
    );
  }

  const events: RawEvent[] = [];
  for (const lien of aSuivre) {
    try {
      const html = await fetch(lien, { headers: { "User-Agent": USER_AGENT } }).then((r) =>
        r.ok ? lireTexte(r) : "",
      );
      if (!html) continue;
      events.push(...eventsFromHtml(html, lien));
    } catch {
      // Une fiche illisible ne fait pas échouer la source entière.
    }
  }

  return events;
};
