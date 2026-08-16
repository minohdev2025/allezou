/**
 * Le catalogue de lieux, commun à tout le monde.
 *
 * N'importe qui ajoute un lieu. Personne ne modère seul : un renommage prend effet quand
 * assez de personnes l'ont validé. La correction collective remplace la modération centrale,
 * ce qui évite d'avoir à désigner quelqu'un qui relit tout — un travail que personne ne
 * tiendrait dans la durée.
 *
 * Le nom d'un lieu est du texte libre lu par des inconnus : il est plafonné en base, et
 * c'est le seul endroit de l'app, avec le nom affiché, où quelqu'un peut écrire une phrase
 * que d'autres liront. C'est par là qu'une app « sans messagerie » en devient une, donc le
 * renommage collectif sert aussi à corriger les dérives.
 */

import { and, eq, ilike, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { estCategorieLieu, type CategorieLieu } from "./categories-lieu";
import { db } from "./db";
import * as s from "./db/schema";

/** Nombre de personnes distinctes nécessaires pour qu'un renommage prenne effet. */
export const VALIDATIONS_RENOMMAGE = 3;

export const placeNameSchema = z.string().trim().min(2).max(80);
export const communeSchema = z.string().trim().max(60).optional();

/**
 * L'adresse ou le repère qui permet de trouver le lieu. Vide vaut « on ne sait pas », et
 * c'est le cas de tous les lieux entrés avant que ce champ existe.
 */
export const addressSchema = z
  .string()
  .trim()
  .max(160)
  .optional()
  .transform((v) => v || undefined);

/**
 * Le point posé sur la carte par la personne qui ajoute le lieu. Deux nombres bornés au
 * monde réel — tout le reste, un texte, un NaN, un hémisphère inventé, est refusé avant
 * la base.
 */
export const coordonneesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export type PlaceError =
  | "nom_invalide"
  | "commune_invalide"
  | "adresse_invalide"
  | "adresse_deja_connue"
  | "position_invalide"
  | "categorie_invalide"
  | "categorie_deja_connue"
  | "lieu_inconnu"
  | "proposition_inconnue"
  | "proposition_close"
  | "deja_vote";

export type Result<T> = { ok: true; value: T } | { ok: false; reason: PlaceError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const ko = <T>(reason: PlaceError): Result<T> => ({ ok: false, reason });

export type Place = typeof s.place.$inferSelect;

/** Comparaison tolérante aux accents, majuscules et espaces multiples. */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ajoute un lieu, ou renvoie celui qui existe déjà sous le même nom.
 * Un catalogue commun n'a d'intérêt que s'il ne se remplit pas de doublons.
 */
export async function createPlace(
  actorId: string,
  input: {
    name: string;
    commune?: string;
    address?: string;
    coord?: { lat: number; lon: number };
    categorie?: string;
  },
): Promise<Result<Place>> {
  const name = placeNameSchema.safeParse(input.name);
  if (!name.success) return ko("nom_invalide");

  const commune = communeSchema.safeParse(input.commune);
  if (!commune.success) return ko("commune_invalide");

  const address = addressSchema.safeParse(input.address);
  if (!address.success) return ko("adresse_invalide");

  const coord = input.coord === undefined ? undefined : coordonneesSchema.safeParse(input.coord);
  if (coord && !coord.success) return ko("position_invalide");

  if (input.categorie !== undefined && !estCategorieLieu(input.categorie)) {
    return ko("categorie_invalide");
  }

  const existing = await db
    .select()
    .from(s.place)
    .where(isNull(s.place.archivedAt));

  const doublon = existing.find((p) => normalize(p.name) === normalize(name.data));
  if (doublon) return ok(doublon);

  const [place] = await db
    .insert(s.place)
    .values({
      name: name.data,
      commune: commune.data,
      address: address.data,
      /*
        Le doigt posé sur la carte vaut mieux que la devinette d'un géocodeur : la
        position arrive déjà exacte, marquée géocodée pour que le passage Nominatim
        (geo.ts) n'écrase jamais un point montré par quelqu'un qui y était.
      */
      lat: coord?.data.lat,
      lon: coord?.data.lon,
      geocodedAt: coord ? sql`now()` : undefined,
      categorie: input.categorie as CategorieLieu | undefined,
      createdBy: actorId,
    })
    .returning();

  return ok(place);
}

/**
 * Les lieux que ce compte garde en tête de liste — un tri personnel, pas un vote.
 */
export async function lieuxFavoris(accountId: string): Promise<string[]> {
  const rows = await db
    .select({ placeId: s.placeFavorite.placeId })
    .from(s.placeFavorite)
    .where(eq(s.placeFavorite.accountId, accountId));
  return rows.map((r) => r.placeId);
}

/**
 * Épingle ou détache un favori : même geste, état inversé. Rend le nouvel état.
 *
 * Un lieu disparu ne s'épingle pas — sans ce garde-fou, la contrainte de clé étrangère
 * transformerait un favori sur un lieu archivé en erreur serveur.
 */
export async function basculerFavori(accountId: string, placeId: string): Promise<boolean> {
  const detache = await db
    .delete(s.placeFavorite)
    .where(and(eq(s.placeFavorite.accountId, accountId), eq(s.placeFavorite.placeId, placeId)))
    .returning({ placeId: s.placeFavorite.placeId });
  if (detache.length > 0) return false;

  const [lieu] = await db
    .select({ id: s.place.id })
    .from(s.place)
    .where(and(eq(s.place.id, placeId), isNull(s.place.archivedAt)))
    .limit(1);
  if (!lieu) return false;

  await db
    .insert(s.placeFavorite)
    .values({ accountId, placeId })
    .onConflictDoNothing();
  return true;
}

/** Les lieux que ce compte a rangés hors de sa liste. */
export async function lieuxMasques(accountId: string): Promise<string[]> {
  const rows = await db
    .select({ placeId: s.placeHidden.placeId })
    .from(s.placeHidden)
    .where(eq(s.placeHidden.accountId, accountId));
  return rows.map((r) => r.placeId);
}

/**
 * Masque ou réaffiche un lieu pour ce compte. Rend vrai si le lieu est désormais masqué.
 *
 * Masquer retire aussi l'étoile : un lieu à la fois favori et invisible serait un état
 * qui ne veut rien dire, et le réafficher un jour ne doit pas le faire resurgir épinglé.
 */
export async function basculerMasque(accountId: string, placeId: string): Promise<boolean> {
  const reaffiche = await db
    .delete(s.placeHidden)
    .where(and(eq(s.placeHidden.accountId, accountId), eq(s.placeHidden.placeId, placeId)))
    .returning({ placeId: s.placeHidden.placeId });
  if (reaffiche.length > 0) return false;

  const [lieu] = await db
    .select({ id: s.place.id })
    .from(s.place)
    .where(and(eq(s.place.id, placeId), isNull(s.place.archivedAt)))
    .limit(1);
  if (!lieu) return false;

  await db
    .delete(s.placeFavorite)
    .where(and(eq(s.placeFavorite.accountId, accountId), eq(s.placeFavorite.placeId, placeId)));
  await db.insert(s.placeHidden).values({ accountId, placeId }).onConflictDoNothing();
  return true;
}

/**
 * Retirer un lieu du catalogue commun — le geste du relecteur devant un doublon.
 *
 * C'est un archivage, pas un effacement : les sorties passées qui pointaient dessus
 * gardent leur lieu, et une erreur de relecture se répare en base. Toutes les lectures
 * du catalogue filtrent déjà `archived_at`.
 */
export async function archiverLieu(placeId: string): Promise<Result<void>> {
  const archivees = await db
    .update(s.place)
    .set({ archivedAt: sql`now()` })
    .where(and(eq(s.place.id, placeId), isNull(s.place.archivedAt)))
    .returning({ id: s.place.id });

  if (archivees.length === 0) return ko("lieu_inconnu");
  return ok(undefined as void);
}

/**
 * Classer un lieu qui ne l'est pas encore.
 *
 * Même règle que pour l'adresse : remplir un vide se fait seul, sans rien défaire du
 * travail de personne — et tous les lieux entrés avant que la catégorie existe sont des
 * vides. Changer une catégorie déjà posée sera une autre affaire, le jour où le besoin
 * se montrera.
 */
export async function completerCategorie(
  placeId: string,
  saisie: string,
): Promise<Result<void>> {
  if (!estCategorieLieu(saisie)) return ko("categorie_invalide");

  const modifiees = await db
    .update(s.place)
    .set({ categorie: saisie })
    .where(
      and(eq(s.place.id, placeId), isNull(s.place.categorie), isNull(s.place.archivedAt)),
    )
    .returning({ id: s.place.id });

  if (modifiees.length === 0) return ko("categorie_deja_connue");
  return ok(undefined as void);
}

/** Recherche pour le sélecteur de lieu. Une requête vide renvoie les lieux les plus récents. */
export async function searchPlaces(query = "", limit = 20): Promise<Place[]> {
  const q = query.trim();
  return db
    .select()
    .from(s.place)
    .where(
      q.length > 0
        ? and(isNull(s.place.archivedAt), ilike(s.place.name, `%${q}%`))
        : isNull(s.place.archivedAt),
    )
    .orderBy(s.place.name)
    .limit(limit);
}

/**
 * Compléter l'adresse d'un lieu qui n'en a pas.
 *
 * On remplit un vide, et ce geste-là se fait seul : la première personne qui connaît
 * l'adresse la donne, sans rien défaire du travail de personne. Corriger une adresse déjà
 * écrite est une autre affaire, et passe par `proposeAddress` : c'est une décision que
 * personne ne prend seul, comme pour le nom.
 */
export async function completerAdresse(
  placeId: string,
  saisie: string,
): Promise<Result<void>> {
  const address = addressSchema.safeParse(saisie);
  if (!address.success || !address.data) return ko("adresse_invalide");

  const modifiees = await db
    .update(s.place)
    .set({ address: address.data })
    .where(and(eq(s.place.id, placeId), isNull(s.place.address), isNull(s.place.archivedAt)))
    .returning({ id: s.place.id });

  if (modifiees.length === 0) return ko("adresse_deja_connue");
  return ok(undefined as void);
}

export type RenameProposal = {
  id: string;
  placeId: string;
  currentName: string;
  /** Le nom proposé, ou null quand la proposition porte sur l'adresse. */
  proposedName: string | null;
  /** L'adresse proposée, ou null quand la proposition porte sur le nom. */
  proposedAddress: string | null;
  /** Ce que le lieu porte aujourd'hui comme adresse, pour montrer ce qui changerait. */
  currentAddress: string | null;
  votes: number;
  needed: number;
};

/**
 * Propose un nouveau nom. La voix de celui qui propose compte pour une.
 * Une proposition identique déjà ouverte reçoit simplement sa voix.
 */
export async function proposeRename(
  actorId: string,
  placeId: string,
  rawName: string,
): Promise<Result<RenameProposal>> {
  const name = placeNameSchema.safeParse(rawName);
  if (!name.success) return ko("nom_invalide");

  const [place] = await db
    .select()
    .from(s.place)
    .where(and(eq(s.place.id, placeId), isNull(s.place.archivedAt)))
    .limit(1);
  if (!place) return ko("lieu_inconnu");

  const ouvertes = await db
    .select()
    .from(s.placeRenameProposal)
    .where(
      and(
        eq(s.placeRenameProposal.placeId, placeId),
        isNull(s.placeRenameProposal.appliedAt),
        isNull(s.placeRenameProposal.rejectedAt),
      ),
    );

  // Une proposition de nom ne se compare qu'aux autres propositions de nom : depuis que la
  // table porte aussi les adresses, les confondre reviendrait à donner sa voix à autre chose.
  const identique = ouvertes.find(
    (p) => p.proposedName && normalize(p.proposedName) === normalize(name.data),
  );
  if (identique) {
    const vote = await voteRename(actorId, identique.id);
    return vote.ok ? ok(vote.value) : (vote as Result<RenameProposal>);
  }

  const [proposal] = await db
    .insert(s.placeRenameProposal)
    .values({ placeId, proposedName: name.data, proposedBy: actorId })
    .returning();

  await db.insert(s.placeRenameVote).values({ proposalId: proposal.id, accountId: actorId });

  return ok({
    id: proposal.id,
    placeId,
    currentName: place.name,
    proposedName: proposal.proposedName,
    proposedAddress: null,
    currentAddress: place.address,
    votes: 1,
    needed: VALIDATIONS_RENOMMAGE,
  });
}

/**
 * Propose une autre adresse pour un lieu qui en a déjà une.
 *
 * Une adresse fausse était définitive : on pouvait remplir un vide, jamais rectifier. Or
 * c'est un texte libre de cent soixante caractères, lu par tout le monde, et qui décide où
 * une famille se rend un samedi matin. L'argument qui impose un vote pour le nom vaut donc
 * mot pour mot ici : c'est l'identité du lieu, et une erreur y est visible de tous.
 *
 * Même mécanisme, même seuil, mêmes voix : une seconde infrastructure de validation aurait
 * fini par diverger de la première.
 */
export async function proposeAddress(
  actorId: string,
  placeId: string,
  rawAddress: string,
): Promise<Result<RenameProposal>> {
  const analysee = addressSchema.safeParse(rawAddress);
  if (!analysee.success || !analysee.data) return ko("adresse_invalide");
  const adresse = analysee.data;

  const [place] = await db
    .select()
    .from(s.place)
    .where(and(eq(s.place.id, placeId), isNull(s.place.archivedAt)))
    .limit(1);
  if (!place) return ko("lieu_inconnu");

  // Un lieu sans adresse n'a rien à faire voter : `completerAdresse` remplit le vide seul.
  if (!place.address) return ko("adresse_deja_connue");

  const ouvertes = await db
    .select()
    .from(s.placeRenameProposal)
    .where(
      and(
        eq(s.placeRenameProposal.placeId, placeId),
        isNull(s.placeRenameProposal.appliedAt),
        isNull(s.placeRenameProposal.rejectedAt),
      ),
    );

  const identique = ouvertes.find(
    (p) => p.proposedAddress && normalize(p.proposedAddress) === normalize(adresse),
  );
  if (identique) {
    const vote = await voteRename(actorId, identique.id);
    return vote.ok ? ok(vote.value) : (vote as Result<RenameProposal>);
  }

  const [proposal] = await db
    .insert(s.placeRenameProposal)
    .values({ placeId, proposedAddress: adresse, proposedBy: actorId })
    .returning();

  await db.insert(s.placeRenameVote).values({ proposalId: proposal.id, accountId: actorId });

  return ok({
    id: proposal.id,
    placeId,
    currentName: place.name,
    proposedName: null,
    proposedAddress: proposal.proposedAddress,
    currentAddress: place.address,
    votes: 1,
    needed: VALIDATIONS_RENOMMAGE,
  });
}

/** Valide un renommage proposé. Au seuil atteint, le lieu est renommé pour tout le monde. */
export async function voteRename(
  actorId: string,
  proposalId: string,
): Promise<Result<RenameProposal>> {
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(s.placeRenameProposal)
      .where(eq(s.placeRenameProposal.id, proposalId))
      .limit(1);

    if (!proposal) return ko<RenameProposal>("proposition_inconnue");
    if (proposal.appliedAt || proposal.rejectedAt) {
      return ko<RenameProposal>("proposition_close");
    }

    await tx
      .insert(s.placeRenameVote)
      .values({ proposalId, accountId: actorId })
      .onConflictDoNothing();

    const [{ n: votes }] = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from place_rename_vote where proposal_id = ${proposalId}
    `);

    // Le lieu se relit après coup et non avant : ce qu'on rend doit décrire son état une
    // fois la correction appliquée, sans quoi l'écran afficherait l'ancien nom au moment
    // même où il annonce que le nouveau est adopté.
    if (votes >= VALIDATIONS_RENOMMAGE) {
      if (proposal.proposedName) {
        await tx.execute(sql`
          update place set name = ${proposal.proposedName} where id = ${proposal.placeId}
        `);
      } else {
        /*
          L'adresse change, donc les coordonnées ne valent plus rien.

          Elles ont été demandées à OpenStreetMap pour l'ancienne adresse : les garder ferait
          tomber le lien de carte sur l'ancien point, avec une adresse écrite juste à côté qui
          dirait autre chose. C'est pire que pas de repère du tout, parce que personne ne
          vérifie un point qui s'affiche. `geocoded_at` remis à zéro fait reprendre le
          géocodage au prochain passage, qui ne traite que ce qui n'a jamais été tenté.
        */
        await tx.execute(sql`
          update place
          set address = ${proposal.proposedAddress},
              lat = null,
              lon = null,
              geocoded_at = null
          where id = ${proposal.placeId}
        `);
      }
      await tx.execute(sql`
        update place_rename_proposal set applied_at = now() where id = ${proposalId}
      `);
      /*
        Les autres propositions ouvertes sur ce lieu deviennent caduques — mais seulement
        celles qui portent sur le même champ. Une correction d'adresse ne dit rien du nom, et
        les balayer ensemble ferait perdre des voix déjà données sur une question qu'on n'a
        pas tranchée.
      */
      await tx.execute(sql`
        update place_rename_proposal set rejected_at = now()
        where place_id = ${proposal.placeId}
          and id <> ${proposalId}
          and applied_at is null
          and rejected_at is null
          and ${proposal.proposedName ? sql`proposed_name is not null` : sql`proposed_address is not null`}
      `);
    }

    const [apres] = await tx
      .select()
      .from(s.place)
      .where(eq(s.place.id, proposal.placeId))
      .limit(1);

    return ok({
      id: proposalId,
      placeId: proposal.placeId,
      currentName: apres.name,
      proposedName: proposal.proposedName,
      proposedAddress: proposal.proposedAddress,
      currentAddress: apres.address,
      votes,
      needed: VALIDATIONS_RENOMMAGE,
    });
  });
}

/**
 * Toutes les corrections en attente, nom comme adresse, avec ce que le lecteur en a déjà
 * fait.
 *
 * `dejaVote` évite de proposer un bouton qui ne ferait rien : une voix est déjà comptée,
 * et rien n'est plus décourageant qu'un bouton qui ne bouge pas.
 */
export async function openRenames(
  actorId: string,
): Promise<(RenameProposal & { dejaVote: boolean })[]> {
  const rows = await db.execute<{
    id: string;
    place_id: string;
    current_name: string;
    current_address: string | null;
    proposed_name: string | null;
    proposed_address: string | null;
    votes: number;
    deja_vote: boolean;
  }>(sql`
    select
      p.id,
      p.place_id,
      pl.name as current_name,
      pl.address as current_address,
      p.proposed_name,
      p.proposed_address,
      (select count(*)::int from place_rename_vote v where v.proposal_id = p.id) as votes,
      exists (
        select 1 from place_rename_vote v
        where v.proposal_id = p.id and v.account_id = ${actorId}
      ) as deja_vote
    from place_rename_proposal p
    join place pl on pl.id = p.place_id and pl.archived_at is null
    where p.applied_at is null
      and p.rejected_at is null
    order by votes desc, p.created_at asc
  `);

  return rows.map((r) => ({
    id: r.id,
    placeId: r.place_id,
    currentName: r.current_name,
    currentAddress: r.current_address,
    proposedName: r.proposed_name,
    proposedAddress: r.proposed_address,
    votes: r.votes,
    needed: VALIDATIONS_RENOMMAGE,
    dejaVote: r.deja_vote,
  }));
}

/** Les corrections en attente de validation pour un lieu. */
export async function pendingRenames(placeId: string): Promise<RenameProposal[]> {
  const rows = await db.execute<{
    id: string;
    place_id: string;
    current_name: string;
    current_address: string | null;
    proposed_name: string | null;
    proposed_address: string | null;
    votes: number;
  }>(sql`
    select
      p.id,
      p.place_id,
      pl.name as current_name,
      pl.address as current_address,
      p.proposed_name,
      p.proposed_address,
      (select count(*)::int from place_rename_vote v where v.proposal_id = p.id) as votes
    from place_rename_proposal p
    join place pl on pl.id = p.place_id
    where p.place_id = ${placeId}
      and p.applied_at is null
      and p.rejected_at is null
    order by votes desc, p.created_at asc
  `);

  return rows.map((r) => ({
    id: r.id,
    placeId: r.place_id,
    currentName: r.current_name,
    currentAddress: r.current_address,
    proposedName: r.proposed_name,
    proposedAddress: r.proposed_address,
    votes: r.votes,
    needed: VALIDATIONS_RENOMMAGE,
  }));
}
