import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";

import {
  DUREE_INVITATION_JOURS,
  DUREE_INVITATION_MAX_JOURS,
  USAGES_INVITATION_MAX,
  USAGES_INVITATION_PAR_DEFAUT,
  inviteInfoForToken,
  listInvites,
  listPendingRequests,
} from "@/lib/circles";
import { childrenInCircle } from "@/lib/children";
import { mutedIn } from "@/lib/notifications";
import { defaultAudience } from "@/lib/publications";
import { messageDInvitation } from "@/lib/message-invitation";
import { COOKIE_INVITATION, requireAccount } from "@/lib/session";
import { localeSure } from "@/lib/traduire";
import { isCircleAdmin, readerCircles, visibleCircleMembers } from "@/lib/visibility";
import {
  accepterDemande,
  basculerDefaut,
  basculerLien,
  basculerSourdine,
  changerRole,
  creerInvitation,
  exclureMembre,
  quitterCercle,
  rattacherEnfantCercle,
  refuserDemande,
  renommerPourMoi,
  remplacerInvitation,
  revoquerInvitation,
} from "../../actions";
import { PartageInvitation } from "../../partage-client";
import { CodeQR } from "../../qr";
import { Alerte, Bouton, Carte, Jeton, Pastille, jourCourt, teinte } from "../../ui";

export default async function Cercle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invitation?: string; erreur?: string }>;
}) {
  const account = await requireAccount();
  const { id: id } = await params;
  const { invitation, erreur } = await searchParams;
  const locale = localeSure(await getLocale());
  const t = await getTranslations("Cercle");

  // Le jeton arrive par un cookie de cinq minutes, jamais par la barre d'adresse.
  const lien = invitation ? (await cookies()).get(COOKIE_INVITATION)?.value : undefined;

  const cercle = (await readerCircles(account.id)).find((c) => c.id === id);
  if (!cercle) notFound();

  const [membres, admin, sourdines, defauts] = await Promise.all([
    visibleCircleMembers(account.id, id),
    isCircleAdmin(account.id, id),
    mutedIn(account.id, id),
    defaultAudience(account.id),
  ]);

  const enfants = await childrenInCircle(account.id, id);

  const cocheParDefaut = defauts.some((c) => c.id === id);

  const demandes = admin ? await listPendingRequests(account.id, id) : null;
  const invitations = await listInvites(account.id, id);

  const demandesEnAttente = demandes?.ok ? demandes.value.length : 0;
  // Ce que les liens encore actifs peuvent accueillir : le nombre de familles annoncé au
  // moment de les créer, moins celles qui les ont déjà suivis.
  const placesOuvertes = invitations.ok
    ? invitations.value.reduce((total, i) => total + Math.max(0, i.maxUses - i.useCount), 0)
    : 0;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const couleur = teinte(id);

  // La date de fin vient de l'invitation elle-même, retrouvée par son jeton : la déduire du
  // lien le plus récent tomberait juste presque toujours, et donnerait une date fausse le
  // jour où deux administrateurs en créent un en même temps.
  const infoLien = lien ? await inviteInfoForToken(lien) : null;
  // Le message part dans la langue de qui invite : c'est elle qui parle à son groupe.
  const messagePret = infoLien
    ? messageDInvitation(infoLien, `${appUrl}/rejoindre/${lien}`, locale)
    : null;

  return (
    <main className="apparait">
      <header className="mb-7">
        <div
          aria-hidden
          className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{ background: `var(--color-${couleur}-doux)` }}
        >
          👥
        </div>
        <h1 className="text-[1.75rem] font-bold leading-tight">{cercle.name}</h1>
        {admin ? (
          <p className="mt-2">
            <Pastille couleur={couleur}>{t("administrateurPastille")}</Pastille>
          </p>
        ) : null}
      </header>

      {/*
        Où en est ce cercle.

        Le premier parent d'un cercle a la plus mauvaise expérience du produit : il invite,
        puis attend, sans rien savoir. Ces trois nombres existaient déjà en base et ne se
        voyaient nulle part — c'est ce qui manque pour décider s'il faut relancer.
      */}
      <p className="mb-5 leading-snug text-[color:var(--color-doux)]">
        {t.rich("statutMembres", {
          count: membres.length,
          strong: (chunks) => (
            <strong className="text-[color:var(--color-encre)]">{chunks}</strong>
          ),
        })}
        {demandesEnAttente > 0 ? (
          <>
            {" · "}
            {t.rich("demandesAValider", {
              count: demandesEnAttente,
              strong: (chunks) => (
                <strong className="text-[color:var(--color-corail)]">{chunks}</strong>
              ),
            })}
          </>
        ) : null}
        {placesOuvertes > 0 ? (
          <>
            {" · "}
            {t("placesOuvertesTexte", { count: placesOuvertes })}
          </>
        ) : null}
      </p>

      {/*
        Seul, un cercle ne montre rien. Le dire vaut mieux que de laisser quelqu'un publier
        des sorties pendant une semaine avant de comprendre que personne ne les voit.
      */}
      {membres.length === 1 ? (
        <Alerte>
          <strong className="mb-1 block">{t("soloTitre")}</strong>
          {t("soloTexte")}
        </Alerte>
      ) : null}

      {erreur ? (
        <Alerte ton="erreur">
          {t.has(`erreurs.${erreur}`) ? t(`erreurs.${erreur}`) : t("erreurGenerique")}
        </Alerte>
      ) : null}

      {lien ? (
        <Alerte ton="succes">
          <strong className="mb-1 block text-lg">{t("invitationCreeTitre")}</strong>
          <p className="mb-3 text-sm leading-snug">
            {admin ? t("invitationEnvoyerAdmin") : t("invitationEnvoyerAutre")}
          </p>
          {/*
            Le jeton n'est enregistré que sous forme de condensé : cet écran est le seul
            endroit où il existe en clair, et il n'y a aucun moyen de le réafficher ensuite.
            Le taire reviendrait à laisser un administrateur le découvrir le jour où une
            famille le lui redemande.
          */}
          <p className="mb-3 text-sm leading-snug font-bold">{t("invitationUniqueAffichage")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <CodeQR valeur={`${appUrl}/rejoindre/${lien}`} />
            <code className="min-w-0 flex-1 break-all rounded-xl bg-[color:var(--color-surface)] p-3 text-sm">
              {appUrl}/rejoindre/{lien}
            </code>
          </div>

          {/*
            Le message tout prêt.

            Le lien seul laisse à l'administrateur le travail le plus ingrat du produit :
            expliquer Allezou à quinze parents, un par un, dans un groupe où personne n'a rien
            demandé. Ce texte dit ce qu'un parent veut savoir avant de cliquer — à quoi ça
            sert, que c'est gratuit et sans publicité, qu'on n'y met qu'un prénom par enfant —
            et il mène à la page des données, qui convainc mieux que n'importe quelle phrase
            qu'on improviserait.

            Il annonce la date de fin du lien, qui vient de la base et non d'un calcul
            approché : elle donne la raison de s'y mettre tout de suite plutôt que « un de ces
            jours ».

            C'est une zone de texte et non un bouton : elle se sélectionne et se copie sans
            JavaScript, sur un téléphone comme ailleurs.
          */}
          {messagePret ? (
            <>
              {/* Un toucher pour copier ou partager ; la zone de texte reste le chemin sans JavaScript. */}
              <PartageInvitation lien={`${appUrl}/rejoindre/${lien}`} message={messagePret} />
              <div className="mt-4">
                <label
                  htmlFor="message-invitation"
                  className="mb-1 block text-sm font-bold leading-snug"
                >
                  {t("messageLabel")}
                </label>
                <textarea
                  id="message-invitation"
                  readOnly
                  rows={8}
                  className="w-full rounded-xl bg-[color:var(--color-surface)] p-3 text-sm leading-snug"
                  value={messagePret}
                />
              </div>
            </>
          ) : null}
        </Alerte>
      ) : null}

      {demandes?.ok && demandes.value.length > 0 ? (
        <Carte className="mb-6" accent="ambre">
          <h2 className="titre mb-4 text-lg font-bold">
            {t("demandesTitre", { count: demandes.value.length })}
          </h2>
          {/*
            Le rempart du cercle est ici, et il est humain : suivre un lien ne fait entrer
            personne, c'est cette décision-ci qui ouvre la porte. Le rappel se pose donc au
            moment de trancher, et pas dans une page d'aide que personne n'ouvrira.
          */}
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("demandesRappel")}
          </p>
          <ul className="space-y-4">
            {demandes.value.map((demande) => (
              <li key={demande.id}>
                <div className="mb-2 flex items-center gap-3">
                  <Jeton nom={demande.displayName} id={demande.accountId} />
                  <span className="font-bold">{demande.displayName}</span>
                </div>
                <div className="flex gap-2">
                  <form action={accepterDemande} className="flex-1">
                    <input type="hidden" name="demande" value={demande.id} />
                    <input type="hidden" name="cercle" value={id} />
                    <Bouton className="!py-2.5">{t("accepterBouton")}</Bouton>
                  </form>
                  <form action={refuserDemande} className="flex-1">
                    <input type="hidden" name="demande" value={demande.id} />
                    <input type="hidden" name="cercle" value={id} />
                    <Bouton variante="second" className="!py-2.5">
                      {t("refuserBouton")}
                    </Bouton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      <h2 className="titre mb-2 text-lg font-bold">{t("membresTitre", { count: membres.length })}</h2>
      {/*
        Deux leviers voisins qui ne font pas du tout la même chose, et dont l'un se donnait
        pour toute explication un pictogramme et une infobulle — que l'on ne survole pas avec
        un pouce. Les distinguer par écrit coûte deux lignes ; les confondre coûte une
        personne qu'on croyait avoir seulement mise en sourdine.
      */}
      <p className="mb-2 text-sm leading-snug text-[color:var(--color-doux)]">
        {t.rich("decocherExplication", { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>
      <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
        {t.rich("sourdineExplication", { strong: (chunks) => <strong>{chunks}</strong> })}
      </p>

      <ul className="mb-7 space-y-2">
        {membres.map((membre) => (
          <li
            key={membre.accountId}
            className={`rounded-[var(--radius-carte)] bg-[color:var(--color-fond)] px-4 py-3 shadow-[inset_0_0_0_2px_var(--color-trait)] ${
              membre.linkCut ? "opacity-55" : ""
            }`}
          >
            <div className="flex items-center gap-3">
            <Jeton nom={membre.displayName} id={membre.accountId} taille={36} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold leading-tight">
                {membre.accountId === account.id ? t("vousMeme") : membre.displayName}
              </span>
              {membre.role === "admin" ? (
                <span className="text-sm text-[color:var(--color-doux)]">
                  {t("roleAdministrateur")}
                </span>
              ) : null}
            </span>

            {membre.accountId === account.id ? null : (
              <div className="flex shrink-0 items-center gap-2">
                {/* Sourdine : on continue de la voir, elle ne fait plus sonner le téléphone. */}
                <form action={basculerSourdine}>
                  <input type="hidden" name="cercle" value={id} />
                  <input type="hidden" name="membre" value={membre.accountId} />
                  <input
                    type="hidden"
                    name="sourdine"
                    value={sourdines.has(membre.accountId) ? "1" : "0"}
                  />
                  <button
                    aria-label={
                      sourdines.has(membre.accountId)
                        ? t("sourdineAriaActiver", { nom: membre.displayName })
                        : t("sourdineAriaCouper", { nom: membre.displayName })
                    }
                    title={
                      sourdines.has(membre.accountId)
                        ? t("sourdineTitreActiver")
                        : t("sourdineTitreCouper")
                    }
                    className="rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                    style={
                      sourdines.has(membre.accountId)
                        ? { background: "var(--color-ambre-doux)", color: "var(--color-ambre)" }
                        : { color: "var(--color-doux)" }
                    }
                  >
                    {sourdines.has(membre.accountId) ? "🔕" : "🔔"}
                  </button>
                </form>

                <form action={basculerLien}>
                  <input type="hidden" name="cercle" value={id} />
                  <input type="hidden" name="membre" value={membre.accountId} />
                  <input type="hidden" name="coupe" value={membre.linkCut ? "1" : "0"} />
                  <button
                    className="rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold"
                    style={
                      membre.linkCut
                        ? {
                            background: "var(--color-corail-doux)",
                            color: "var(--color-corail)",
                          }
                        : {
                            background: "var(--color-vert-doux)",
                            color: "var(--color-vert)",
                          }
                    }
                  >
                    {membre.linkCut ? t("lienRetablir") : t("lienDecocher")}
                  </button>
                </form>
              </div>
            )}
            </div>

            {/*
              Les deux gestes d'administration sont repliés : ils sont rares, et un bouton
              « exclure » à portée de pouce se touche par accident sur un téléphone.
            */}
            {admin && membre.accountId !== account.id ? (
              <details className="mt-2">
                <summary className="cursor-pointer py-1 text-sm font-bold text-[color:var(--color-doux)]">
                  {t("administrerSommaire")}
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={changerRole}>
                    <input type="hidden" name="cercle" value={id} />
                    <input type="hidden" name="membre" value={membre.accountId} />
                    <input
                      type="hidden"
                      name="admin"
                      value={membre.role === "admin" ? "1" : "0"}
                    />
                    <button
                      className="rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold"
                      style={{
                        background: "var(--color-bleu-doux)",
                        color: "var(--color-bleu)",
                      }}
                    >
                      {membre.role === "admin" ? t("retirerRoleAdmin") : t("nommerAdmin")}
                    </button>
                  </form>

                  <form action={exclureMembre}>
                    <input type="hidden" name="cercle" value={id} />
                    <input type="hidden" name="membre" value={membre.accountId} />
                    <button
                      className="rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold"
                      style={{
                        background: "var(--color-corail-doux)",
                        color: "var(--color-corail)",
                      }}
                    >
                      {t("retirerDuCercle")}
                    </button>
                  </form>
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ul>

      {/*
        Le nom du cercle, chez moi.

        Celui qui le crée le nomme pour lui-même. « Classe 4P » dit quelque chose au parent
        délégué et rien à celui qui a trois enfants dans trois classes.
      */}
      <Carte className="mb-5">
        <form action={renommerPourMoi} className="space-y-3">
          <input type="hidden" name="cercle" value={id} />
          <label className="block">
            <span className="mb-1 block font-bold">{t("renommerLabel")}</span>
            <span className="mb-2 block text-sm leading-snug text-[color:var(--color-doux)]">
              {t("renommerAide")}
            </span>
            <input
              name="alias"
              defaultValue={cercle.name}
              maxLength={60}
              className="w-full rounded-2xl bg-[color:var(--color-fond)] px-4 py-3 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
            />
          </label>
          <Bouton variante="second" className="!py-2.5 !text-base">
            {t("enregistrerBouton")}
          </Bouton>
        </form>
      </Carte>

      {/*
        Pourquoi je suis dans ce cercle.

        Un parent de trois enfants dans trois classes voyait ses trois cercles cochés à chaque
        sortie. Rattacher l'enfant au cercle permet à l'écran de sortie de suivre celui qui
        vient vraiment, au lieu de tout adresser à tout le monde.
      */}
      {enfants.length > 0 ? (
        <Carte className="mb-5" accent="violet">
          <p className="mb-1 font-bold">{t("enfantsTitre")}</p>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("enfantsAide")}
          </p>
          <div className="flex flex-wrap gap-2">
            {enfants.map((enfant) => (
              <form key={enfant.id} action={rattacherEnfantCercle}>
                <input type="hidden" name="cercle" value={id} />
                <input type="hidden" name="enfant" value={enfant.id} />
                <input type="hidden" name="lie" value={enfant.lie ? "0" : "1"} />
                <button
                  className="rounded-[var(--radius-pilule)] px-4 py-2 font-bold"
                  style={
                    enfant.lie
                      ? { background: "var(--color-violet)", color: "var(--color-fond)" }
                      : {
                          color: "var(--color-doux)",
                          boxShadow: "inset 0 0 0 2px var(--color-trait)",
                        }
                  }
                >
                  {enfant.firstName}
                </button>
              </form>
            ))}
          </div>
        </Carte>
      ) : null}

      <Carte className="mb-5" accent={cocheParDefaut ? "vert" : "ambre"}>
        <p className="mb-1 font-bold">
          {cocheParDefaut ? t("defautActifTitre") : t("defautInactifTitre")}
        </p>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("defautAide")}
        </p>
        <form action={basculerDefaut}>
          <input type="hidden" name="cercle" value={id} />
          <input type="hidden" name="coche" value={cocheParDefaut ? "1" : "0"} />
          <Bouton variante="second">
            {cocheParDefaut ? t("defautDesactiverBouton") : t("defautActiverBouton")}
          </Bouton>
        </form>
      </Carte>

      {/*
        Un lien d'invitation qu'on ne peut plus révoquer est une porte laissée ouverte :
        il vaut 14 jours et 20 usages, et il circule par message, donc hors de tout contrôle.
      */}
      {invitations.ok && invitations.value.length > 0 ? (
        <Carte className="mb-5" accent="ambre">
          <h2 className="titre mb-1 text-lg font-bold">
            {t("invitationsTitre", { count: invitations.value.length })}
          </h2>
          <p className="mb-2 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("invitationsAide1")}
          </p>
          {/*
            Un lien perdu est le cas courant, pas le cas rare : il circule par message, et
            l'on redemande à celui qui l'a envoyé. « Refaire le lien » évite de révoquer puis
            recréer, deux gestes avec la portée annoncée perdue au milieu.

            Mais il coupe, et il arrive avant « Créer le lien » dans la page. Quelqu'un qui
            actualise après avoir envoyé son lien cherche à le revoir, trouve ce bouton le
            premier, et casse sans le vouloir ce qu'il vient d'envoyer à quinze familles. Les
            deux cas se distinguent donc par écrit, le sans-conséquence d'abord.
          */}
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("invitationsAide2")}
          </p>
          <ul className="space-y-2">
            {invitations.value.map((invitation) => (
              <li
                key={invitation.id}
                className="rounded-2xl bg-[color:var(--color-fond)] px-4 py-3"
              >
                <p className="text-sm font-bold">
                  {t("entreesSur", { useCount: invitation.useCount, maxUses: invitation.maxUses })}
                </p>
                <p className="text-sm text-[color:var(--color-doux)]">
                  {t("invitationDates", {
                    creeNombre: jourCourt(invitation.createdAt, locale).nombre,
                    creeMois: jourCourt(invitation.createdAt, locale).mois,
                    expireNombre: jourCourt(invitation.expiresAt, locale).nombre,
                    expireMois: jourCourt(invitation.expiresAt, locale).mois,
                  })}
                </p>
                <div className="mt-3 flex gap-2">
                  <form action={remplacerInvitation} className="flex-1">
                    <input type="hidden" name="cercle" value={id} />
                    <input type="hidden" name="invitation" value={invitation.id} />
                    <input type="hidden" name="familles" value={invitation.maxUses} />
                    <button
                      className="w-full rounded-[var(--radius-pilule)] px-4 py-2.5 text-sm font-bold"
                      style={{
                        background: "var(--color-bleu-doux)",
                        color: "var(--color-bleu)",
                      }}
                    >
                      {t("refaireLienBouton")}
                    </button>
                  </form>
                  <form action={revoquerInvitation} className="flex-1">
                    <input type="hidden" name="cercle" value={id} />
                    <input type="hidden" name="invitation" value={invitation.id} />
                    <button
                      className="w-full rounded-[var(--radius-pilule)] px-4 py-2.5 text-sm font-bold"
                      style={{
                        background: "var(--color-corail-doux)",
                        color: "var(--color-corail)",
                      }}
                    >
                      {t("revoquerBouton")}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      <Carte className="mb-3" accent="bleu">
        <form action={creerInvitation} className="space-y-4">
          <input type="hidden" name="cercle" value={id} />

          <div>
            <h2 className="titre mb-1 text-lg font-bold">{t("inviterTitre")}</h2>
            <p className="text-sm leading-snug text-[color:var(--color-doux)]">
              {t("inviterAide")}
            </p>
          </div>

          <div className="flex gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-sm font-bold">{t("combienFamillesLabel")}</span>
              <input
                type="number"
                name="familles"
                defaultValue={USAGES_INVITATION_PAR_DEFAUT}
                min={1}
                max={USAGES_INVITATION_MAX}
                className="w-full rounded-xl bg-[color:var(--color-fond)] px-3 py-3 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-sm font-bold">{t("valableJoursLabel")}</span>
              <input
                type="number"
                name="jours"
                defaultValue={DUREE_INVITATION_JOURS}
                min={1}
                max={DUREE_INVITATION_MAX_JOURS}
                className="w-full rounded-xl bg-[color:var(--color-fond)] px-3 py-3 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
              />
            </label>
          </div>

          <Bouton variante="second">{t("creerLienBouton")}</Bouton>
        </form>
      </Carte>

      <form action={quitterCercle}>
        <input type="hidden" name="cercle" value={id} />
        <Bouton variante="discret">{t("quitterBouton")}</Bouton>
      </form>

      <p className="mt-7 text-center">
        <Link href="/cercles" className="text-[color:var(--color-doux)] underline underline-offset-4">
          {t("retourLien")}
        </Link>
      </p>
    </main>
  );
}
