/**
 * Notifications, réglables cercle par cercle et personne par personne.
 *
 * Deux principes tiennent ce fichier :
 *
 * 1. **Une notification est une divulgation.** Les destinataires sont calculés par la règle
 *    de visibilité elle-même (`readersOfPublication`), jamais par une requête écrite ici.
 *    Personne ne peut donc être notifié de ce qu'il ne verrait pas à l'écran.
 *
 * 2. **Chaque notification doit être justifiable.** Le contenu envoyé ne dit ni qui, ni où :
 *    seulement le cercle concerné et la nature du signal. Un téléphone posé sur une table
 *    ne doit pas apprendre à un tiers qu'une famille est au parc du Gué jusqu'à midi.
 *    Le détail s'affiche à l'ouverture de l'application.
 */

import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "./db";
import { asDateOrNull } from "./db/rows";
import * as s from "./db/schema";
import { contient, normaliser } from "./texte";
import { cheminLocalise, localeSure, traducteur } from "./traduire";
import { readersOfPublication } from "./visibility";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  /** La langue du texte, que le service worker répète à la notification affichée. */
  lang?: string;
};

export type PushTarget = {
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Injectable : les tests n'envoient rien, la production passe par web-push. */
export type Sender = (target: PushTarget, payload: PushPayload) => Promise<void>;

/* ------------------------------------------------------------- abonnements */

export async function subscribe(
  accountId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  await db
    .insert(s.pushSubscription)
    .values({
      accountId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: s.pushSubscription.endpoint,
      set: {
        accountId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        failedAt: null,
      },
    });
}

/**
 * On ne supprime que ses propres abonnements : sans le compte dans la condition, il
 * suffirait de connaître l'adresse d'un appareil pour couper les notifications d'autrui.
 */
export async function unsubscribe(accountId: string, endpoint: string): Promise<void> {
  await db
    .delete(s.pushSubscription)
    .where(
      and(
        eq(s.pushSubscription.endpoint, endpoint),
        eq(s.pushSubscription.accountId, accountId),
      ),
    );
}

/* ----------------------------------------------------------------- réglages */

export type ReglageCercle = {
  circleId: string;
  circleName: string;
  onPresence: boolean;
  onAttendance: boolean;
  pausedUntil: Date | null;
};

/** Les réglages d'un compte pour chacun de ses cercles, valeurs par défaut comprises. */
export async function prefsParCercle(accountId: string): Promise<ReglageCercle[]> {
  const rows = await db.execute<{
    circle_id: string;
    circle_name: string;
    on_presence: boolean;
    on_attendance: boolean;
    paused_until: Date | null;
  }>(sql`
    select
      c.id as circle_id,
      coalesce(m.alias, c.name) as circle_name,
      coalesce(np.on_presence, true) as on_presence,
      coalesce(np.on_attendance, true) as on_attendance,
      np.paused_until
    from circle_membership m
    join circle c on c.id = m.circle_id and c.archived_at is null
    left join notification_pref np
      on np.account_id = m.account_id and np.circle_id = c.id
    where m.account_id = ${accountId}
      and m.left_at is null
    order by c.name asc
  `);

  return rows.map((r) => ({
    circleId: r.circle_id,
    circleName: r.circle_name,
    onPresence: r.on_presence,
    onAttendance: r.on_attendance,
    pausedUntil: asDateOrNull(r.paused_until),
  }));
}

/** Les personnes mises en sourdine dans un cercle. */
export async function mutedIn(accountId: string, circleId: string): Promise<Set<string>> {
  const rows = await db
    .select({ mutedAccountId: s.notificationMute.mutedAccountId })
    .from(s.notificationMute)
    .where(
      and(
        eq(s.notificationMute.accountId, accountId),
        eq(s.notificationMute.circleId, circleId),
      ),
    );
  return new Set(rows.map((r) => r.mutedAccountId));
}

export type NotificationPrefs = {
  onPresence: boolean;
  onAttendance: boolean;
  pausedUntil: Date | null;
};

/** Par défaut, on est notifié de tout dans un cercle qu'on vient de rejoindre. */
export const PREFS_PAR_DEFAUT: NotificationPrefs = {
  onPresence: true,
  onAttendance: true,
  pausedUntil: null,
};

export async function setPrefs(
  accountId: string,
  circleId: string,
  prefs: Partial<NotificationPrefs>,
): Promise<void> {
  await db
    .insert(s.notificationPref)
    .values({ accountId, circleId, ...PREFS_PAR_DEFAUT, ...prefs })
    .onConflictDoUpdate({
      target: [s.notificationPref.accountId, s.notificationPref.circleId],
      set: prefs,
    });
}

/** Mise en pause temporaire, en heures. Zéro heure lève la pause. */
export async function pauseCircle(
  accountId: string,
  circleId: string,
  hours: number,
): Promise<void> {
  await db
    .insert(s.notificationPref)
    .values({
      accountId,
      circleId,
      ...PREFS_PAR_DEFAUT,
      pausedUntil: hours > 0 ? new Date(Date.now() + hours * 3_600_000) : null,
    })
    .onConflictDoUpdate({
      target: [s.notificationPref.accountId, s.notificationPref.circleId],
      set: { pausedUntil: hours > 0 ? new Date(Date.now() + hours * 3_600_000) : null },
    });
}

/**
 * Ne plus être notifié d'une personne, sans couper le lien : on continue de la voir dans
 * l'application, elle ne fait simplement plus sonner le téléphone.
 */
export async function muteMember(
  accountId: string,
  circleId: string,
  mutedAccountId: string,
): Promise<void> {
  await db
    .insert(s.notificationMute)
    .values({ accountId, circleId, mutedAccountId })
    .onConflictDoNothing();
}

export async function unmuteMember(
  accountId: string,
  circleId: string,
  mutedAccountId: string,
): Promise<void> {
  await db
    .delete(s.notificationMute)
    .where(
      and(
        eq(s.notificationMute.accountId, accountId),
        eq(s.notificationMute.circleId, circleId),
        eq(s.notificationMute.mutedAccountId, mutedAccountId),
      ),
    );
}

/* -------------------------------------------------------------- destinataires */

export type Recipient = {
  accountId: string;
  circleId: string;
  circleName: string;
  /** La langue du destinataire : chaque téléphone sonne dans la sienne. */
  locale: string;
};

/**
 * Qui doit être notifié d'une publication.
 *
 * Départ obligé : la liste de ceux qui la voient. On n'en retire ensuite que des gens —
 * jamais on n'en ajoute.
 */
export async function recipientsFor(publicationId: string): Promise<Recipient[]> {
  const lecteurs = await readersOfPublication(publicationId);
  if (lecteurs.length === 0) return [];

  const rows = await db.execute<{
    account_id: string;
    circle_id: string;
    circle_name: string;
    locale: string;
  }>(sql`
    select distinct
      m.account_id,
      c.id as circle_id,
      -- Le titre de la notification est un nom de cercle : celui du destinataire, pas
      -- celui de l'auteur. Les deux peuvent différer, et c'est tout l'objet de l'alias.
      coalesce(m.alias, c.name) as circle_name,
      dest.locale
    from publication p
    join publication_circle pc on pc.publication_id = p.id
    join circle c on c.id = pc.circle_id and c.archived_at is null
    join circle_membership m
      on m.circle_id = c.id
     and m.left_at is null
     and m.account_id = any(${sql.param(lecteurs)}::uuid[])
    join account dest on dest.id = m.account_id
    left join notification_pref np
      on np.account_id = m.account_id and np.circle_id = c.id
    where p.id = ${publicationId}
      -- l'auteur n'est pas notifié de sa propre sortie
      and m.account_id <> p.author_id

      /*
        Le titre d'une notification est un nom de cercle, donc une divulgation.

        Partir des lecteurs ne suffit pas ici : quelqu'un peut voir une sortie par un cercle
        et être membre d'un second cercle destinataire où le lien avec l'auteur est coupé.
        La liste des destinataires était juste, le nom qui l'accompagnait ne l'était pas —
        et il aurait appris à cette personne que l'auteur publie encore là où elle croit
        n'avoir plus rien en commun avec lui.

        Chaque ligne doit donc tenir seule : le cercle qui la porte est un chemin par lequel
        ce destinataire a réellement le droit de voir cette sortie.
      */
      and not exists (
        select 1 from circle_link_cut cut
        where cut.circle_id = c.id
          and cut.account_a = least(p.author_id, m.account_id)
          and cut.account_b = greatest(p.author_id, m.account_id)
      )
      and exists (
        select 1 from circle_membership auteur
        where auteur.circle_id = c.id
          and auteur.account_id = p.author_id
          and auteur.left_at is null
      )
      -- réglages du cercle, valeurs par défaut si rien n'a été réglé
      and coalesce(
            case when p.kind = 'presence' then np.on_presence else np.on_attendance end,
            true
          )
      and (np.paused_until is null or np.paused_until <= now())
      -- personne mise en sourdine dans ce cercle
      and not exists (
        select 1 from notification_mute nm
        where nm.account_id = m.account_id
          and nm.circle_id = c.id
          and nm.muted_account_id = p.author_id
      )
    -- Quelqu'un peut être destinataire par plusieurs cercles, et une seule notification
    -- part : sans ordre, le cercle qui la titre changerait d'un envoi à l'autre pour la
    -- même sortie. Toutes les lignes sont légitimes, mais le hasard n'a rien à décider.
    order by m.account_id, circle_name, c.id
  `);

  return rows.map((r) => ({
    accountId: r.account_id,
    circleId: r.circle_id,
    circleName: r.circle_name,
    locale: r.locale,
  }));
}

/**
 * Le contenu envoyé au téléphone. Ni le nom de la personne, ni le lieu : seulement le
 * cercle et la nature du signal, pour qu'un écran verrouillé posé sur une table ne raconte
 * rien de plus qu'il ne faut.
 */
export function payloadFor(
  kind: "presence" | "attendance",
  circleName: string,
  locale = "fr",
): PushPayload {
  const t = traducteur(locale, "Notifications");
  return {
    title: circleName,
    body: kind === "presence" ? t("sortieEnCours") : t("inscriptionAjoutee"),
    url: cheminLocalise(locale, kind === "presence" ? "/maintenant" : "/agenda"),
    lang: localeSure(locale),
  };
}

/* ---------------------------------------------------------------- envoi */

export type NotifyReport = { sent: number; failed: number; recipients: number };

/**
 * Envoie une charge à tous les appareils d'un compte.
 *
 * Un abonnement qui échoue est écarté plutôt que réessayé indéfiniment : un téléphone
 * réinitialisé ou une autorisation retirée ne doivent pas faire vivre une adresse morte.
 */
async function envoyerA(
  accountId: string,
  payload: PushPayload,
  send: Sender,
  report: NotifyReport,
): Promise<void> {
  const abonnements = await db
    .select()
    .from(s.pushSubscription)
    .where(
      and(eq(s.pushSubscription.accountId, accountId), isNull(s.pushSubscription.failedAt)),
    );

  for (const abonnement of abonnements) {
    try {
      await send(
        {
          accountId,
          endpoint: abonnement.endpoint,
          p256dh: abonnement.p256dh,
          auth: abonnement.auth,
        },
        payload,
      );
      await db
        .update(s.pushSubscription)
        .set({ lastUsedAt: new Date() })
        .where(eq(s.pushSubscription.id, abonnement.id));
      report.sent += 1;
    } catch {
      await db
        .update(s.pushSubscription)
        .set({ failedAt: new Date() })
        .where(eq(s.pushSubscription.id, abonnement.id));
      report.failed += 1;
    }
  }
}

/**
 * Prévient les administrateurs d'un cercle qu'une personne demande à y entrer.
 *
 * Sans cela, une demande peut dormir des jours : rien à l'écran ne la signale tant qu'on
 * n'ouvre pas la page du cercle — juste après avoir fait scanner un code à quelqu'un.
 *
 * Le message ne nomme pas le demandeur, comme tous les autres : un écran verrouillé posé
 * sur une table ne doit rien apprendre à personne. Et il respecte la mise en pause du
 * cercle — qui a demandé le silence l'a demandé pour de bon — mais pas les réglages
 * « sorties » et « inscriptions », qui portent sur ce que publient les familles, pas sur
 * l'administration du cercle.
 */
export async function notifyJoinRequest(
  circleId: string,
  send: Sender,
): Promise<NotifyReport> {
  const admins = await db.execute<{
    account_id: string;
    circle_name: string;
    locale: string;
  }>(sql`
    select m.account_id, coalesce(m.alias, c.name) as circle_name, a.locale
    from circle_membership m
    join circle c on c.id = m.circle_id and c.archived_at is null
    join account a on a.id = m.account_id and a.deleted_at is null
    left join notification_pref np
      on np.account_id = m.account_id and np.circle_id = m.circle_id
    where m.circle_id = ${circleId}
      and m.left_at is null
      and m.role = 'admin'
      and (np.paused_until is null or np.paused_until <= now())
  `);

  const report: NotifyReport = { sent: 0, failed: 0, recipients: admins.length };

  for (const admin of admins) {
    const t = traducteur(admin.locale, "Notifications");
    await envoyerA(
      admin.account_id,
      {
        title: admin.circle_name,
        body: t("demandeAdhesion"),
        url: cheminLocalise(admin.locale, `/cercles/${circleId}`),
        lang: localeSure(admin.locale),
      },
      send,
      report,
    );
  }

  return report;
}

export async function notifyPublication(
  publicationId: string,
  send: Sender,
): Promise<NotifyReport> {
  const [publication] = await db
    .select({
      kind: s.publication.kind,
      withdrawnAt: s.publication.withdrawnAt,
      notifiedAt: s.publication.notifiedAt,
    })
    .from(s.publication)
    .where(eq(s.publication.id, publicationId))
    .limit(1);
  if (!publication) return { sent: 0, failed: 0, recipients: 0 };

  /*
    Retirée pendant la minute de silence : personne n'est prévenu, et c'est tout le sens
    de cette minute — un pouce qui a glissé se rattrape sans qu'aucun téléphone n'ait
    sonné. Déjà notifiée : on ne sonne pas deux fois, quel que soit le chemin — l'envoi
    différé et le rattrapage du planificateur passent tous les deux par ici.
  */
  if (publication.withdrawnAt || publication.notifiedAt) {
    return { sent: 0, failed: 0, recipients: 0 };
  }

  const recipients = await recipientsFor(publicationId);
  const report: NotifyReport = { sent: 0, failed: 0, recipients: recipients.length };

  // Une personne peut être destinataire par plusieurs cercles : on ne la prévient qu'une fois.
  const parCompte = new Map<string, Recipient>();
  for (const r of recipients) if (!parCompte.has(r.accountId)) parCompte.set(r.accountId, r);

  for (const recipient of parCompte.values()) {
    await envoyerA(
      recipient.accountId,
      payloadFor(publication.kind, recipient.circleName, recipient.locale),
      send,
      report,
    );
  }

  // Même sans destinataire : la publication est traitée, le rattrapage n'y reviendra pas.
  await db
    .update(s.publication)
    .set({ notifiedAt: sql`now()` })
    .where(eq(s.publication.id, publicationId));

  return report;
}

/** La minute de silence entre la confirmation d'une sortie et les téléphones qui sonnent. */
export const DELAI_AVANT_ALERTE_MS = 60_000;

/**
 * Rattraper les publications que l'envoi différé a manquées.
 *
 * L'alerte normale part du serveur, une minute après la confirmation (actions.ts). Si le
 * serveur redémarre pendant cette minute, elle serait perdue : ce passage ramasse ce qui
 * n'a été ni notifié ni retiré, encore en cours, et de moins d'un jour — au-delà, sonner
 * pour une sortie d'hier réveillerait pour rien.
 */
export async function notifyPendingPublications(send: Sender): Promise<number> {
  const enRetard = await db
    .select({ id: s.publication.id })
    .from(s.publication)
    .where(
      and(
        isNull(s.publication.notifiedAt),
        isNull(s.publication.withdrawnAt),
        sql`${s.publication.createdAt} < now() - interval '1 minute'`,
        sql`${s.publication.createdAt} > now() - interval '1 day'`,
        sql`${s.publication.endsAt} > now()`,
      ),
    );

  for (const publication of enRetard) {
    await notifyPublication(publication.id, send);
  }

  return enRetard.length;
}

/** L'expéditeur de production. Chargé à la demande pour ne pas exiger les clés en test. */
export async function webPushSender(): Promise<Sender> {
  const webpush = (await import("web-push")).default;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("Clés VAPID manquantes — npx web-push generate-vapid-keys");
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:contact@example.ch",
    publicKey,
    privateKey,
  );

  return async (target, payload) => {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
    );
  };
}

/* ------------------------------------------------- alertes de l'agenda */

/**
 * Deux façons d'être prévenu qu'une activité paraît : un mot qu'on surveille, et
 * l'inscription.
 *
 * La règle de visibilité ne s'applique pas ici, et c'est voulu : une activité de l'agenda
 * est publique, tout le monde voit la même. Ce qui se calcule dans cette section, ce n'est
 * pas qui a le droit de savoir, c'est qui a demandé à l'être. Les inscriptions des familles,
 * elles, restent régies par `notifyPublication` et par la règle.
 *
 * Le message nomme le mot-clé, qui appartient à la personne, jamais le titre de l'activité.
 * Un écran verrouillé posé sur une table apprend au mieux qu'on surveille « piscine ».
 *
 * L'alerte part à la publication, pas la veille de l'activité : pour une sortie sur
 * inscription, être prévenu tard revient à ne pas l'être.
 */

export type MotCle = { word: string; label: string };

/** Au-delà, ce n'est plus une veille, c'est un abonnement à tout l'agenda. */
export const MOTS_CLES_MAX = 10;

/** Moins de trois lettres, et le mot remonterait la moitié du calendrier. */
const LONGUEUR_MINIMALE = 3;

export async function mesMotsCles(accountId: string): Promise<MotCle[]> {
  return db
    .select({ word: s.agendaKeyword.word, label: s.agendaKeyword.label })
    .from(s.agendaKeyword)
    .where(eq(s.agendaKeyword.accountId, accountId))
    .orderBy(asc(s.agendaKeyword.label));
}

export type AjoutMotCle =
  | { ok: true }
  | { ok: false; reason: "mot_trop_court" | "trop_de_mots" };

export async function ajouterMotCle(accountId: string, saisie: string): Promise<AjoutMotCle> {
  const label = saisie.trim().slice(0, 40);
  const word = normaliser(label);
  if (word.length < LONGUEUR_MINIMALE) return { ok: false, reason: "mot_trop_court" };

  const deja = await mesMotsCles(accountId);
  if (deja.some((mot) => mot.word === word)) return { ok: true };
  if (deja.length >= MOTS_CLES_MAX) return { ok: false, reason: "trop_de_mots" };

  await db.insert(s.agendaKeyword).values({ accountId, word, label }).onConflictDoNothing();
  return { ok: true };
}

export async function retirerMotCle(accountId: string, word: string): Promise<void> {
  await db
    .delete(s.agendaKeyword)
    .where(and(eq(s.agendaKeyword.accountId, accountId), eq(s.agendaKeyword.word, word)));
}

export async function reglerAlerteInscription(
  accountId: string,
  actif: boolean,
): Promise<void> {
  await db
    .update(s.account)
    .set({ alerteInscription: actif })
    .where(eq(s.account.id, accountId));
}

export async function alerteInscriptionActive(accountId: string): Promise<boolean> {
  const [compte] = await db
    .select({ actif: s.account.alerteInscription })
    .from(s.account)
    .where(eq(s.account.id, accountId))
    .limit(1);
  return compte?.actif ?? false;
}

/**
 * Prévient pour les activités publiées depuis le dernier passage, et une seule fois.
 *
 * Une activité déjà commencée n'est pas annoncée : prévenir d'une sortie qu'on a manquée
 * n'apporte rien et sonne comme un reproche.
 */
export async function notifyNewlyPublished(send: Sender, limit = 50): Promise<NotifyReport> {
  const report: NotifyReport = { sent: 0, failed: 0, recipients: 0 };

  const activites = await db
    .select({
      id: s.event.id,
      title: s.event.title,
      description: s.event.description,
      acces: s.event.acces,
    })
    .from(s.event)
    .where(
      and(
        isNotNull(s.event.publishedAt),
        isNull(s.event.notifiedAt),
        sql`${s.event.startsAt} > now()`,
      ),
    )
    .orderBy(asc(s.event.startsAt))
    .limit(limit);

  if (activites.length === 0) return report;

  const mots = await db
    .select({
      accountId: s.agendaKeyword.accountId,
      word: s.agendaKeyword.word,
      label: s.agendaKeyword.label,
      locale: s.account.locale,
    })
    .from(s.agendaKeyword)
    .innerJoin(
      s.account,
      and(eq(s.account.id, s.agendaKeyword.accountId), isNull(s.account.deletedAt)),
    );

  const guetteurs = await db
    .select({ id: s.account.id, locale: s.account.locale })
    .from(s.account)
    .where(and(eq(s.account.alerteInscription, true), isNull(s.account.deletedAt)));

  for (const activite of activites) {
    const texte = normaliser(`${activite.title} ${activite.description ?? ""}`);
    const aPrevenir = new Map<string, PushPayload>();

    for (const mot of mots) {
      if (aPrevenir.has(mot.accountId)) continue;
      if (contient(texte, mot.word)) {
        const t = traducteur(mot.locale, "Notifications");
        aPrevenir.set(mot.accountId, {
          title: t("agendaTitre"),
          body: t("motCorrespond", { mot: mot.label }),
          url: cheminLocalise(mot.locale, `/agenda/${activite.id}`),
          lang: localeSure(mot.locale),
        });
      }
    }

    // Un mot-clé qui a déjà parlé garde la parole : il dit pourquoi, l'autre dit seulement
    // qu'il y a quelque chose.
    if (activite.acces === "inscription") {
      for (const guetteur of guetteurs) {
        if (aPrevenir.has(guetteur.id)) continue;
        const t = traducteur(guetteur.locale, "Notifications");
        aPrevenir.set(guetteur.id, {
          title: t("agendaTitre"),
          body: t("inscriptionParue"),
          url: cheminLocalise(guetteur.locale, `/agenda/${activite.id}`),
          lang: localeSure(guetteur.locale),
        });
      }
    }

    report.recipients += aPrevenir.size;
    for (const [accountId, payload] of aPrevenir) {
      await envoyerA(accountId, payload, send, report);
    }

    // Marquée même quand personne n'était concerné : sans quoi la même activité serait
    // relue à chaque passage des sources jusqu'à sa date.
    await db
      .update(s.event)
      .set({ notifiedAt: sql`now()` })
      .where(eq(s.event.id, activite.id));
  }

  return report;
}

/* ------------------------------------------------- rappels de présence */

/**
 * Le rappel avant une activité où l'on a dit « présent ».
 *
 * C'est la seule notification qui ne parle de personne d'autre : un rendez-vous avec
 * soi-même, réglé sur le compte — deux heures avant, la veille, ou jamais. Le message
 * suit la règle de tous les autres : ni titre, ni lieu — un écran verrouillé posé sur une
 * table apprend au mieux qu'on a prévu quelque chose. L'heure suffit à se souvenir de
 * quoi, et le détail est à un toucher de là.
 */

/** Les délais proposés à l'écran. Une valeur hors liste est ramenée à la plus proche. */
export const DELAIS_RAPPEL_HEURES = [2, 24] as const;

export async function reglerRappelPresence(
  accountId: string,
  heures: number | null,
): Promise<void> {
  const admis =
    heures === null
      ? null
      : [...DELAIS_RAPPEL_HEURES].reduce((a, b) =>
          Math.abs(b - heures) < Math.abs(a - heures) ? b : a,
        );

  await db
    .update(s.account)
    .set({ rappelHeuresAvant: admis })
    .where(eq(s.account.id, accountId));
}

export async function rappelPresenceHeures(accountId: string): Promise<number | null> {
  const [compte] = await db
    .select({ heures: s.account.rappelHeuresAvant })
    .from(s.account)
    .where(eq(s.account.id, accountId))
    .limit(1);
  return compte?.heures ?? null;
}

/**
 * Envoie « c'est bientôt » aux personnes inscrites dont l'activité approche.
 *
 * L'inscription est une publication : `remindedAt` y joue le rôle que `notifiedAt` joue
 * pour les alertes, et interdit de sonner deux fois. Une activité retirée de l'agenda ne
 * sonne pas — rappeler une sortie annulée enverrait une famille devant une porte close —
 * et une inscription retirée non plus.
 */
export async function notifyUpcomingAttendances(send: Sender): Promise<NotifyReport> {
  const rows = await db.execute<{
    publication_id: string;
    account_id: string;
    event_id: string;
    starts_at: Date;
    locale: string;
  }>(sql`
    select p.id as publication_id, p.author_id as account_id, e.id as event_id, e.starts_at,
           a.locale
    from publication p
    join event e on e.id = p.event_id
    join account a on a.id = p.author_id and a.deleted_at is null
    where p.kind = 'attendance'
      and p.withdrawn_at is null
      and p.reminded_at is null
      and a.rappel_heures_avant is not null
      and e.published_at is not null
      and e.withdrawn_at is null
      and e.rejected_at is null
      and e.starts_at > now()
      and e.starts_at <= now() + make_interval(hours => a.rappel_heures_avant)
    order by e.starts_at asc
    limit 200
  `);

  const report: NotifyReport = { sent: 0, failed: 0, recipients: rows.length };

  for (const row of rows) {
    // « 14:30 » s'écrit pareil dans les cinq langues servies : l'heure n'a pas besoin du
    // traducteur, seul le fuseau compte.
    const heure = new Intl.DateTimeFormat("fr-CH", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(asDateOrNull(row.starts_at) ?? new Date());

    const t = traducteur(row.locale, "Notifications");
    await envoyerA(
      row.account_id,
      {
        title: t("agendaTitre"),
        body: t("rappelBientot", { heure }),
        url: cheminLocalise(row.locale, `/agenda/${row.event_id}`),
        lang: localeSure(row.locale),
      },
      send,
      report,
    );

    // Marquée même sans appareil abonné : un rappel qui n'a nulle part où sonner
    // aujourd'hui n'a pas plus de raison de sonner demain.
    await db
      .update(s.publication)
      .set({ remindedAt: sql`now()` })
      .where(eq(s.publication.id, row.publication_id));
  }

  return report;
}
