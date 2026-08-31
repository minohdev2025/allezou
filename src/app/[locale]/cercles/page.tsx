import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { coparentCircles } from "@/lib/circles";
import { requireAccount } from "@/lib/session";
import { readerCircles } from "@/lib/visibility";
import { creerCercle, rejoindreCercleDuCoparent, rejoindreParLien } from "../actions";
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  IconeCercles,
  IconePlus,
  Navigation,
  Pastille,
  Titre,
  Vide,
  teinte,
} from "../ui";

/**
 * Les deux façons d'avoir un cercle, données comme deux gestes distincts.
 *
 * Elles ne se valent pas selon le moment : quelqu'un qui ouvre l'application pour la
 * première fois y arrive presque toujours parce qu'on l'a invité, alors que quelqu'un qui a
 * déjà des cercles vient plus souvent en créer un. L'ordre suit ce constat.
 */
function CarteInvitation({ mise = "second" }: { mise?: "principal" | "second" }) {
  const t = useTranslations("Cercles");
  return (
    <Carte accent="bleu">
      <form action={rejoindreParLien} className="space-y-5">
        <Champ
          label={t("invitationLabel")}
          aide={t("invitationAide")}
          name="lien"
          required
          autoComplete="off"
          placeholder={t("invitationPlaceholder")}
        />
        <Bouton type="submit" variante={mise}>
          {t("invitationBouton")}
        </Bouton>
      </form>
    </Carte>
  );
}

function CarteCreation() {
  const t = useTranslations("Cercles");
  return (
    <Carte accent="rose">
      <form action={creerCercle} className="space-y-5">
        <Champ
          label={t("creationLabel")}
          aide={t("creationAide")}
          name="nom"
          required
          maxLength={60}
          placeholder={t("creationPlaceholder")}
        />
        <Bouton type="submit" variante="second">
          <IconePlus className="h-5 w-5" />
          {t("creationBouton")}
        </Bouton>
      </form>
    </Carte>
  );
}

export default async function Cercles({
  searchParams,
}: {
  searchParams: Promise<{ demande?: string; erreur?: string }>;
}) {
  const account = await requireAccount();
  const { demande, erreur } = await searchParams;
  const [cercles, cerclesDeLAutreParent] = await Promise.all([
    readerCircles(account.id),
    coparentCircles(account.id),
  ]);
  const t = await getTranslations("Cercles");

  return (
    <main className="apparait">
      <Titre sous={t("sousTitre")}>
              {t("titre")}
            </Titre>

      {erreur ? (
        <Alerte ton="erreur">
          {t.has(`erreurs.${erreur}`) ? t(`erreurs.${erreur}`) : t("erreurGenerique")}
        </Alerte>
      ) : null}

      {demande ? <Alerte ton="succes">{t("demandeEnvoyee")}</Alerte> : null}

      {cercles.length === 0 ? (
        /*
          Un formulaire nu ne dit pas à quoi sert ce qu'il demande. Quelqu'un qui arrive ici
          au sortir de l'inscription n'a encore rien vu de l'application : l'écran doit dire
          ce qu'est un cercle, et pourquoi il ne se passera rien tant qu'il n'en a pas.
        */
        <Vide emoji="👥" titre={t("videTitre")}>
          <p className="leading-snug">{t("videTexte")}</p>
        </Vide>
      ) : null}

      {cercles.length > 0 ? (
        <ul className="mb-7 space-y-3">
          {cercles.map((cercle) => {
            const couleur = teinte(cercle.id);
            return (
              <li key={cercle.id}>
                <Link
                  href={`/cercles/${cercle.id}`}
                  data-bouton
                  className="flex items-center gap-4 rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] px-5 py-4"
                  style={{
                    boxShadow: `inset 0 0 0 2px var(--color-${couleur}), 0 3px 0 0 var(--color-${couleur}-doux)`,
                  }}
                >
                  <span
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `var(--color-${couleur}-doux)`,
                      color: `var(--color-${couleur})`,
                    }}
                  >
                    <IconeCercles className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="titre block text-lg font-bold leading-tight">
                      {cercle.name}
                    </span>
                    {/*
                      Trois cercles qui ne montrent qu'un nom se ressemblent tous. Le nombre
                      de familles est la première chose qui les distingue, et la seule qui
                      dise si l'un est resté vide.
                    */}
                    <span className="block text-sm text-[color:var(--color-doux)]">
                      {t("membresCount", { count: cercle.memberCount })}
                    </span>
                  </span>
                  {cercle.role === "admin" ? (
                    <Pastille couleur={couleur}>{t("etiquetteAdmin")}</Pastille>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/*
        Deux parents des mêmes enfants veulent presque toujours la classe en commun. Sans
        cet encart, il fallait redemander le lien d'invitation à quelqu'un qui l'avait envoyé
        trois semaines plus tôt. Le bouton ne fait pas entrer : il dépose une demande, et
        l'administrateur valide, comme pour n'importe quel lien.
      */}
      {cerclesDeLAutreParent.length > 0 ? (
        <Carte className="mb-7" accent="violet">
          <h2 className="titre mb-2 text-lg font-bold">{t("coparentTitre")}</h2>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("coparentTexte")}
          </p>

          <ul className="space-y-2">
            {cerclesDeLAutreParent.map((cercle) => (
              <li
                key={cercle.circleId}
                className="flex items-center gap-3 rounded-2xl bg-[color:var(--color-fond)] px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-bold">{cercle.circleName}</span>
                  <span className="text-[color:var(--color-doux)]">
                    {t("coparentMembre", { nom: cercle.coparentName })}
                  </span>
                </span>
                {cercle.demandee ? (
                  <span className="shrink-0 text-sm text-[color:var(--color-doux)]">
                    {t("coparentDemandee")}
                  </span>
                ) : (
                  <form action={rejoindreCercleDuCoparent}>
                    <input type="hidden" name="cercle" value={cercle.circleId} />
                    <button
                      className="shrink-0 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                      style={{
                        background: "var(--color-violet-doux)",
                        color: "var(--color-violet)",
                      }}
                    >
                      {t("coparentDemander")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      <div className={`space-y-4 ${cercles.length === 0 ? "mt-5" : ""}`}>
        {cercles.length === 0 ? (
          <>
            <CarteInvitation mise="principal" />
            <CarteCreation />
          </>
        ) : (
          <>
            <CarteCreation />
            <CarteInvitation />
          </>
        )}
      </div>

      <Navigation actif="cercles" />
    </main>
  );
}
