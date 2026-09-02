import { getTranslations } from "next-intl/server";

import {
  MOTS_CLES_MAX,
  alerteInscriptionActive,
  mesMotsCles,
  rappelPresenceHeures,
} from "@/lib/notifications";
import { requireAccount } from "@/lib/session";
import {
  ajouterMotCleAgenda,
  basculerAlerteInscription,
  reglerRappel,
  retirerMotCleAgenda,
} from "../../actions";
import { Bouton, Carte, Champ, Navigation, Pastille } from "../../ui";
import { EnteteReglages } from "../_entete";

/**
 * Tout ce qui touche l'agenda au même endroit : les mots-clés qui filtrent
 * l'affichage des activités, le rappel de présence (combien de temps avant),
 * et l'alerte quand quelqu'un dit qu'il vient à une activité à laquelle on
 * est inscrit. Les trois vivent ensemble parce qu'ils partagent le même sujet
 * et qu'on n'y touche pas souvent.
 *
 * L'ordre — mots-clés, alerte inscription, rappel — suit la fréquence
 * d'usage : on ajoute un mot-clé quand un besoin surgit, on coupe l'alerte
 * quand ça déborde, on change rarement la durée du rappel.
 */
export default async function ReglagesAgenda() {
  const t = await getTranslations("Reglages");
  const account = await requireAccount();
  const [surInscription, rappelHeures, motsCles] = await Promise.all([
    alerteInscriptionActive(account.id),
    rappelPresenceHeures(account.id),
    mesMotsCles(account.id),
  ]);

  return (
    <main className="apparait">
      <EnteteReglages titre={t("agendaTitre")} />

      <Carte className="mb-4">
        <p className="mb-1 font-bold">{t("motsTitre")}</p>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("motsTexte")}
        </p>

        {motsCles.length > 0 ? (
          <ul className="mb-4 flex flex-wrap gap-2">
            {motsCles.map((mot) => (
              <li key={mot.word}>
                <form action={retirerMotCleAgenda}>
                  <input type="hidden" name="mot" value={mot.word} />
                  <button
                    className="flex items-center gap-1.5 rounded-[var(--radius-pilule)] px-3 py-1.5 text-sm font-bold"
                    style={{
                      background: "var(--color-violet-doux)",
                      color: "var(--color-violet)",
                    }}
                  >
                    {mot.label}
                    <span aria-hidden>✕</span>
                    <span className="sr-only">{t("retirerMot")}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        {motsCles.length < MOTS_CLES_MAX ? (
          <form action={ajouterMotCleAgenda} className="space-y-3">
            <Champ
              label={t("ajouterMotLabel")}
              name="mot"
              maxLength={40}
              required
              placeholder={t("ajouterMotPlaceholder")}
            />
            <Bouton variante="second" className="!py-2.5 !text-base">
              {t("ajouter")}
            </Bouton>
          </form>
        ) : (
          <p className="text-sm text-[color:var(--color-doux)]">{t("motsMax")}</p>
        )}
      </Carte>

      <Carte className="mb-4">
        <form action={basculerAlerteInscription}>
          <input type="hidden" name="actif" value={surInscription ? "0" : "1"} />
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="font-bold">{t("inscriptionTitre")}</span>
            <Pastille couleur={surInscription ? "vert" : "ambre"}>
              {surInscription ? t("etatActif") : t("etatCoupe")}
            </Pastille>
          </div>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("inscriptionTexte")}
          </p>
          <Bouton variante="second" className="!py-2.5 !text-base">
            {surInscription ? t("arreterPrevenir") : t("prevenir")}
          </Bouton>
        </form>
      </Carte>

      <Carte>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="font-bold">{t("rappelTitre")}</span>
          <Pastille couleur={rappelHeures ? "vert" : "ambre"}>
            {rappelHeures
              ? rappelHeures >= 24
                ? t("rappelVeille")
                : t("rappel2h")
              : t("rappelAucun")}
          </Pastille>
        </div>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("rappelTexte")}
        </p>
        <form action={reglerRappel} className="flex gap-2">
          {[
            { heures: 0, libelle: t("rappelAucun") },
            { heures: 2, libelle: t("rappel2h") },
            { heures: 24, libelle: t("rappelVeille") },
          ].map((choix) => {
            const actif = (rappelHeures ?? 0) === choix.heures;
            return (
              <button
                key={choix.heures}
                name="heures"
                value={choix.heures}
                className="flex-1 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                style={
                  actif
                    ? { background: "var(--color-vert-doux)", color: "var(--color-vert)" }
                    : {
                        color: "var(--color-doux)",
                        boxShadow: "inset 0 0 0 2px var(--color-trait)",
                      }
                }
              >
                {choix.libelle}
              </button>
            );
          })}
        </form>
      </Carte>
      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />

    </main>
  );
}
