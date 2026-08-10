/**
 * Service worker — uniquement les notifications.
 *
 * Aucune mise en cache : l'application affiche qui est dehors *maintenant*, et servir une
 * version périmée depuis un cache serait pire que d'afficher une erreur de réseau. Le
 * service worker n'existe ici que parce que les notifications push l'exigent — et parce
 * que sans lui, iOS ne délivre rien du tout.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let contenu = { title: "Totir", body: "Du nouveau dans un de vos cercles", url: "/maintenant" };

  try {
    if (event.data) contenu = { ...contenu, ...event.data.json() };
  } catch {
    // Une charge illisible ne doit pas empêcher la notification générique de s'afficher.
  }

  event.waitUntil(
    self.registration.showNotification(contenu.title, {
      body: contenu.body,
      icon: "/icon",
      badge: "/icon",
      lang: "fr",
      // Une seule notification par cercle à l'écran : on remplace plutôt que d'empiler.
      tag: contenu.title,
      renotify: true,
      data: { url: contenu.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const cible = new URL(event.notification.data?.url ?? "/maintenant", self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      // Si l'app est déjà ouverte, on l'amène au premier plan au lieu d'en ouvrir une autre.
      for (const fenetre of fenetres) {
        if (fenetre.url.startsWith(self.location.origin) && "focus" in fenetre) {
          fenetre.navigate?.(cible.href);
          return fenetre.focus();
        }
      }
      return self.clients.openWindow(cible.href);
    }),
  );
});
