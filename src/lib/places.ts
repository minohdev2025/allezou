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

import { db } from "./db";
import * as s from "./db/schema";

/** Nombre de personnes distinctes nécessaires pour qu'un renommage prenne effet. */
export const VALIDATIONS_RENOMMAGE = 3;

export const placeNameSchema = z.string().trim().min(2).max(80);
export const communeSchema = z.string().trim().max(60).optional();

export type PlaceError =
  | "nom_invalide"
  | "commune_invalide"
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
  input: { name: string; commune?: string },
): Promise<Result<Place>> {
  const name = placeNameSchema.safeParse(input.name);
  if (!name.success) return ko("nom_invalide");

  const commune = communeSchema.safeParse(input.commune);
  if (!commune.success) return ko("commune_invalide");

  const existing = await db
    .select()
    .from(s.place)
    .where(isNull(s.place.archivedAt));

  const doublon = existing.find((p) => normalize(p.name) === normalize(name.data));
  if (doublon) return ok(doublon);

  const [place] = await db
    .insert(s.place)
    .values({ name: name.data, commune: commune.data, createdBy: actorId })
    .returning();

  return ok(place);
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

export type RenameProposal = {
  id: string;
  placeId: string;
  currentName: string;
  proposedName: string;
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

  const identique = ouvertes.find((p) => normalize(p.proposedName) === normalize(name.data));
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

    const [place] = await tx
      .select()
      .from(s.place)
      .where(eq(s.place.id, proposal.placeId))
      .limit(1);

    if (votes >= VALIDATIONS_RENOMMAGE) {
      await tx.execute(sql`
        update place set name = ${proposal.proposedName} where id = ${proposal.placeId}
      `);
      await tx.execute(sql`
        update place_rename_proposal set applied_at = now() where id = ${proposalId}
      `);
      // Les autres propositions ouvertes sur ce lieu deviennent caduques.
      await tx.execute(sql`
        update place_rename_proposal set rejected_at = now()
        where place_id = ${proposal.placeId}
          and id <> ${proposalId}
          and applied_at is null
          and rejected_at is null
      `);
    }

    return ok({
      id: proposalId,
      placeId: proposal.placeId,
      currentName: place.name,
      proposedName: proposal.proposedName,
      votes,
      needed: VALIDATIONS_RENOMMAGE,
    });
  });
}

/** Les renommages en attente de validation pour un lieu. */
export async function pendingRenames(placeId: string): Promise<RenameProposal[]> {
  const rows = await db.execute<{
    id: string;
    place_id: string;
    current_name: string;
    proposed_name: string;
    votes: number;
  }>(sql`
    select
      p.id,
      p.place_id,
      pl.name as current_name,
      p.proposed_name,
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
    proposedName: r.proposed_name,
    votes: r.votes,
    needed: VALIDATIONS_RENOMMAGE,
  }));
}
