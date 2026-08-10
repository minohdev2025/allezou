/**
 * Ce que ces tests garantissent : une tâche ne tourne pas deux fois pour rien, ne repart
 * pas en boucle après un plantage, et son retard se voit.
 *
 * C'est ce qui rend vraie la phrase de DONNEES.md : « une présence expirée est effacée
 * 24 heures après son heure de fin ». Une promesse d'automatisme sans quelque chose qui
 * l'exécute, et sans trace de son exécution, n'en est pas une.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { JOBS, claimJob, jobStatus, schedulerActive, tick } from "@/lib/scheduler";
import { resetDatabase } from "@/test/helpers";

const maintenance = JOBS.find((j) => j.name === "maintenance")!;

/** Une tâche de test qui compte ses passages, pour ne pas dépendre des vraies. */
function tacheCompteuse(name: string, everyMinutes: number) {
  let passages = 0;
  return {
    job: { name, everyMinutes, libelle: name, run: async () => ++passages },
    passages: () => passages,
  };
}

beforeEach(async () => {
  await resetDatabase();
  await db.execute(sql`delete from job_run`);
});

describe("Réservation d'une tâche", () => {
  it("se réserve la première fois", async () => {
    expect(await claimJob(maintenance)).toBe(true);
  });

  it("ne se réserve pas deux fois de suite", async () => {
    await claimJob(maintenance);
    expect(await claimJob(maintenance)).toBe(false);
  });

  it("se réserve à nouveau une fois l'intervalle écoulé", async () => {
    await claimJob(maintenance);
    await db.execute(sql`
      update job_run set last_run_at = now() - interval '25 hours' where name = 'maintenance'
    `);

    expect(await claimJob(maintenance)).toBe(true);
  });

  it("se force quand on la déclenche à la main", async () => {
    await claimJob(maintenance);
    expect(await claimJob(maintenance, true)).toBe(true);
  });

  it("l'heure de départ est posée avant l'exécution", async () => {
    // Une tâche interrompue par un plantage ne doit pas repartir en boucle : elle a déjà
    // marqué son départ, elle attendra son tour suivant.
    const { job } = tacheCompteuse("plantage", 60);
    await claimJob(job);

    const [ligne] = await db.execute<{ last_run_at: Date; last_ok_at: Date | null }>(
      sql`select last_run_at, last_ok_at from job_run where name = 'plantage'`,
    );

    expect(ligne.last_run_at).not.toBeNull();
    expect(ligne.last_ok_at).toBeNull();
    expect(await claimJob(job)).toBe(false);
  });
});

describe("Passage des tâches", () => {
  it("exécute ce qui est dû, une seule fois", async () => {
    const faites = await tick();
    expect(faites.sort()).toEqual(JOBS.map((j) => j.name).sort());

    expect(await tick()).toEqual([]);
  });

  it("enregistre la réussite et son rapport", async () => {
    await tick();

    const [ligne] = await db.execute<{ last_ok_at: Date; last_report: unknown }>(
      sql`select last_ok_at, last_report from job_run where name = 'maintenance'`,
    );

    expect(ligne.last_ok_at).not.toBeNull();
    expect(ligne.last_report).toMatchObject({ presencesExpirees: 0 });
  });
});

describe("État des tâches", () => {
  it("signale comme en retard ce qui n'a jamais tourné", async () => {
    const etats = await jobStatus();

    expect(etats).toHaveLength(JOBS.length);
    expect(etats.every((e) => e.enRetard)).toBe(true);
    expect(etats.every((e) => e.lastOkAt === null)).toBe(true);
  });

  it("ne signale plus rien juste après un passage réussi", async () => {
    await tick();

    const etats = await jobStatus();
    expect(etats.every((e) => e.enRetard)).toBe(false);
    expect(etats.every((e) => e.lastError === null)).toBe(true);
  });

  it("signale à nouveau quand le retard dépasse un intervalle et demi", async () => {
    await tick();
    await db.execute(sql`
      update job_run set last_ok_at = now() - interval '40 hours' where name = 'maintenance'
    `);

    const etat = (await jobStatus()).find((e) => e.name === "maintenance");
    expect(etat?.enRetard).toBe(true);
  });
});

describe("Activation", () => {
  it("reste éteint en développement, sauf demande explicite", async () => {
    const avant = process.env.SCHEDULER;

    process.env.SCHEDULER = "0";
    expect(schedulerActive()).toBe(false);

    process.env.SCHEDULER = "1";
    expect(schedulerActive()).toBe(true);

    process.env.SCHEDULER = avant;
  });
});
