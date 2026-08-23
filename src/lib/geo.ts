/**
 * Trouver où est un lieu, une fois pour toutes.
 *
 * Un lien de carte bâti sur une recherche textuelle tombe à peu près : « Maison de quartier »
 * existe dans dix communes. Avec des coordonnées, il tombe sur le bon point, dans
 * l'application de cartes que le parent utilise déjà, avec son trafic et ses horaires de bus.
 *
 * Le géocodage se fait ici, sur le serveur, jamais depuis le téléphone d'un parent : la
 * position d'un parc est une information publique, la liste des parcs qu'une famille consulte
 * ne l'est pas. Le résultat est gardé en base, donc chaque adresse n'est demandée qu'une fois.
 *
 * Nominatim est un service bénévole. Sa politique d'usage demande un agent identifiable, une
 * requête par seconde au plus, et pas de rafales : les trois sont respectés ici, et la date de
 * tentative empêche de redemander éternellement une adresse introuvable.
 */

import { and, isNull, isNotNull, or, sql } from "drizzle-orm";

import { db } from "./db";
import * as s from "./db/schema";
import { USER_AGENT } from "./ingest/types";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** Une requête par seconde, comme la politique d'usage le demande. */
const PAUSE_MS = 1_100;

/** Ce qu'on géocode par passage. Le reste attend le suivant, il n'y a aucune urgence. */
export const PAR_PASSAGE = 20;

export type Coordonnees = { lat: number; lon: number };

/**
 * Ce qu'on donne à chercher.
 *
 * Le nom seul ne suffit pas, la commune seule non plus : c'est leur assemblage qui distingue
 * la Maison de quartier d'Onex de celle du Petit-Lancy.
 */
export function requeteDeLieu(
  nom: string,
  adresse?: string | null,
  commune?: string | null,
): string {
  return [nom, adresse, commune].filter(Boolean).join(", ").slice(0, 200);
}

/**
 * Demande les coordonnées d'une adresse. Rend `null` quand rien ne correspond, ce qui arrive
 * pour un nom de salle que personne n'a cartographié.
 */
export async function geocoder(requete: string): Promise<Coordonnees | null> {
  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  // Le canton est en Suisse, et « Genève » existe ailleurs dans le monde.
  url.searchParams.set("countrycodes", "ch");
  url.searchParams.set("q", requete);

  const reponse = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!reponse.ok) throw new Error(`Nominatim : HTTP ${reponse.status}`);

  const resultats = (await reponse.json()) as { lat?: string; lon?: string }[];
  const premier = resultats[0];
  if (!premier?.lat || !premier?.lon) return null;

  const lat = Number(premier.lat);
  const lon = Number(premier.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon };
}

/**
 * Les formes sous lesquelles on cherche un même lieu, dans l'ordre.
 *
 * Un sigle entre parenthèses suffit à ne rien trouver : « Musée d'ethnographie de Genève
 * (MEG) » ne rend rien, « Musée d'ethnographie de Genève » rend le boulevard Carl-Vogt. La
 * seconde forme n'est demandée que si la première a échoué : elle ne coûte donc une requête
 * que sur les lieux qu'on aurait manqués.
 */
export function variantesDeRequete(requete: string): string[] {
  const sansSigle = requete
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+,/g, ",")
    .trim();

  return sansSigle && sansSigle !== requete ? [requete, sansSigle] : [requete];
}

export type RapportGeocodage = { demandes: number; trouves: number };

const attendre = (ms: number) => new Promise((suite) => setTimeout(suite, ms));

/**
 * Donne des coordonnées à ce qui n'en a pas encore.
 *
 * Les lieux du catalogue d'abord, puis les activités de l'agenda qui annoncent un lieu. Une
 * activité sans lieu écrit n'a rien à géocoder, et une adresse déjà tentée ne repasse pas.
 */
export async function geocoderCeQuiManque(
  options: {
    limite?: number;
    /** Injectable : les tests ne sortent pas sur le réseau. */
    chercher?: (requete: string) => Promise<Coordonnees | null>;
    pause?: number;
  } = {},
): Promise<RapportGeocodage> {
  const limite = options.limite ?? PAR_PASSAGE;
  const chercher = options.chercher ?? geocoder;
  const pause = options.pause ?? PAUSE_MS;

  const rapport: RapportGeocodage = { demandes: 0, trouves: 0 };

  const lieux = await db
    .select({
      id: s.place.id,
      nom: s.place.name,
      adresse: s.place.address,
      commune: s.place.commune,
    })
    .from(s.place)
    .where(and(isNull(s.place.geocodedAt), isNull(s.place.archivedAt)))
    .limit(limite);

  for (const lieu of lieux) {
    const coord = await tenter(chercher, requeteDeLieu(lieu.nom, lieu.adresse, lieu.commune));
    rapport.demandes += 1;
    if (coord) rapport.trouves += 1;

    await db
      .update(s.place)
      .set({ lat: coord?.lat, lon: coord?.lon, geocodedAt: sql`now()` })
      .where(sql`${s.place.id} = ${lieu.id}`);

    await attendre(pause);
  }

  const reste = limite - lieux.length;
  if (reste <= 0) return rapport;

  const activites = await db
    .select({
      id: s.event.id,
      lieu: s.event.placeLabel,
      commune: s.event.commune,
    })
    .from(s.event)
    .where(
      and(
        isNull(s.event.geocodedAt),
        isNotNull(s.event.placeLabel),
        or(isNotNull(s.event.publishedAt), isNull(s.event.rejectedAt)),
      ),
    )
    .limit(reste);

  for (const activite of activites) {
    const coord = await tenter(chercher, requeteDeLieu(activite.lieu!, null, activite.commune));
    rapport.demandes += 1;
    if (coord) rapport.trouves += 1;

    await db
      .update(s.event)
      .set({ lat: coord?.lat, lon: coord?.lon, geocodedAt: sql`now()` })
      .where(sql`${s.event.id} = ${activite.id}`);

    await attendre(pause);
  }

  return rapport;
}

/**
 * Un service indisponible ne doit pas faire échouer le passage : on marque la tentative et on
 * passe au suivant. La date de tentative empêchera de revenir dessus, ce qui est le prix à
 * payer pour ne pas marteler un service bénévole en boucle.
 */
export async function tenter(
  chercher: (requete: string) => Promise<Coordonnees | null>,
  requete: string,
): Promise<Coordonnees | null> {
  for (const variante of variantesDeRequete(requete)) {
    try {
      const trouve = await chercher(variante);
      if (trouve) return trouve;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Géocode un nom de lieu et son adresse — utile au moment de la création, pour qu'un
 * parent qui tape « Chemin du Gué 12, Petit-Lancy » voie le repère quelques secondes plus
 * tard plutôt que dans l'heure.
 *
 * L'appel direct à Nominatim respecte la politique d'usage : au plus une requête par
 * seconde, avec un User-Agent identifiable, et le délai (`pause`, par défaut 1,1 s) est
 * appliqué **avant** la requête, pas après, pour qu'un ajout de lieu n'arrive jamais à
 * une rafale. Un `chercher` injectable permet aux tests de ne pas sortir sur le réseau.
 */
export async function geocoderUnLieu(
  nom: string,
  adresse: string | null | undefined,
  commune: string | null | undefined,
  options: {
    chercher?: (requete: string) => Promise<Coordonnees | null>;
    pause?: number;
  } = {},
): Promise<Coordonnees | null> {
  const chercher = options.chercher ?? geocoder;
  const pause = options.pause ?? PAUSE_MS;
  await attendre(pause);
  return tenter(chercher, requeteDeLieu(nom, adresse, commune));
}
