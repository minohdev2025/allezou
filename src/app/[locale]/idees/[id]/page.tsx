import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";

import { TEXTE_MAX, detailIdee } from "@/lib/ideas";
import { requireAccount } from "@/lib/session";
import { localeSure } from "@/lib/traduire";
import { type Locale } from "@/i18n/routing";
import {
  Alerte,
  Bouton,
  Carte,
  Jeton,
  Navigation,
  Pastille,
  Titre,
  heureCourte,
  jourCourt,
} from "../../ui";
import { fermerIdeeAction, repondreIdeeAction, voterPourIdee } from "../../actions";

/** « 12 août à 14:30 » — le fil se relit à l'heure près, pas à la journée. */
function horodatage(date: Date, locale: Locale): string {
  const j = jourCourt(date, locale);
  return `${j.nombre} ${j.mois} à ${heureCourte(date)}`;
}

/**
 * Le fil d'une idée.
 *
 * Un seul fil, deux sens : l'auteur écrit, le support répond, l'auteur relance. C'est la
 * discussion annoncée à la création — pas une boîte de commentaires où tout le monde
 * parlerait, ni un aller simple sans réponse possible. Les autres lisent et votent depuis
 * la liste ; ici, ils regardent par-dessus l'épaule.
 *
 * L'écriture est ouverte aux deux seules parties (règle dans `idees.ts`) et fermée quand
 * l'idée est close : un dossier classé ne se rouvre pas par un message perdu.
 */
export default async function IdeaFil({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string; fermee?: string }>;
}) {
  const t = await getTranslations("IdeeFil");
  const tl = await getTranslations("Idees");
  const account = await requireAccount();
  const locale = localeSure(await getLocale());
  const { id } = await params;
  const { erreur, fermee } = await searchParams;

  const idee = await detailIdee(account, id);
  if (!idee) notFound();

  const estSupport = idee.estSupport;

  return (
    <main className="apparait">
      {/* Retour discret vers la liste, là d'où l'on est venu. */}
      <Link
        href={estSupport ? "/idees" : "/idees?miennes=1"}
        className="mb-4 inline-block text-sm text-[color:var(--color-doux)] underline underline-offset-4"
      >
        ‹ {estSupport ? tl("ongletToutes") : tl("ongletMiennes")}
      </Link>

      <Titre emoji={idee.type === "bug" ? "🐛" : "✨"}>
        <span className="mr-2 align-middle">
          <Pastille couleur={idee.etat === "fermee" ? "violet" : "bleu"}>
            {tl(`etat.${idee.etat}`)}
          </Pastille>
        </span>
        {idee.titre}
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">
          {t.has(`erreurs.${erreur}`) ? t(`erreurs.${erreur}`) : t("erreurGenerique")}
        </Alerte>
      ) : null}
      {fermee ? <Alerte ton="succes">{t("fermeeInfo")}</Alerte> : null}

      {/*
        Le fil : chaque message est une carte, celui du support accentuée — la réponse
        qu'on attend doit se voir avant d'être lue.
      */}
      <ul className="mb-6 space-y-3">
        {idee.messages.map((msg) => (
          <li key={msg.id}>
            <Carte accent={msg.support ? "vert" : undefined}>
              <div className="mb-2 flex items-center gap-2">
                <Jeton nom={msg.auteur} id={msg.authorId} taille={32} />
                <span className="min-w-0 flex-1 truncate font-bold">{msg.auteur}</span>
                {msg.support ? (
                  <span className="shrink-0 text-sm text-[color:var(--color-doux)]">
                    {t("support")}
                  </span>
                ) : null}
                <span className="shrink-0 text-sm text-[color:var(--color-doux)]">
                  {horodatage(msg.createdAt, locale)}
                </span>
              </div>
              <p className="whitespace-pre-wrap leading-snug">{msg.texte}</p>
            </Carte>
          </li>
        ))}
      </ul>

      {idee.etat === "fermee" ? (
        <p className="mb-6 text-sm text-[color:var(--color-doux)]">
          {t("cloture", { par: idee.cloturePar ?? "" })}
        </p>
      ) : null}

      {idee.peutEcrire ? (
        <form action={repondreIdeeAction} className="mb-6">
          <input type="hidden" name="idee" value={idee.id} />
          <label className="mb-1 block font-bold">
            {estSupport ? t("formLabelSupport") : t("formLabelAuteur")}
          </label>
          <textarea
            name="texte"
            required
            minLength={4}
            maxLength={TEXTE_MAX}
            rows={3}
            placeholder={t("formPlaceholder")}
            className="mb-3 w-full rounded-2xl bg-[color:var(--color-surface)] px-4 py-3.5 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
          />
          <Bouton type="submit">{t("formEnvoyer")}</Bouton>
        </form>
      ) : null}

      {/*
        Voter et fermer sont des gestes distincts de l'écriture : le vote appartient à
        qui lit, la fermeture à qui a ouvert (ou au support si l'auteur a déserté).
      */}
      <div className="mb-6 flex gap-3">
        <form action={voterPourIdee} className="flex-1">
          <input type="hidden" name="idee" value={idee.id} />
          <Bouton variante="second" type="submit">
            {idee.vote ? t("retirerVote") : `★ ${t("voter")} · ${idee.votes}`}
          </Bouton>
        </form>
        {idee.etat !== "fermee" && (idee.estAuteur || estSupport) ? (
          <form action={fermerIdeeAction} className="flex-1">
            <input type="hidden" name="idee" value={idee.id} />
            <Bouton variante="discret" type="submit">
              {t("fermer")}
            </Bouton>
          </form>
        ) : null}
      </div>

      {/* Le filet de la page : la navigation doit rester le dernier enfant de <main>. */}
      <Navigation actif="reglages" />
    </main>
  );
}
