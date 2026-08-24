"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/*
 * Bannière non-bloquante pour demander la permission de notifications push.
 *
 * Quand apparaît-elle ? Côté serveur, on décide de la rendre (elle a la props
 * `afficher`) selon que l'utilisateur a au moins un cercle. C'est le moment où
 * les notifications deviennent pertinentes : rejoindre un cercle, c'est
 * commencer à recevoir des informations des autres membres. Avant, c'est trop
 * tôt.
 *
 * Côté client, on vérifie trois fois avant d'afficher la bannière :
 *   1. Le navigateur supporte les notifications (`Notification` est défini).
 *   2. La permission est "default" : ni accordée, ni refusée. Une fois refusée,
 *      on ne ré-insiste plus.
 *   3. L'utilisateur n'a pas cliqué "Plus tard" récemment (localStorage).
 *
 * Quand on clique "Activer", on appelle `Notification.requestPermission()`. Le
 * navigateur affiche son propre dialog. C'est le geste utilisateur que le W3C
 * exige : sans clic préalable, le navigateur refusera la demande.
 *
 * Après activation ou refus, la bannière disparaît définitivement (la prop
 * `afficher` devient false côté client via le changement de permission).
 *
 * Cette bannière respecte la règle de Permissions-Policy : pas de
 * géolocalisation, et la permission n'est demandée qu'au moment opportun.
 */

const CLE_REMEMBRANCE = "allezou.notifications.demandePlusTard";
const REPRENDRE_APRES_JOURS = 7;

export function DemandeNotifications() {
  const t = useTranslations("DemandeNotifications");
  /*
    Au premier render on capture la visibilité : on a besoin de `Date.now()`,
    `localStorage` et `Notification.permission`, qui sont tous disponibles
    dès le premier render côté client. Le useState avec initialiseur
    paresseux est ce qui satisfait `react-hooks/purity` : les calculs non
    purs sont rangés dans une fonction appelée une seule fois. Si la
    bannière n'est pas visible, on retourne null immédiatement — le
    useState ci-dessous n'est jamais atteint, donc pas de hook conditionnel.
   */
  const [naturellementVisible] = useState(() => {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission !== "default") return false;
    if (typeof window === "undefined") return false;
    const memo = window.localStorage.getItem(CLE_REMEMBRANCE);
    if (!memo) return true;
    const joursPasses =
      (Date.now() - new Date(memo).getTime()) / (1000 * 60 * 60 * 24);
    return joursPasses >= REPRENDRE_APRES_JOURS;
  });
  // Après un clic (Activer ou Plus tard), on cache la bannière.
  const [cachee, setCachee] = useState(false);

  if (!naturellementVisible || cachee) return null;

  async function activer() {
    const permission = await Notification.requestPermission();
    if (permission === "default") return; // l'utilisateur a fermé le dialog sans choisir
    // Que la réponse soit "granted" ou "denied", on ne re-demandera plus.
    setCachee(true);
  }

  function plusTard() {
    window.localStorage.setItem(CLE_REMEMBRANCE, new Date().toISOString());
    setCachee(true);
  }

  return (
    <div
      role="region"
      aria-label={t("titre")}
      className="mb-6 rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] p-4 shadow-[inset_0_0_0_2px_var(--color-trait)]"
    >
      <p className="mb-2 font-bold text-[color:var(--color-encre)]">
        🔔 {t("titre")}
      </p>
      <p className="mb-3 text-sm leading-snug text-[color:var(--color-doux)]">
        {t("texte")}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={activer}
          className="flex-1 rounded-[var(--radius-pilule)] bg-[color:var(--color-vert)] px-4 py-2 font-bold text-[color:var(--color-fond)] shadow-[0_3px_0_0_var(--color-socle-vert)] active:translate-y-[2px] active:shadow-none"
        >
          {t("activer")}
        </button>
        <button
          type="button"
          onClick={plusTard}
          className="rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-2 font-semibold shadow-[inset_0_0_0_2px_var(--color-trait)]"
        >
          {t("plusTard")}
        </button>
      </div>
    </div>
  );
}
