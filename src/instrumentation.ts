/**
 * Démarrage du planificateur.
 *
 * `register` est appelé une fois par instance du serveur, avant qu'il ne réponde. C'est le
 * seul endroit où accrocher une tâche de fond sans dépendre du système d'exploitation.
 */

export async function register() {
  // Le planificateur touche à Postgres : il n'a rien à faire dans l'exécution edge.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
