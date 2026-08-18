"use client";

/**
 * Clés d'accès, côté navigateur.
 *
 * L'appareil garde une clé privée qu'il ne révèle jamais et la déverrouille comme il le
 * fait d'habitude — empreinte, visage ou code selon le téléphone. Rien de tout cela ne nous
 * parvient : nous ne recevons qu'une signature.
 */

import { useTranslations } from "next-intl";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";

const bouton =
  "flex w-full items-center justify-center gap-2 rounded-[var(--radius-pilule)] px-5 py-3.5 text-center text-[1.05rem] transition-transform disabled:opacity-60";

const principal =
  "bg-[color:var(--color-vert)] font-bold text-[color:var(--color-fond)] shadow-[0_3px_0_0_var(--color-socle-vert)]";

const second =
  "bg-[color:var(--color-surface)] font-semibold shadow-[inset_0_0_0_2px_var(--color-trait)]";

function messagesErreur(t: ReturnType<typeof useTranslations>): Record<string, string> {
  return {
    defi_absent: t("erreurs.defi_absent"),
    cle_inconnue: t("erreurs.cle_inconnue"),
    cle_deja_enregistree: t("erreurs.cle_deja_enregistree"),
    verification_echouee: t("erreurs.verification_echouee"),
  };
}

/**
 * Le navigateur sait-il faire ? Un navigateur intégré à une application, ou très ancien : non.
 *
 * La question se pose au moment du clic et pas au rendu : la tester dans un effet ferait
 * apparaître puis disparaître le bouton, et l'on ne sait pas mieux à ce moment-là.
 */
function disponible(): boolean {
  return typeof window !== "undefined" && Boolean(window.PublicKeyCredential);
}

export function AjouterCleAcces({
  preparer,
  enregistrer,
  nomParDefaut,
}: {
  preparer: () => Promise<unknown>;
  enregistrer: (reponse: string, libelle: string) => Promise<{ ok: boolean; reason?: string }>;
  nomParDefaut: string;
}) {
  const t = useTranslations("CleAcces");
  const [etat, setEtat] = useState<"repos" | "en_cours" | "fait">("repos");
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter() {
    if (!disponible()) {
      setErreur(t("navigateurIncompatibleAjout"));
      return;
    }

    setErreur(null);
    setEtat("en_cours");
    try {
      const options = await preparer();
      const reponse = await startRegistration({
        optionsJSON: options as Parameters<typeof startRegistration>[0]["optionsJSON"],
      });
      const result = await enregistrer(JSON.stringify(reponse), nomParDefaut);

      if (result.ok) {
        setEtat("fait");
      } else {
        setEtat("repos");
        setErreur(messagesErreur(t)[result.reason ?? ""] ?? t("erreurGenerique"));
      }
    } catch {
      // Un refus au moment du déverrouillage passe aussi par ici : ce n'est pas une panne.
      setEtat("repos");
      setErreur(t("enregistrementAnnule"));
    }
  }

  if (etat === "fait") {
    return (
      <p className="font-bold text-[color:var(--color-vert)]">{t("appareilEnregistre")}</p>
    );
  }

  return (
    <div>
      <button onClick={ajouter} disabled={etat === "en_cours"} className={`${bouton} ${second}`}>
        {etat === "en_cours" ? "…" : t("boutonAjouter")}
      </button>
      {erreur ? (
        <p className="mt-2 text-sm text-[color:var(--color-corail)]">{erreur}</p>
      ) : null}
    </div>
  );
}

export function ConnexionParCleAcces({
  preparer,
  connecter,
}: {
  preparer: () => Promise<unknown>;
  connecter: (reponse: string) => Promise<{ ok: boolean; reason?: string }>;
}) {
  const t = useTranslations("CleAcces");
  const router = useRouter();
  const [etat, setEtat] = useState<"repos" | "en_cours">("repos");
  const [erreur, setErreur] = useState<string | null>(null);

  async function entrer() {
    if (!disponible()) {
      setErreur(t("navigateurIncompatibleConnexion"));
      return;
    }

    setErreur(null);
    setEtat("en_cours");
    try {
      const options = await preparer();
      const reponse = await startAuthentication({
        optionsJSON: options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });
      const result = await connecter(JSON.stringify(reponse));

      if (result.ok) {
        // `refresh` d'abord : la session vient d'être posée en cookie côté serveur, et les
        // pages déjà rendues doivent être refaites avec elle.
        router.refresh();
        router.push("/maintenant");
      } else {
        setEtat("repos");
        setErreur(messagesErreur(t)[result.reason ?? ""] ?? t("erreurGenerique"));
      }
    } catch {
      setEtat("repos");
      setErreur(null);
    }
  }

  return (
    <div className="mb-5">
      <button onClick={entrer} disabled={etat === "en_cours"} className={`${bouton} ${principal}`}>
        {etat === "en_cours" ? "…" : t("boutonEntrer")}
      </button>
      {erreur ? (
        <p className="mt-2 text-center text-sm text-[color:var(--color-corail)]">{erreur}</p>
      ) : null}
      <p className="mt-2 text-center text-sm text-[color:var(--color-doux)]">{t("aideEntrer")}</p>
    </div>
  );
}
