import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { notFound } from "next/navigation";

import { myChildren } from "@/lib/children";
import { myChildrenOnPublication } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { listeFr } from "@/lib/texte";
import {
  canSeePublication,
  visibleParticipants,
  visiblePublications,
} from "@/lib/visibility";
import {
  corrigerEnfants,
  enregistrerMot,
  prolongerSortie,
  quitterSortie,
  retirerSortie,
} from "../../actions";
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  IconeHorloge,
  Jeton,
  Pastille,
  heureCourte,
  jourCourt,
  lienCarte,
  teinte,
} from "../../ui";

/**
 * Le détail d'une sortie : c'est là qu'on corrige après coup.
 *
 * L'écran principal doit rester à deux gestes, donc tout ce qui se règle rarement — qui est
 * finalement venu, un mot, une heure de plus — vit ici plutôt que d'alourdir le geste.
 */
export default async function Sortie({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const t = await getTranslations("Sortie");
  const locale = (await getLocale()) as Locale;
  const account = await requireAccount();
  const { id } = await params;
  const { erreur } = await searchParams;

  if (!(await canSeePublication(account.id, id))) notFound();

  const [sortie] = (await visiblePublications(account.id)).filter((p) => p.id === id);
  if (!sortie) notFound();

  const [participants, mesEnfants, presents] = await Promise.all([
    visibleParticipants(account.id, id),
    myChildren(account.id),
    myChildrenOnPublication(account.id, id),
  ]);

  const cestMoi = sortie.authorId === account.id;
  const moi = participants.find((p) => p.accountId === account.id);
  const mesEnfantsPresents = new Set(presents);
  const aVenir = sortie.startsAt > new Date();
  const couleur = teinte(sortie.placeId ?? sortie.id);

  const MESSAGES: Record<string, string> = {
    duree_invalide: t("erreurs.duree_invalide"),
    note_invalide: t("erreurs.note_invalide"),
    pas_auteur: t("erreurs.pas_auteur"),
  };

  return (
    <main className="apparait">
      <header className="mb-6">
        <div
          aria-hidden
          className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{ background: `var(--color-${couleur}-doux)` }}
        >
          📍
        </div>
        <h1 className="text-[1.75rem] font-bold leading-tight">{sortie.placeName}</h1>

        {/*
          L'adresse est ici, sur l'écran où quelqu'un décide de venir. Un nom de parc suffit
          à qui le connaît déjà, et ne dit rien à la famille d'un autre quartier.
        */}
        {sortie.placeAddress ? (
          <p className="mt-1">
            <a
              href={lienCarte(sortie.placeName ?? "", sortie.placeAddress, null, {
                lat: sortie.placeLat,
                lon: sortie.placeLon,
              })}
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--color-doux)] underline underline-offset-4"
            >
              {sortie.placeAddress} ↗
            </a>
          </p>
        ) : null}

        <p className="mt-2 flex items-center gap-2 text-[color:var(--color-doux)]">
          <IconeHorloge className="h-5 w-5" />
          {aVenir
            ? t("dateAVenir", {
                jour: jourCourt(sortie.startsAt, locale).jour,
                nombre: jourCourt(sortie.startsAt, locale).nombre,
                mois: jourCourt(sortie.startsAt, locale).mois,
                debut: heureCourte(sortie.startsAt),
                fin: heureCourte(sortie.endsAt),
              })
            : t("dateEnCours", { fin: heureCourte(sortie.endsAt) })}
        </p>
      </header>

      {erreur ? (
        <Alerte ton="erreur">{MESSAGES[erreur] ?? t("erreurAjustement")}</Alerte>
      ) : null}

      {sortie.note ? (
        <Carte className="mb-5" accent="ambre">
          <p>{sortie.note}</p>
        </Carte>
      ) : null}

      <h2 className="titre mb-3 text-lg font-bold">
        {t("familles", { n: participants.length })}
      </h2>
      <ul className="mb-7 space-y-2">
        {participants.map((p) => (
          <li
            key={p.accountId}
            className="flex items-center gap-3 rounded-2xl bg-[color:var(--color-surface)] px-4 py-3 shadow-[inset_0_0_0_2px_var(--color-trait)]"
          >
            <Jeton nom={p.displayName} id={p.accountId} taille={36} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold leading-tight">
                {p.accountId === account.id ? t("vous") : p.displayName}
              </span>
              {p.children.length > 0 ? (
                <span className="text-sm text-[color:var(--color-doux)]">
                  {t("avecEnfants", { liste: listeFr(p.children) })}
                </span>
              ) : null}
            </span>
            {p.isAuthor ? <Pastille couleur={couleur}>{t("aPropose")}</Pastille> : null}
          </li>
        ))}
      </ul>

      {moi && mesEnfants.length > 0 ? (
        <Carte className="mb-5" accent="violet">
          <form action={corrigerEnfants}>
            <input type="hidden" name="sortie" value={id} />
            <p className="mb-1 font-bold">{t("quiEstAvecVous")}</p>
            <p className="mb-3 text-sm text-[color:var(--color-doux)]">
              {t("decochez")}
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              {mesEnfants.map((enfant) => (
                <label key={enfant.id}>
                  <input
                    type="checkbox"
                    name="enfant"
                    value={enfant.id}
                    defaultChecked={mesEnfantsPresents.has(enfant.id)}
                    className="peer sr-only"
                  />
                  <span
                    className="inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-violet)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none"
                  >
                    {enfant.firstName}
                  </span>
                </label>
              ))}
            </div>
            <Bouton variante="second">{t("mettreAJour")}</Bouton>
          </form>
        </Carte>
      ) : null}

      {cestMoi ? (
        <>
          <Carte className="mb-5" accent="bleu">
            <form action={enregistrerMot} className="space-y-4">
              <input type="hidden" name="sortie" value={id} />
              <Champ
                label={t("motLabel")}
                aide={t("motAide")}
                name="mot"
                maxLength={140}
                defaultValue={sortie.note ?? ""}
                placeholder={t("motPlaceholder")}
              />
              <Bouton variante="second">{t("enregistrer")}</Bouton>
            </form>
          </Carte>

          {!aVenir ? (
            <form action={prolongerSortie} className="mb-3">
              <input type="hidden" name="sortie" value={id} />
              <Bouton variante="second">{t("encoreUneHeure")}</Bouton>
            </form>
          ) : null}

          <form action={retirerSortie}>
            <input type="hidden" name="sortie" value={id} />
            <Bouton variante="second">
              {aVenir ? t("annulerCetteSortie") : t("nousRentrons")}
            </Bouton>
          </form>
        </>
      ) : moi ? (
        <form action={quitterSortie}>
          <input type="hidden" name="sortie" value={id} />
          <Bouton variante="second">{t("finalementNousNeVenonsPas")}</Bouton>
        </form>
      ) : null}

      <p className="mt-7 text-center">
        <Link
          href="/maintenant"
          className="text-[color:var(--color-doux)] underline underline-offset-4"
        >
          {t("retour")}
        </Link>
      </p>
    </main>
  );
}
