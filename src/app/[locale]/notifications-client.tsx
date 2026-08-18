"use client";

/**
 * Activation des notifications, côté navigateur.
 *
 * C'est le seul composant client de l'application : demander l'autorisation et s'abonner
 * au push ne peuvent se faire que là. Tout le reste est rendu par le serveur.
 *
 * Sur iPhone, rien n'est délivré tant que l'application n'a pas été ajoutée à l'écran
 * d'accueil. Ce n'est pas une limite qu'on peut contourner : on l'explique donc au lieu de
 * proposer un bouton qui échouerait sans dire pourquoi.
 */

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type Etat =
  | "chargement"
  | "impossible"
  | "installer_dabord"
  | "proposable"
  | "refusee"
  | "active"
  | "en_cours";

/** La clé VAPID, du base64url vers le tampon binaire attendu par `pushManager`. */
function cleServeur(cle: string): ArrayBuffer {
  const complement = "=".repeat((4 - (cle.length % 4)) % 4);
  const base64 = (cle + complement).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(base64);

  const tampon = new ArrayBuffer(brut.length);
  const octets = new Uint8Array(tampon);
  for (let i = 0; i < brut.length; i += 1) octets[i] = brut.charCodeAt(i);
  return tampon;
}

function estInstallee(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari sur iOS n'expose pas display-mode : il a son propre indicateur.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function estIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function ActiverNotifications({
  clePublique,
  enregistrer,
  oublier,
}: {
  clePublique: string;
  enregistrer: (abonnement: string) => Promise<void>;
  oublier: (endpoint: string) => Promise<void>;
}) {
  const t = useTranslations("NotificationsClient");
  const [etat, setEtat] = useState<Etat>("chargement");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  /*
    Où envoyer quelqu'un dont les notifications sont refusées dépend d'où il se trouve, et
    les deux réglages n'ont rien à voir : dans un navigateur, c'est la permission accordée
    au site ; depuis l'app installée, c'est celle de l'application. Un parent qui vérifie
    l'un pendant que l'autre bloque conclut que l'app se trompe.

    Lu dans l'effet et non au rendu : `window` n'existe pas au premier passage côté serveur.
  */
  const [installee, setInstallee] = useState(false);

  useEffect(() => {
    async function regarder() {
      setInstallee(estInstallee());
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setEtat(estIOS() && !estInstallee() ? "installer_dabord" : "impossible");
        return;
      }
      if (estIOS() && !estInstallee()) {
        setEtat("installer_dabord");
        return;
      }
      if (Notification.permission === "denied") {
        setEtat("refusee");
        return;
      }

      const enregistrement = await navigator.serviceWorker.getRegistration();
      const abonnement = await enregistrement?.pushManager.getSubscription();

      if (abonnement) {
        setEndpoint(abonnement.endpoint);
        setEtat("active");
      } else {
        setEtat("proposable");
      }
    }

    regarder().catch(() => setEtat("impossible"));
  }, []);

  async function activer() {
    setEtat("en_cours");
    try {
      const enregistrement = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const autorisation = await Notification.requestPermission();
      if (autorisation !== "granted") {
        setEtat(autorisation === "denied" ? "refusee" : "proposable");
        return;
      }

      const abonnement = await enregistrement.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: cleServeur(clePublique),
      });

      await enregistrer(JSON.stringify(abonnement));
      setEndpoint(abonnement.endpoint);
      setEtat("active");
    } catch {
      setEtat("impossible");
    }
  }

  async function desactiver() {
    setEtat("en_cours");
    try {
      const enregistrement = await navigator.serviceWorker.getRegistration();
      const abonnement = await enregistrement?.pushManager.getSubscription();
      if (abonnement) {
        await abonnement.unsubscribe();
        await oublier(abonnement.endpoint);
      }
      setEndpoint(null);
      setEtat("proposable");
    } catch {
      setEtat("impossible");
    }
  }

  const bouton =
    "flex w-full items-center justify-center gap-2 rounded-[var(--radius-pilule)] px-5 py-3.5 text-center text-[1.05rem] transition-transform";

  if (etat === "chargement") {
    return <p className="text-[color:var(--color-doux)]">…</p>;
  }

  if (etat === "installer_dabord") {
    return (
      <div>
        <p className="mb-2 font-bold">{t("installerTitre")}</p>
        <p className="text-sm leading-snug text-[color:var(--color-doux)]">
          {t("installerTexte")}
        </p>
      </div>
    );
  }

  if (etat === "impossible") {
    return (
      <p className="text-[color:var(--color-doux)]">{t("impossibleTexte")}</p>
    );
  }

  if (etat === "refusee") {
    return (
      <div>
        <p className="mb-2 font-bold">{t("refuseeTitre")}</p>
        <p className="text-sm leading-snug text-[color:var(--color-doux)]">
          {installee ? t("refuseeTexteInstallee") : t("refuseeTexteNavigateur")}
        </p>
      </div>
    );
  }

  if (etat === "active") {
    return (
      <div>
        <p className="mb-3 font-bold">{t("activeTitre")}</p>
        <button
          onClick={desactiver}
          className={`${bouton} bg-[color:var(--color-surface)] font-semibold shadow-[inset_0_0_0_2px_var(--color-trait)]`}
        >
          {t("boutonDesactiver")}
        </button>
        {endpoint ? (
          <p className="mt-2 text-xs text-[color:var(--color-doux)]">{t("reglageAppareil")}</p>
        ) : null}
      </div>
    );
  }

  return (
    <button
      onClick={activer}
      disabled={etat === "en_cours"}
      className={`${bouton} bg-[color:var(--color-vert)] font-bold text-[color:var(--color-fond)] shadow-[0_3px_0_0_var(--color-socle-vert)] disabled:opacity-60`}
    >
      {etat === "en_cours" ? "…" : t("boutonActiver")}
    </button>
  );
}
