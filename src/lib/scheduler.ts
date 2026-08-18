/**
 * Les tâches qui doivent tourner toutes seules.
 *
 * Elles vivent dans le serveur plutôt que dans un cron du système : l'hébergement visé est
 * un serveur Node ordinaire, et une planification interne se déplace avec l'application au
 * lieu de dépendre de la machine qui l'exécute.
 *
 * Deux précautions rendent cela sûr même si plusieurs instances tournaient un jour :
 *
 * 1. Chaque tâche se *réserve* dans une transaction protégée par un verrou consultatif
 *    Postgres. Deux serveurs qui démarrent en même temps ne lanceront pas le même
 *    effacement deux fois.
 * 2. L'heure de départ est enregistrée **avant** l'exécution. Une tâche interrompue par un
 *    plantage ne repart donc pas immédiatement en boucle : elle attendra son tour suivant.
 */

import { sql } from "drizzle-orm";

import { purgePastEvents } from "./calendar";
import { db } from "./db";
import { geocoderCeQuiManque } from "./geo";
import { runAllSources } from "./ingest/run";
import { purgeAll } from "./maintenance";
import {
  notifyNewlyPublished,
  notifyPendingPublications,
  notifyUpcomingAttendances,
  webPushSender,
} from "./notifications";

export type Job = {
  name: string;
  /** Intervalle minimal entre deux passages. */
  everyMinutes: number;
  libelle: string;
  run: () => Promise<unknown>;
};

export const JOBS: Job[] = [
  {
    name: "maintenance",
    everyMinutes: 24 * 60,
    libelle: "Effacements automatiques",
    run: purgeAll,
  },
  {
    name: "agenda",
    everyMinutes: 6 * 60,
    libelle: "Rafraîchissement de l'agenda",
    run: async () => {
      const rapport = await runAllSources();
      const effacees = await purgePastEvents();

      // Les alertes partent dans la foulée : c'est le passage des sources qui publie, et
      // une activité sur inscription annoncée six heures trop tard est annoncée pour rien.
      // Un envoi qui échoue ne doit pas faire échouer l'ingestion, qui a déjà eu lieu.
      let alertes = null;
      try {
        alertes = await notifyNewlyPublished(await webPushSender());
      } catch {
        // Pas de clés VAPID, ou push injoignable : l'agenda est à jour, c'est l'essentiel.
      }

      return { sources: rapport, activitesEffacees: effacees, alertes };
    },
  },
  {
    name: "geo",
    everyMinutes: 60,
    libelle: "Coordonnées des lieux",
    // Vingt adresses par heure, une par seconde : de quoi rattraper un catalogue entier en
    // une journée sans peser sur un service bénévole. Rien n'attend ces coordonnées, seuls
    // les liens de carte gagnent en précision quand elles arrivent.
    run: geocoderCeQuiManque,
  },
  {
    // Chaque tick : un rappel réglé « 2 h avant » qui partirait avec une heure de retard
    // n'aurait plus grand-chose d'un rappel.
    name: "rappels",
    everyMinutes: 5,
    libelle: "Rappels avant les activités",
    run: async () => {
      try {
        return { rappels: await notifyUpcomingAttendances(await webPushSender()) };
      } catch {
        // Pas de clés VAPID (développement, tests) : personne à rappeler.
        return { rappels: null };
      }
    },
  },
  {
    // Chaque tick (5 minutes) : le rattrapage doit passer vite, la sortie est en cours.
    name: "alertes",
    everyMinutes: 5,
    libelle: "Alertes de sortie en retard",
    // L'alerte normale part du serveur une minute après la confirmation (actions.ts). Si
    // le serveur a redémarré pendant cette minute, elle serait perdue : ce passage ramasse
    // ce qui n'a été ni notifié ni retiré. `notified_at` interdit le double envoi.
    run: async () => {
      try {
        return { rattrapees: await notifyPendingPublications(await webPushSender()) };
      } catch {
        // Pas de clés VAPID (développement, tests) : rien à envoyer, rien à rattraper.
        return { rattrapees: null };
      }
    },
  },
];

/** Toutes les cinq minutes : assez fin pour des tâches horaires, assez rare pour ne rien peser. */
export const TICK_MINUTES = 5;

/** Un entier stable par tâche, pour le verrou consultatif. */
function cle(name: string): number {
  let somme = 0;
  for (const c of name) somme = (somme * 31 + c.charCodeAt(0)) % 2_000_000_000;
  return somme;
}

/**
 * Réserve la tâche si elle est due. Renvoie faux si elle ne l'est pas, ou si un autre
 * serveur vient de la prendre.
 */
export async function claimJob(job: Job, force = false): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [{ pris }] = await tx.execute<{ pris: boolean }>(sql`
      select pg_try_advisory_xact_lock(${cle(job.name)}) as pris
    `);
    if (!pris) return false;

    const rows = await tx.execute<{ du: boolean }>(sql`
      insert into job_run (name, last_run_at)
      values (${job.name}, now())
      on conflict (name) do update
        set last_run_at = now()
        where job_run.last_run_at is null
           or job_run.last_run_at < now() - make_interval(mins => ${job.everyMinutes})
           or ${force}
      returning true as du
    `);

    return rows.length > 0;
  });
}

async function recordResult(job: Job, ok: boolean, detail: unknown): Promise<void> {
  await db.execute(sql`
    update job_run
    set last_ok_at = case when ${ok} then now() else last_ok_at end,
        last_error = ${ok ? null : String(detail).slice(0, 500)},
        last_report = ${ok ? JSON.stringify(detail ?? null) : null}::jsonb
    where name = ${job.name}
  `);
}

/** Passe en revue les tâches et exécute celles qui sont dues. */
export async function tick(force = false): Promise<string[]> {
  const executees: string[] = [];

  for (const job of JOBS) {
    if (!(await claimJob(job, force))) continue;

    try {
      const rapport = await job.run();
      await recordResult(job, true, rapport);
      executees.push(job.name);
    } catch (erreur) {
      await recordResult(job, false, erreur instanceof Error ? erreur.message : erreur);
    }
  }

  return executees;
}

export type JobStatus = {
  name: string;
  libelle: string;
  everyMinutes: number;
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
  /** Vrai si la tâche aurait dû tourner depuis un moment : c'est le signal à surveiller. */
  enRetard: boolean;
};

export async function jobStatus(): Promise<JobStatus[]> {
  const rows = await db.execute<{
    name: string;
    last_run_at: Date | null;
    last_ok_at: Date | null;
    last_error: string | null;
  }>(sql`select name, last_run_at, last_ok_at, last_error from job_run`);

  const parNom = new Map(rows.map((r) => [r.name, r]));

  return JOBS.map((job) => {
    const ligne = parNom.get(job.name);
    const dernier = ligne?.last_ok_at ? new Date(ligne.last_ok_at) : null;
    // On tolère un intervalle et demi avant de crier : un redémarrage ne doit pas alarmer.
    const limite = Date.now() - job.everyMinutes * 1.5 * 60_000;

    return {
      name: job.name,
      libelle: job.libelle,
      everyMinutes: job.everyMinutes,
      lastRunAt: ligne?.last_run_at ? new Date(ligne.last_run_at) : null,
      lastOkAt: dernier,
      lastError: ligne?.last_error ?? null,
      enRetard: dernier === null || dernier.getTime() < limite,
    };
  });
}

/* ------------------------------------------------------------------ démarrage */

let demarre = false;

/**
 * Le planificateur ne tourne pas en développement sauf demande explicite : personne n'a
 * envie qu'une base de travail se vide toute seule pendant qu'on regarde un écran.
 */
export function schedulerActive(): boolean {
  if (process.env.SCHEDULER === "1") return true;
  if (process.env.SCHEDULER === "0") return false;
  return process.env.NODE_ENV === "production";
}

export function startScheduler(): void {
  if (demarre || !schedulerActive()) return;
  demarre = true;

  const passer = () => {
    tick()
      .then((faites) => {
        if (faites.length > 0) console.log(`[planificateur] ${faites.join(", ")}`);
      })
      .catch((erreur) => console.error("[planificateur]", erreur));
  };

  // Un peu après le démarrage : le serveur doit d'abord être prêt à répondre.
  setTimeout(passer, 30_000).unref?.();
  setInterval(passer, TICK_MINUTES * 60_000).unref?.();
}
