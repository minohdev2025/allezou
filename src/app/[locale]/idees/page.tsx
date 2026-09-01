import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

import {
  TITRE_MAX,
  TEXTE_MAX,
  mesIdees,
  toutesLesIdees,
  type EtatIdee,
  type ResumeIdee,
} from "@/lib/ideas";
import { requireAccount } from "@/lib/session";
import { localeSure } from "@/lib/traduire";
import { type Locale } from "@/i18n/routing";
import {
  Alerte,
  Bouton,
  Champ,
  LienBouton,
  Navigation,
  Pastille,
  Titre,
  Vide,
} from "../ui";
import { proposerIdee } from "../actions";

const TeinteEtat: Record<EtatIdee, "bleu" | "vert" | "ambre" | "violet"> = {
  nouvelle: "bleu",
  repondu: "vert",
  relancee: "ambre",
  fermee: "violet",
};

/** « 12 août », sans l'année — le fil d'une idée se lit à la semaine près. */
function dateCourte(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Zurich",
  }).format(date);
}

/**
 * La boîte à idées.
 *
 * Tout le monde lit et vote ; seuls l'auteur d'une idée et le support écrivent dans son
 * fil — la règle est dans la lib, cet écran ne fait que la montrer. Les idées sont
 * publiques par défaut : une discussion cachée ne reçoit jamais de second avis, et le
 * vote n'a de sens que si l'on voit ce que les autres soutiennent déjà.
 *
 * Le formulaire d'ajout vit ici, replié derrière un bouton : une page dédiée était un
 * aller simple, alors qu'on veut pouvoir revenir à la liste d'un geste.
 */
export default async function Idees({
  searchParams,
}: {
  searchParams: Promise<{ miennes?: string; nouvelle?: string; erreur?: string }>;
}) {
  const t = await getTranslations("Idees");
  const account = await requireAccount();
  const locale = localeSure(await getLocale());
  const { miennes, nouvelle, erreur } = await searchParams;

  const liste = miennes ? await mesIdees(account.id) : await toutesLesIdees(account.id);

  return (
    <main className="apparait">
      <Titre>{t("titre")}</Titre>

      {erreur ? (
        <Alerte ton="erreur">
          {t.has(`erreurs.${erreur}`) ? t(`erreurs.${erreur}`) : t("erreurGenerique")}
        </Alerte>
      ) : null}

      <div className="mb-5 flex gap-2">
        {miennes ? (
          <LienBouton href="/idees">{t("ongletToutes")}</LienBouton>
        ) : (
          <span className="flex-1 rounded-[var(--radius-pilule)] bg-[color:var(--color-vert)] px-5 py-3.5 text-center text-[1.05rem] font-bold text-[color:var(--color-fond)]">
            {t("ongletToutes")}
          </span>
        )}
        {miennes ? (
          <span className="flex-1 rounded-[var(--radius-pilule)] bg-[color:var(--color-vert)] px-5 py-3.5 text-center text-[1.05rem] font-bold text-[color:var(--color-fond)]">
            {t("ongletMiennes")}
          </span>
        ) : (
          <LienBouton href="/idees?miennes=1">{t("ongletMiennes")}</LienBouton>
        )}
      </div>

      {nouvelle ? (
        <form action={proposerIdee} className="mb-6 space-y-4">
          <fieldset>
            <legend className="mb-2 block font-bold">{t("formTypeLabel")}</legend>
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-2.5 text-center text-sm font-semibold shadow-[inset_0_0_0_2px_var(--color-trait)]">
                <input
                  type="radio"
                  name="type"
                  value="fonctionnalite"
                  defaultChecked
                  className="accent-[color:var(--color-vert)]"
                />{" "}
                {t("formTypeFonctionnalite")}
              </label>
              <label className="flex-1 cursor-pointer rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-2.5 text-center text-sm font-semibold shadow-[inset_0_0_0_2px_var(--color-trait)]">
                <input type="radio" name="type" value="bug" className="accent-[color:var(--color-vert)]" />{" "}
                {t("formTypeBug")}
              </label>
            </div>
          </fieldset>

          <Champ
            name="titre"
            label={t("formTitreLabel")}
            required
            minLength={2}
            maxLength={TITRE_MAX}
            placeholder={t("formTitrePlaceholder")}
          />

          <label className="block">
            <span className="mb-1 block font-bold">{t("formTexteLabel")}</span>
            <textarea
              name="texte"
              required
              minLength={4}
              maxLength={TEXTE_MAX}
              rows={4}
              placeholder={t("formTextePlaceholder")}
              className="w-full rounded-2xl bg-[color:var(--color-surface)] px-4 py-3.5 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
            />
          </label>

          <Bouton type="submit">{t("formSoumettre")}</Bouton>
          <Link href="/idees" className="block text-center text-sm text-[color:var(--color-doux)] underline underline-offset-4">
            {t("formAnnuler")}
          </Link>
        </form>
      ) : (
        <LienBouton href="/idees?nouvelle=1" variante="second" className="mb-6">
          + {t("nouvelle")}
        </LienBouton>
      )}

      {liste.length === 0 ? (
        <Vide emoji="🗒️" titre={t("videTitre")}>
          {t("videTexte")}
        </Vide>
      ) : (
        <ul className="divide-y divide-[color:var(--color-trait)]">
          {liste.map((idee) => (
            <IdeeRow key={idee.id} idee={idee} locale={locale} t={t} />
          ))}
        </ul>
      )}

      {/* Le filet de la page : la navigation doit rester le dernier enfant de <main>. */}
      <Navigation actif="reglages" />
    </main>
  );
}

/** Une ligne de la liste : titre, auteur, état, votes — cliquable comme une tuile. */
function IdeeRow({
  idee,
  locale,
  t,
}: {
  idee: ResumeIdee;
  locale: Locale;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <li>
      <Link href={`/idees/${idee.id}`} className="block py-3 active:translate-y-[1px]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block font-bold leading-tight">{idee.titre}</span>
            <span className="mt-1 block text-sm text-[color:var(--color-doux)]">
              {idee.auteur} · {dateCourte(idee.createdAt, locale)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-bold text-[color:var(--color-doux)]">
              ★ {idee.votes}
            </span>
            <Pastille couleur={TeinteEtat[idee.etat]}>{t(`etat.${idee.etat}`)}</Pastille>
          </div>
        </div>
      </Link>
    </li>
  );
}
