import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { circlesByChild, myChildren } from "@/lib/children";
import { lieuxFavoris, lieuxMasques, searchPlaces } from "@/lib/places";
import { defaultAudience, dureesProposees, lastOuting } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { readerCircles } from "@/lib/visibility";
import { declarerSortie } from "../actions";
import { ChoixDuLieu } from "./choix-lieu-client";
import { LiaisonEnfantsCercles } from "./liaison-client";
import {
  Alerte,
  LienBouton,
  PUCE_COCHEE,
  Titre,
  Vide,
  teinte,
} from "../ui";

/**
 * Choisir un lieu — dans la liste ou sur la carte — puis confirmer. Rien ne part avant.
 *
 * L'heure et la durée sont au-dessus, déjà réglées sur « maintenant, 2 heures » — on n'y
 * touche que si l'on veut autre chose. Tout tient dans un seul formulaire : des boutons
 * radio pour le lieu, un bouton de confirmation qui nomme ce qui va partir, et les
 * réglages voyagent avec, sans une ligne de JavaScript obligatoire (choix-lieu-client).
 *
 * La première version publiait au toucher du lieu. Un geste de moins, mais c'était le
 * geste d'un pouce qui glisse — et une sortie partait au mauvais parc, vers de vraies
 * familles. La confirmation rend la sortie relisible avant d'exister, et donne à la
 * carte le droit de proposer « Choisir ce lieu » sans en faire un bouton de publication.
 */
export default async function Sortir({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const account = await requireAccount();
  const t = await getTranslations("Sortir");
  const { erreur } = await searchParams;

  const MESSAGES: Record<string, string> = {
    aucun_destinataire: t("erreurs.aucun_destinataire"),
    cercle_interdit: t("erreurs.cercle_interdit"),
    lieu_inconnu: t("erreurs.lieu_inconnu"),
    duree_invalide: t("erreurs.duree_invalide"),
    debut_invalide: t("erreurs.debut_invalide"),
  };

  const [lieux, cercles, defauts, enfants, derniere, cerclesParEnfant, favoris, masques] =
    await Promise.all([
      searchPlaces("", 60),
      readerCircles(account.id),
      defaultAudience(account.id),
      myChildren(account.id),
      lastOuting(account.id),
      circlesByChild(account.id),
      lieuxFavoris(account.id),
      lieuxMasques(account.id),
    ]);

  const cerclesCoches = new Set(defauts.map((c) => c.id));

  const durees = dureesProposees();
  const dureeParDefaut = durees.find((d) => d.minutes === 120)?.libelle ?? "2 h";

  return (
    <main className="apparait">
      <Titre emoji="🌳" sous={t("sousTitre")}>
        {t("titre")}
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">{MESSAGES[erreur] ?? t("erreurGenerique")}</Alerte>
      ) : null}

      {/*
        « Comme la dernière fois » a vécu ici en bouton d'envoi : un toucher par erreur
        publiait vers de vraies familles. Le dernier lieu est désormais présélectionné
        dans le choix, en dessous — même raccourci, mais la confirmation reste la porte.
        La recherche, elle, vit dans la zone des lieux (choix-lieu-client) : elle filtre
        ce qu'elle a sous les yeux, sans rechargement qui emporterait les réglages.
      */}

      {/*
        Sans cercle, toucher un lieu ne publierait rien : la sortie est refusée faute de
        destinataire. Montrer la liste quand même, c'est tendre un piège au premier écran de
        quelqu'un qui vient d'arriver.
      */}
      {cercles.length === 0 ? (
        <Vide emoji="👥" titre={t("videCercleTitre")}>
          <p className="mb-4">{t("videCercleTexte")}</p>
          <LienBouton href="/cercles" variante="principal">
            {t("creerRejoindreCercle")}
          </LienBouton>
        </Vide>
      ) : lieux.length === 0 ? (
        <Vide emoji="📍" titre={t("videLieuTitre")}>
          <Link href="/sortir/lieu" className="font-bold underline underline-offset-4">
            {t("ajouterPremierLieu")}
          </Link>
        </Vide>
      ) : (
        <form action={declarerSortie} data-sortie>
          <LiaisonEnfantsCercles parEnfant={cerclesParEnfant} />
          {/*
            Le destinataire est le seul réglage qui ne se replie pas.

            « Le destinataire retenu doit être écrit en toutes lettres dans le geste de
            publication » : un cercle coché en silence est le moyen le plus probable de
            diffuser une sortie au mauvais monde. Il est donc coché d'avance selon les
            réglages du cercle, mais visible et décochable ici, pour cette sortie-là, sans
            toucher aux réglages des suivantes.
          */}
          <fieldset className="mb-4">
            <legend className="mb-2 font-bold">{t("visiblePar")}</legend>
            {cercles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {cercles.map((cercle) => (
                  <label key={cercle.id}>
                    <input
                      type="checkbox"
                      name="cercle"
                      value={cercle.id}
                      defaultChecked={cerclesCoches.has(cercle.id)}
                      className="peer sr-only"
                    />
                    <span
                      className={`inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none ${PUCE_COCHEE[teinte(cercle.id)]}`}
                    >
                      {cercle.name}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-snug text-[color:var(--color-doux)]">
                {t("aucunCercle")}
              </p>
            )}
          </fieldset>

          {/*
            Les réglages sont repliés au-dessus des lieux plutôt qu'étalés devant eux.

            Mesuré avant ce changement : le premier lieu commençait à 797 px sur un écran de
            812 — l'action principale de l'écran le plus pressé de l'application était sous
            la ligne de flottaison, derrière trois champs qu'on ne touche presque jamais.

            Repliés au-dessus et non déplacés en dessous : un réglage placé sous la liste ne
            se trouverait qu'après avoir touché un lieu, c'est-à-dire après la publication.
            Le résumé rappelle ce qui partira si l'on ne touche à rien.
          */}
          <details className="mb-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-3 shadow-[inset_0_0_0_2px_var(--color-trait)]">
              <span className="min-w-0 truncate text-sm text-[color:var(--color-doux)]">
                {enfants.length > 0
                  ? t.rich("resumeAvecEnfants", {
                      noms: enfants.map((e) => e.firstName).join(", "),
                      duree: dureeParDefaut,
                      strong: (chunks) => (
                        <strong className="text-[color:var(--color-encre)]">{chunks}</strong>
                      ),
                    })
                  : t.rich("resumeSansEnfants", {
                      duree: dureeParDefaut,
                      strong: (chunks) => (
                        <strong className="text-[color:var(--color-encre)]">{chunks}</strong>
                      ),
                    })}
              </span>
              <span className="shrink-0 text-sm font-bold text-[color:var(--color-vert)]">
                {t("changer")}
              </span>
            </summary>

            <div className="mt-4">
          {enfants.length > 0 ? (
            <fieldset className="mb-4">
              <legend className="mb-2 font-bold">{t("quiVient")}</legend>
              <div className="flex flex-wrap gap-2">
                {enfants.map((enfant) => (
                  <label key={enfant.id}>
                    <input
                      type="checkbox"
                      name="enfant"
                      value={enfant.id}
                      defaultChecked
                      className="peer sr-only"
                    />
                    <span className="inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-violet)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none">
                      {enfant.firstName}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className="mb-4">
            <legend className="mb-2 font-bold">{t("combienDeTemps")}</legend>
            <div className="flex gap-2">
              {durees.map((duree) => (
                <label key={duree.minutes} className="flex-1">
                  <input
                    type="radio"
                    name="duree"
                    value={duree.minutes}
                    defaultChecked={duree.minutes === 120}
                    className="peer sr-only"
                  />
                  <span className="flex h-12 cursor-pointer items-center justify-center rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] text-center font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-vert)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none">
                    {duree.libelle}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mb-5 block">
            <span className="mb-1 block font-bold">{t("aPartirDeQuand")}</span>
            <span className="mb-2 block text-sm text-[color:var(--color-doux)]">
              {t("laissezVide")}
            </span>
            <input
              type="datetime-local"
              name="debut"
              className="w-full rounded-2xl bg-[color:var(--color-surface)] px-4 py-3.5 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
            />
          </label>
            </div>
          </details>

          <ChoixDuLieu
            lieux={lieux.map((lieu) => ({
              id: lieu.id,
              name: lieu.name,
              commune: lieu.commune,
              address: lieu.address,
              categorie: lieu.categorie,
              lat: lieu.lat,
              lon: lieu.lon,
            }))}
            dernierLieuId={derniere?.placeId ?? null}
            favorisInitiaux={favoris}
            masquesInitiaux={masques}
            cleApi={process.env.GOOGLE_MAPS_API_KEY ?? null}
            mapId={process.env.GOOGLE_MAPS_MAP_ID ?? null}
          />
        </form>
      )}

      {/* « Pas dans la liste » vit désormais sous la liste elle-même (choix-lieu-client). */}
      <p className="mt-7 text-center">
        <Link
          href="/maintenant"
          className="text-[color:var(--color-doux)] underline underline-offset-4"
        >
          {t("annuler")}
        </Link>
      </p>
    </main>
  );
}
