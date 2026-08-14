/**
 * Schéma de la base — voir PRODUIT.md.
 *
 * Deux invariants portés par le schéma lui-même, pas par le code applicatif :
 *
 * 1. Toute ligne de `circleMembership` dont `leftAt` est nul EST une appartenance réelle.
 *    Une demande d'entrée en attente vit dans `circleJoinRequest`, jamais ici — pour qu'une
 *    requête qui oublierait un filtre ne puisse pas laisser entrer un membre non validé.
 * 2. Le lien coupé entre deux membres est symétrique par construction : les deux comptes sont
 *    rangés dans un ordre canonique (`accountA` < `accountB`) garanti par une contrainte.
 *    Il n'existe donc aucun état où A masque B sans que B masque A.
 *
 * Les champs de texte libre sont plafonnés en base. Ce n'est pas cosmétique : un champ libre
 * sans limite est le chemin par lequel une app « sans messagerie » en devient une.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const now = sql`now()`;

/* ------------------------------------------------------------------ comptes */

export const account = pgTable(
  "account",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Toujours stocké en minuscules — l'unicité en dépend. */
    email: varchar({ length: 254 }).notNull(),
    /** Nom affiché aux autres membres. Convention encore à trancher (PRODUIT.md, Q3). */
    displayName: varchar({ length: 60 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
    lastSeenAt: timestamp({ withTimezone: true }),
    /** Compte supprimé : invisible partout, y compris dans les cercles. */
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("account_email_key").on(t.email),
    check("account_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

/**
 * Un enfant n'est qu'un prénom.
 *
 * Pas d'année de naissance : les membres d'un cercle connaissent déjà les enfants de leur
 * classe ou de leur quartier, et aucune fonctionnalité n'en dépend. Le doute profite à
 * l'absence du champ.
 */
export const child = pgTable("child", {
  id: uuid().primaryKey().defaultRandom(),
  firstName: varchar({ length: 40 }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  deletedAt: timestamp({ withTimezone: true }),
});

/** Un enfant peut être rattaché à deux comptes (les deux parents). */
export const childParent = pgTable(
  "child_parent",
  {
    childId: uuid()
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.childId, t.accountId] })],
);

/** Invitation d'un compte à devenir co-parent des enfants de l'émetteur. */
export const coparentInvite = pgTable(
  "coparent_invite",
  {
    id: uuid().primaryKey().defaultRandom(),
    createdBy: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    /** Seul le hachage est stocké : le jeton en clair ne vit que dans le lien envoyé. */
    tokenHash: varchar({ length: 64 }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    usedBy: uuid().references(() => account.id, { onDelete: "set null" }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex("coparent_invite_token_key").on(t.tokenHash)],
);

/* ------------------------------------------------------------------ cercles */

export const circleRole = pgEnum("circle_role", ["admin", "member"]);

export const circle = pgTable("circle", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 60 }).notNull(),
  createdBy: uuid().references(() => account.id, { onDelete: "set null" }),
  createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  archivedAt: timestamp({ withTimezone: true }),
});

/**
 * Appartenance datée. `leftAt` non nul = la personne n'est plus membre : elle cesse
 * immédiatement de voir les publications du cercle, et cesse d'être visible dedans.
 */
export const circleMembership = pgTable(
  "circle_membership",
  {
    id: uuid().primaryKey().defaultRandom(),
    circleId: uuid()
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    role: circleRole().notNull().default("member"),
    /** Ce cercle est-il coché par défaut au moment de publier ? Réglage personnel. */
    defaultAudience: boolean().notNull().default(true),
    joinedAt: timestamp({ withTimezone: true }).notNull().default(now),
    leftAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // Une seule appartenance active à la fois par (cercle, compte).
    uniqueIndex("circle_membership_active_key")
      .on(t.circleId, t.accountId)
      .where(sql`left_at is null`),
    index("circle_membership_account_idx").on(t.accountId),
    check("circle_membership_dates", sql`${t.leftAt} is null or ${t.leftAt} >= ${t.joinedAt}`),
  ],
);

/**
 * Lien coupé entre deux membres d'un même cercle. Symétrique par construction :
 * une seule ligne, avec accountA < accountB imposé par contrainte.
 * Rien n'est signalé à l'autre personne (PRODUIT.md).
 */
export const circleLinkCut = pgTable(
  "circle_link_cut",
  {
    circleId: uuid()
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    accountA: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    accountB: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    /** Qui a coupé — pour l'audit uniquement, jamais exposé à l'autre partie. */
    cutBy: uuid().references(() => account.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.circleId, t.accountA, t.accountB] }),
    check("circle_link_cut_canonical_order", sql`${t.accountA} < ${t.accountB}`),
  ],
);

/** Lien d'invitation à un cercle, révocable et à usage limité. */
export const circleInvite = pgTable(
  "circle_invite",
  {
    id: uuid().primaryKey().defaultRandom(),
    circleId: uuid()
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    createdBy: uuid().references(() => account.id, { onDelete: "set null" }),
    tokenHash: varchar({ length: 64 }).notNull(),
    maxUses: integer().notNull().default(20),
    useCount: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("circle_invite_token_key").on(t.tokenHash),
    check("circle_invite_uses", sql`${t.useCount} <= ${t.maxUses}`),
  ],
);

export const joinRequestStatus = pgEnum("join_request_status", [
  "pending",
  "approved",
  "rejected",
]);

/**
 * Entrée en attente : un membre partage le lien, la personne le suit, l'admin valide.
 * Tant que la demande est ici, la personne n'est membre de rien et ne voit rien.
 */
export const circleJoinRequest = pgTable(
  "circle_join_request",
  {
    id: uuid().primaryKey().defaultRandom(),
    circleId: uuid()
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    inviteId: uuid().references(() => circleInvite.id, { onDelete: "set null" }),
    status: joinRequestStatus().notNull().default("pending"),
    requestedAt: timestamp({ withTimezone: true }).notNull().default(now),
    decidedAt: timestamp({ withTimezone: true }),
    decidedBy: uuid().references(() => account.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("circle_join_request_pending_key")
      .on(t.circleId, t.accountId)
      .where(sql`status = 'pending'`),
  ],
);

/* -------------------------------------------------------------------- lieux */

export const place = pgTable(
  "place",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: varchar({ length: 80 }).notNull(),
    commune: varchar({ length: 60 }),
    createdBy: uuid().references(() => account.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("place_name_idx").on(t.name)],
);

/** Renommage d'un lieu : prend effet quand assez de personnes l'ont validé. */
export const placeRenameProposal = pgTable("place_rename_proposal", {
  id: uuid().primaryKey().defaultRandom(),
  placeId: uuid()
    .notNull()
    .references(() => place.id, { onDelete: "cascade" }),
  proposedName: varchar({ length: 80 }).notNull(),
  proposedBy: uuid().references(() => account.id, { onDelete: "set null" }),
  createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  appliedAt: timestamp({ withTimezone: true }),
  rejectedAt: timestamp({ withTimezone: true }),
});

export const placeRenameVote = pgTable(
  "place_rename_vote",
  {
    proposalId: uuid()
      .notNull()
      .references(() => placeRenameProposal.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.proposalId, t.accountId] })],
);

/* --------------------------------------------------------------- calendrier */

export const sourceKind = pgEnum("source_kind", ["ical", "jsonld", "html_ai"]);

/**
 * Source du calendrier genevois.
 *
 * `autoPublish` autorise la source à publier seule ce qui passe les contrôles de
 * `ingest/controles.ts`. Ce qui échoue un contrôle retombe dans la file de relecture, quelle
 * que soit la valeur de ce drapeau. Une source qui vient d'être ajoutée reste à `false` le
 * temps qu'on regarde ce qu'elle rapporte : c'est le seul cas où tout passe par la file.
 */
export const source = pgTable("source", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 120 }).notNull(),
  url: varchar({ length: 500 }).notNull(),
  kind: sourceKind().notNull(),
  /**
   * Commune couverte par la source. C'est l'information fiable : l'agenda de Lancy publie
   * des activités à Lancy. La deviner dans un texte libre d'adresse serait hasardeux.
   */
  commune: varchar({ length: 60 }),
  /** Réglages propres à l'adaptateur : motif des liens d'événement, nombre de pages… */
  config: jsonb(),
  autoPublish: boolean().notNull().default(false),
  active: boolean().notNull().default(true),
  lastRunAt: timestamp({ withTimezone: true }),
  lastSuccessAt: timestamp({ withTimezone: true }),
  /**
   * Dernier passage ayant réellement rapporté quelque chose. Une source qui répond 200 et
   * ne renvoie plus rien est en panne du point de vue d'un parent : c'est cette date-là,
   * pas `lastSuccessAt`, qui dit si l'agenda est encore alimenté.
   */
  lastNonEmptyAt: timestamp({ withTimezone: true }),
  lastEventCount: integer(),
  lastError: varchar({ length: 500 }),
  createdAt: timestamp({ withTimezone: true }).notNull().default(now),
});

export const eventOrigin = pgEnum("event_origin", ["parent", "feed", "ai"]);

/**
 * Prix et inscription, tels que la source les écrit.
 *
 * `inconnu` est une valeur à part entière, et la valeur par défaut : sur une page communale,
 * l'absence de prix affiché veut dire que personne ne l'a écrit, pas que c'est offert. La
 * confondre avec « gratuit » ferait arriver une famille sans argent devant une caisse.
 */
export const eventTarif = pgEnum("event_tarif", ["gratuit", "payant", "inconnu"]);
export const eventAcces = pgEnum("event_acces", ["libre", "inscription", "inconnu"]);

/**
 * Entrée du calendrier. Une activité n'a pas de visibilité propre : elle est publique.
 * Ce sont les participations (`publication`) qui portent la visibilité.
 */
export const event = pgTable(
  "event",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: varchar({ length: 120 }).notNull(),
    description: varchar({ length: 280 }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }),
    placeId: uuid().references(() => place.id, { onDelete: "set null" }),
    /** Lieu en clair quand il vient d'une source et n'a pas de correspondance au catalogue. */
    placeLabel: varchar({ length: 120 }),
    /** Reprise de la source pour les activités ingérées, du lieu pour celles saisies. */
    commune: varchar({ length: 60 }),
    url: varchar({ length: 500 }),
    /**
     * Tranche d'âge annoncée par l'organisateur, quand elle l'est. C'est une information
     * publique sur l'activité, affichée telle quelle — l'app ne connaît l'âge d'aucun enfant
     * et ne filtre donc rien toute seule. Le parent lit « dès 5 ans » et décide.
     */
    minAge: smallint(),
    maxAge: smallint(),
    origin: eventOrigin().notNull(),
    tarif: eventTarif().notNull().default("inconnu"),
    acces: eventAcces().notNull().default("inconnu"),
    sourceId: uuid().references(() => source.id, { onDelete: "set null" }),
    /** Identifiant chez la source, pour ne pas dupliquer à chaque passage. */
    externalId: varchar({ length: 200 }),
    createdBy: uuid().references(() => account.id, { onDelete: "set null" }),
    /** Nul = en attente de relecture, invisible au calendrier. */
    publishedAt: timestamp({ withTimezone: true }),
    /**
     * Les contrôles qui ne sont pas passés, sous la forme `[{ code, detail }]`.
     *
     * Nul quand tout est passé. C'est ce qui explique, sur l'écran de relecture, pourquoi
     * une activité y est arrivée plutôt que d'être publiée : sans cette colonne, la file
     * redevient une pile de fiches sans motif, qu'il faut rouvrir une par une.
     */
    controles: jsonb(),
    /** Écarté à la relecture. Ne réapparaît pas au passage suivant de la source. */
    rejectedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
    updatedAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("event_source_external_key").on(t.sourceId, t.externalId),
    index("event_starts_at_idx").on(t.startsAt),
    check("event_dates", sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`),
  ],
);

/* -------------------------------------------------------------- publications */

export const publicationKind = pgEnum("publication_kind", ["presence", "attendance"]);

/**
 * LE signal. Deux formes dans une seule table, pour qu'il n'existe qu'une règle de
 * visibilité et un seul chemin de lecture.
 *
 * - `presence`   : « nous sommes au parc du Gué jusqu'à midi » — un lieu, une fin, expire seule.
 * - `attendance` : « nous serons à la visite du Muséum » — rattachée à une entrée du calendrier.
 */
export const publication = pgTable(
  "publication",
  {
    id: uuid().primaryKey().defaultRandom(),
    authorId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    kind: publicationKind().notNull(),
    placeId: uuid().references(() => place.id, { onDelete: "restrict" }),
    eventId: uuid().references(() => event.id, { onDelete: "cascade" }),
    note: varchar({ length: 140 }),
    startsAt: timestamp({ withTimezone: true }).notNull().default(now),
    /** Toujours renseigné : rien ne reste visible sans fin programmée. */
    endsAt: timestamp({ withTimezone: true }).notNull(),
    withdrawnAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    index("publication_author_idx").on(t.authorId),
    index("publication_ends_at_idx").on(t.endsAt),
    check("publication_dates", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "publication_shape",
      sql`(${t.kind} = 'presence' and ${t.placeId} is not null and ${t.eventId} is null)
          or (${t.kind} = 'attendance' and ${t.eventId} is not null and ${t.placeId} is null)`,
    ),
  ],
);

/** Cercles destinataires d'une publication. Aucun destinataire = visible de personne. */
export const publicationCircle = pgTable(
  "publication_circle",
  {
    publicationId: uuid()
      .notNull()
      .references(() => publication.id, { onDelete: "cascade" }),
    circleId: uuid()
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.circleId] })],
);

/**
 * Qui est à cette sortie. L'auteur y figure dès la création ; les autres s'ajoutent en
 * rejoignant. C'est ce qui produit le « +n » à l'écran.
 */
export const publicationParticipant = pgTable(
  "publication_participant",
  {
    publicationId: uuid()
      .notNull()
      .references(() => publication.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    joinedAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.accountId] })],
);

/** Les enfants qu'une famille amène à cette sortie. Prénom seul, comme partout. */
export const publicationParticipantChild = pgTable(
  "publication_participant_child",
  {
    publicationId: uuid().notNull(),
    accountId: uuid().notNull(),
    childId: uuid()
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.accountId, t.childId] }),
    // Un enfant ne peut pas être à une sortie sans que sa famille y soit.
    foreignKey({
      columns: [t.publicationId, t.accountId],
      foreignColumns: [publicationParticipant.publicationId, publicationParticipant.accountId],
    }).onDelete("cascade"),
  ],
);

/** Exclusion ponctuelle : la surcharge du réglage par défaut, pour une publication précise. */
export const publicationHiddenFrom = pgTable(
  "publication_hidden_from",
  {
    publicationId: uuid()
      .notNull()
      .references(() => publication.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.accountId] })],
);

/* ------------------------------------------------------------ notifications */

export const notificationPref = pgTable(
  "notification_pref",
  {
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    circleId: uuid()
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    onPresence: boolean().notNull().default(true),
    onAttendance: boolean().notNull().default(true),
    pausedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.circleId] })],
);

/** Ne plus être notifié d'une personne, sans couper le lien ni le lui signaler. */
export const notificationMute = pgTable(
  "notification_mute",
  {
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    circleId: uuid()
      .notNull()
      .references(() => circle.id, { onDelete: "cascade" }),
    mutedAccountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.circleId, t.mutedAccountId] })],
);

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    endpoint: varchar({ length: 500 }).notNull(),
    p256dh: varchar({ length: 200 }).notNull(),
    auth: varchar({ length: 100 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
    lastUsedAt: timestamp({ withTimezone: true }),
    failedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("push_subscription_endpoint_key").on(t.endpoint)],
);

/* ------------------------------------------------------------------- accès */

/** Lien magique de connexion. Aucun mot de passe n'existe nulle part. */
export const magicLink = pgTable(
  "magic_link",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: varchar({ length: 254 }).notNull(),
    tokenHash: varchar({ length: 64 }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex("magic_link_token_key").on(t.tokenHash)],
);

/**
 * Clés d'accès : revenir dans l'application sans courriel.
 *
 * Ce qui est enregistré est une **clé publique** — elle ne permet pas de se faire passer
 * pour la personne. L'empreinte, le visage ou le code ne quittent jamais l'appareil et ne
 * nous parviennent jamais : le téléphone se déverrouille tout seul, puis signe.
 *
 * Le courriel reste le chemin de première entrée et de récupération : un appareil perdu ne
 * doit pas fermer un compte.
 */
export const passkey = pgTable(
  "passkey",
  {
    /** Identifiant de la clé, tel que l'appareil le fournit (base64url). */
    id: varchar({ length: 500 }).primaryKey(),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    publicKey: varchar({ length: 1000 }).notNull(),
    /** Compteur anti-rejeu, tel que l'authentificateur l'incrémente. */
    counter: integer().notNull().default(0),
    /** Comment l'appareil s'est présenté : « internal », « hybrid »… */
    transports: varchar({ length: 120 }),
    /** Ce que la personne voit dans sa liste : « Téléphone de Sophie ». */
    label: varchar({ length: 60 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("passkey_account_idx").on(t.accountId)],
);

export const session = pgTable(
  "session",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    tokenHash: varchar({ length: 64 }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().default(now),
    createdAt: timestamp({ withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("session_token_key").on(t.tokenHash),
    index("session_account_idx").on(t.accountId),
  ],
);

/**
 * Passages des tâches planifiées.
 *
 * Sert autant à décider quand relancer qu'à répondre à une question qu'on doit pouvoir se
 * poser : l'effacement quotidien promis aux parents a-t-il vraiment eu lieu ? Une promesse
 * d'automatisme sans trace vérifiable n'en est pas une.
 */
export const jobRun = pgTable("job_run", {
  name: varchar({ length: 60 }).primaryKey(),
  /** Début de la dernière exécution. Posé avant de lancer, pour ne pas relancer en boucle. */
  lastRunAt: timestamp({ withTimezone: true }),
  lastOkAt: timestamp({ withTimezone: true }),
  lastError: varchar({ length: 500 }),
  lastReport: jsonb(),
});

/**
 * Traçabilité des actes sensibles : rôles, invitations, exclusions, suppressions.
 *
 * Aucune publication n'entre ici, jamais. Un journal qui enregistrerait les présences
 * reconstituerait exactement l'historique de déplacement que PRODUIT.md interdit.
 * Cette règle est vérifiée par un test.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    at: timestamp({ withTimezone: true }).notNull().default(now),
    actorId: uuid().references(() => account.id, { onDelete: "set null" }),
    action: varchar({ length: 60 }).notNull(),
    circleId: uuid().references(() => circle.id, { onDelete: "set null" }),
    targetAccountId: uuid().references(() => account.id, { onDelete: "set null" }),
    detail: jsonb(),
  },
  (t) => [index("audit_log_circle_idx").on(t.circleId, t.at)],
);
