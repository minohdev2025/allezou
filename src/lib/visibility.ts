/**
 * LA règle de visibilité. Point de passage unique.
 *
 * Aucune autre partie de l'application ne doit lire la table `publication` directement.
 * Toute lecture passe par ce fichier — c'est ce qui rend l'isolation démontrable plutôt
 * que supposée (PRODUIT.md).
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ Soit une publication P créée par A, destinée à un ensemble de cercles C(P).  │
 * │ B voit P si et seulement si :                                               │
 * │   1. il existe c ∈ C(P) dont A et B sont membres AU MOMENT DE LA LECTURE ;   │
 * │   2. le lien entre A et B dans c n'est pas coupé ;                          │
 * │   3. P n'est ni expirée ni retirée ;                                        │
 * │   4. B n'a pas été exclu ponctuellement de P ;                              │
 * │   5. A n'est pas un compte supprimé.                                        │
 * │ Cas particulier : A voit toujours ses propres publications.                 │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Le prédicat ci-dessous est écrit une fois et réutilisé par toutes les fonctions de
 * lecture, pour qu'aucune ne puisse diverger d'une autre.
 */

import { sql, type SQL } from "drizzle-orm";

import { db, type Executor } from "./db";
import { asDate } from "./db/rows";

/**
 * Le prédicat, en SQL. Suppose que la table `publication` est aliasée `p` dans la requête
 * appelante. Ne jamais dupliquer ce fragment : le réutiliser.
 *
 * `reader` est un fragment SQL et non une chaîne, pour que le même prédicat serve dans les
 * deux sens : « que voit cette personne » (un paramètre) et « qui voit cette publication »
 * (une colonne). C'est ce qui garantit qu'une notification ne peut pas partir vers quelqu'un
 * qui ne verrait pas la publication à l'écran.
 */
function visibleTo(reader: SQL): SQL {
  const readerId = reader;
  return sql`
    -- (3) ni retirée, ni expirée
    p.withdrawn_at is null
    and p.ends_at > now()

    -- (5) l'auteur existe toujours
    and exists (
      select 1 from account author
      where author.id = p.author_id
        and author.deleted_at is null
    )

    -- (4) pas d'exclusion ponctuelle du lecteur sur cette publication
    and not exists (
      select 1 from publication_hidden_from hidden
      where hidden.publication_id = p.id
        and hidden.account_id = ${readerId}
    )

    and (
      -- l'auteur voit toujours ce qu'il a publié
      p.author_id = ${readerId}

      -- (1) un cercle destinataire dont l'auteur ET le lecteur sont membres maintenant
      or exists (
        select 1
        from publication_circle pc
        join circle c
          on c.id = pc.circle_id
         and c.archived_at is null
        join circle_membership author_m
          on author_m.circle_id = pc.circle_id
         and author_m.account_id = p.author_id
         and author_m.left_at is null
        join circle_membership reader_m
          on reader_m.circle_id = pc.circle_id
         and reader_m.account_id = ${readerId}
         and reader_m.left_at is null
        where pc.publication_id = p.id

          -- (2) le lien entre les deux n'est pas coupé dans ce cercle.
          -- Les deux comptes sont rangés dans l'ordre canonique imposé en base,
          -- ce qui rend la coupure symétrique par construction.
          and not exists (
            select 1 from circle_link_cut cut
            where cut.circle_id = pc.circle_id
              and cut.account_a = least(p.author_id, ${readerId}::uuid)
              and cut.account_b = greatest(p.author_id, ${readerId}::uuid)
          )
      )
    )
  `;
}

/**
 * Deux personnes partagent-elles un cercle destinataire de cette publication, sans lien coupé ?
 *
 * C'est la condition qui décide qui apparaît dans la liste des participants. Écrite une fois,
 * utilisée par le compteur et par la liste : le « +2 » ne peut pas annoncer plus de monde que
 * ce que la liste montre.
 *
 * Suppose la publication aliasée `p` dans la requête appelante.
 */
function sharesAudienceCircle(a: SQL, b: SQL): SQL {
  return sql`
    exists (
      select 1
      from publication_circle pc_a
      join circle c_a on c_a.id = pc_a.circle_id and c_a.archived_at is null
      join circle_membership m_a
        on m_a.circle_id = pc_a.circle_id and m_a.account_id = ${a} and m_a.left_at is null
      join circle_membership m_b
        on m_b.circle_id = pc_a.circle_id and m_b.account_id = ${b} and m_b.left_at is null
      where pc_a.publication_id = p.id
        and not exists (
          select 1 from circle_link_cut cut
          where cut.circle_id = pc_a.circle_id
            and cut.account_a = least(${a}, ${b})
            and cut.account_b = greatest(${a}, ${b})
        )
    )
  `;
}

export type VisiblePublication = {
  id: string;
  kind: "presence" | "attendance";
  authorId: string;
  authorName: string;
  placeId: string | null;
  placeName: string | null;
  /** Où c'est, quand quelqu'un l'a renseigné. Sert à celui qui hésite à venir. */
  placeAddress: string | null;
  placeLat: number | null;
  placeLon: number | null;
  eventId: string | null;
  eventTitle: string | null;
  note: string | null;
  startsAt: Date;
  endsAt: Date;
  /**
   * Quand les destinataires ont été prévenus, ou null tant que la minute de silence
   * court : c'est elle qui permet à l'auteur d'annuler sans qu'aucun téléphone n'ait
   * sonné, et à l'écran de le lui dire.
   */
  notifiedAt: Date | null;
  /** Les prénoms des enfants que l'auteur a déclarés présents. */
  authorChildren: string[];
  /** Le « +n » : les personnes qui ont rejoint et que ce lecteur a le droit de voir. */
  otherParticipants: number;
};

export type PublicationFilter = {
  /** Ne garder qu'une forme de publication. */
  kind?: "presence" | "attendance";
  /** Ne garder que les participations à une activité précise du calendrier. */
  eventId?: string;
  /** Ne garder que ce qui est en cours maintenant (une présence déjà commencée). */
  onlyStarted?: boolean;
  /** Ne garder que ce qui n'a pas encore commencé (une sortie annoncée pour plus tard). */
  onlyUpcoming?: boolean;
};

/**
 * Ce que le lecteur voit, maintenant. Seule porte de lecture des publications.
 */
export async function visiblePublications(
  readerId: string,
  filter: PublicationFilter = {},
): Promise<VisiblePublication[]> {
  const conditions: SQL[] = [visibleTo(sql`${readerId}::uuid`)];

  if (filter.kind) {
    conditions.push(sql`p.kind = ${filter.kind}`);
  }
  if (filter.eventId) {
    conditions.push(sql`p.event_id = ${filter.eventId}`);
  }
  if (filter.onlyStarted) {
    conditions.push(sql`p.starts_at <= now()`);
  }
  if (filter.onlyUpcoming) {
    conditions.push(sql`p.starts_at > now()`);
  }

  const rows = await db.execute<{
    id: string;
    kind: "presence" | "attendance";
    author_id: string;
    author_name: string;
    place_id: string | null;
    place_name: string | null;
    place_address: string | null;
    place_lat: number | null;
    place_lon: number | null;
    event_id: string | null;
    event_title: string | null;
    note: string | null;
    starts_at: Date;
    ends_at: Date;
    notified_at: Date | null;
    author_children: string[];
    other_participants: number;
  }>(sql`
    select
      p.id,
      p.kind,
      p.author_id,
      author.display_name as author_name,
      p.place_id,
      pl.name as place_name,
      pl.address as place_address,
      pl.lat as place_lat,
      pl.lon as place_lon,
      p.event_id,
      ev.title as event_title,
      p.note,
      p.starts_at,
      p.ends_at,
      p.notified_at,
      (
        select coalesce(array_agg(ch.first_name order by ch.first_name), '{}')
        from publication_participant_child ppc
        join child ch on ch.id = ppc.child_id and ch.deleted_at is null
        where ppc.publication_id = p.id and ppc.account_id = p.author_id
      ) as author_children,
      (
        select count(*)::int
        from publication_participant pp
        join account pa on pa.id = pp.account_id and pa.deleted_at is null
        where pp.publication_id = p.id
          and pp.account_id <> p.author_id
          and ${sharesAudienceCircle(sql`pp.account_id`, sql`${readerId}::uuid`)}
      ) as other_participants
    from publication p
    join account author on author.id = p.author_id
    left join place pl on pl.id = p.place_id
    left join event ev on ev.id = p.event_id
    where ${sql.join(conditions, sql` and `)}
    order by p.ends_at asc, p.id asc
  `);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    authorId: r.author_id,
    authorName: r.author_name,
    placeId: r.place_id,
    placeName: r.place_name,
    placeAddress: r.place_address,
    placeLat: r.place_lat,
    placeLon: r.place_lon,
    eventId: r.event_id,
    eventTitle: r.event_title,
    note: r.note,
    startsAt: asDate(r.starts_at),
    endsAt: asDate(r.ends_at),
    notifiedAt: r.notified_at ? asDate(r.notified_at) : null,
    authorChildren: r.author_children ?? [],
    otherParticipants: r.other_participants,
  }));
}

/**
 * Une publication précise est-elle visible par ce lecteur ?
 * Utilise exactement le même prédicat que `visiblePublications` — les deux ne peuvent
 * pas répondre différemment.
 */
export async function canSeePublication(
  readerId: string,
  publicationId: string,
): Promise<boolean> {
  const rows = await db.execute(sql`
    select 1
    from publication p
    where p.id = ${publicationId}
      and ${visibleTo(sql`${readerId}::uuid`)}
    limit 1
  `);
  return rows.length > 0;
}

/**
 * L'inverse : qui voit cette publication ?
 *
 * Même prédicat, lu dans l'autre sens. C'est la seule façon d'être sûr que la liste des
 * destinataires d'une notification coïncide exactement avec la liste des gens qui verraient
 * la publication à l'écran — une notification est une divulgation comme une autre.
 */
export async function readersOfPublication(publicationId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    select a.id
    from account a
    where a.deleted_at is null
      and exists (
        select 1 from publication p
        where p.id = ${publicationId}
          and ${visibleTo(sql`a.id`)}
      )
  `);
  return rows.map((r) => r.id);
}

export type VisibleParticipant = {
  accountId: string;
  displayName: string;
  isAuthor: boolean;
  /** Prénoms des enfants amenés à cette sortie. */
  children: string[];
  joinedAt: Date;
};

/**
 * La liste derrière le « +n » : qui est à cette sortie, du point de vue de ce lecteur.
 *
 * On n'y voit que les personnes avec qui on partage un cercle destinataire. Quelqu'un venu
 * par le voisinage n'apparaît donc pas à un membre de la classe qui ne le connaît pas —
 * rejoindre une sortie ne fait jamais entrer dans le champ de vision d'inconnus.
 */
export async function visibleParticipants(
  readerId: string,
  publicationId: string,
): Promise<VisibleParticipant[]> {
  const rows = await db.execute<{
    account_id: string;
    display_name: string;
    is_author: boolean;
    children: string[];
    joined_at: Date;
  }>(sql`
    select
      pp.account_id,
      a.display_name,
      (pp.account_id = p.author_id) as is_author,
      pp.joined_at,
      (
        select coalesce(array_agg(ch.first_name order by ch.first_name), '{}')
        from publication_participant_child ppc
        join child ch on ch.id = ppc.child_id and ch.deleted_at is null
        where ppc.publication_id = pp.publication_id
          and ppc.account_id = pp.account_id
      ) as children
    from publication p
    join publication_participant pp on pp.publication_id = p.id
    join account a on a.id = pp.account_id and a.deleted_at is null
    where p.id = ${publicationId}
      -- le lecteur doit d'abord voir la sortie elle-même
      and ${visibleTo(sql`${readerId}::uuid`)}
      and (
        -- l'auteur est toujours visible : c'est lui qu'on a vu pour arriver ici
        pp.account_id = p.author_id
        -- on se voit toujours soi-même
        or pp.account_id = ${readerId}
        -- les autres seulement si on partage un cercle destinataire
        or ${sharesAudienceCircle(sql`pp.account_id`, sql`${readerId}::uuid`)}
      )
    order by (pp.account_id = p.author_id) desc, pp.joined_at asc
  `);

  return rows.map((r) => ({
    accountId: r.account_id,
    displayName: r.display_name,
    isAuthor: r.is_author,
    children: r.children ?? [],
    joinedAt: asDate(r.joined_at),
  }));
}

export type VisibleMember = {
  accountId: string;
  displayName: string;
  role: "admin" | "member";
  joinedAt: Date;
  /** Vrai si le lecteur a coupé le lien avec cette personne (donc réciproquement). */
  linkCut: boolean;
};

/**
 * Les membres d'un cercle, tels que le lecteur les voit.
 *
 * Les personnes dont le lien est coupé restent listées — c'est l'écran où l'on coche et
 * décoche, il faut bien les y voir. En revanche elles n'apparaissent nulle part ailleurs,
 * et rien n'indique à l'autre partie que le lien a été coupé.
 *
 * Renvoie une liste vide si le lecteur n'est pas membre actif du cercle : un non-membre
 * n'apprend même pas qui est dedans.
 */
export async function visibleCircleMembers(
  readerId: string,
  circleId: string,
): Promise<VisibleMember[]> {
  const rows = await db.execute<{
    account_id: string;
    display_name: string;
    role: "admin" | "member";
    joined_at: Date;
    link_cut: boolean;
  }>(sql`
    select
      m.account_id,
      a.display_name,
      m.role,
      m.joined_at,
      exists (
        select 1 from circle_link_cut cut
        where cut.circle_id = m.circle_id
          and cut.account_a = least(m.account_id, ${readerId}::uuid)
          and cut.account_b = greatest(m.account_id, ${readerId}::uuid)
      ) as link_cut
    from circle_membership m
    join account a on a.id = m.account_id and a.deleted_at is null
    join circle c on c.id = m.circle_id and c.archived_at is null
    where m.circle_id = ${circleId}
      and m.left_at is null
      -- le lecteur doit lui-même être membre actif, sinon il ne voit rien
      and exists (
        select 1 from circle_membership self
        where self.circle_id = ${circleId}
          and self.account_id = ${readerId}
          and self.left_at is null
      )
    order by a.display_name asc
  `);

  return rows.map((r) => ({
    accountId: r.account_id,
    displayName: r.display_name,
    role: r.role,
    joinedAt: asDate(r.joined_at),
    linkCut: r.link_cut,
  }));
}

/**
 * Le lecteur est-il membre actif de ce cercle ? À appeler avant toute action de cercle.
 */
export async function isActiveMember(
  readerId: string,
  circleId: string,
  exec: Executor = db,
): Promise<boolean> {
  const rows = await exec.execute(sql`
    select 1 from circle_membership m
    join circle c on c.id = m.circle_id and c.archived_at is null
    join account a on a.id = m.account_id and a.deleted_at is null
    where m.circle_id = ${circleId}
      and m.account_id = ${readerId}
      and m.left_at is null
    limit 1
  `);
  return rows.length > 0;
}

/** Le lecteur est-il administrateur actif de ce cercle ? */
export async function isCircleAdmin(
  readerId: string,
  circleId: string,
  exec: Executor = db,
): Promise<boolean> {
  const rows = await exec.execute(sql`
    select 1 from circle_membership m
    join circle c on c.id = m.circle_id and c.archived_at is null
    join account a on a.id = m.account_id and a.deleted_at is null
    where m.circle_id = ${circleId}
      and m.account_id = ${readerId}
      and m.left_at is null
      and m.role = 'admin'
    limit 1
  `);
  return rows.length > 0;
}

/**
 * Les cercles dont le lecteur est membre actif — la liste proposée au moment de publier.
 *
 * Le nombre de familles se compte exactement comme `visibleCircleMembers` les liste :
 * appartenances actives, comptes non supprimés, liens coupés compris. Deux façons de
 * compter finiraient par afficher deux nombres différents pour le même cercle.
 */
export async function readerCircles(
  readerId: string,
): Promise<{ id: string; name: string; role: "admin" | "member"; memberCount: number }[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    role: "admin" | "member";
    member_count: number;
  }>(sql`
    select
      c.id,
      -- Le nom que cette personne a choisi de voir, sinon celui du cercle.
      coalesce(m.alias, c.name) as name,
      m.role,
      (
        select count(*)
        from circle_membership mm
        join account a on a.id = mm.account_id and a.deleted_at is null
        where mm.circle_id = c.id and mm.left_at is null
      )::int as member_count
    from circle_membership m
    join circle c on c.id = m.circle_id and c.archived_at is null
    where m.account_id = ${readerId}
      and m.left_at is null
    order by c.name asc
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    memberCount: r.member_count,
  }));
}
