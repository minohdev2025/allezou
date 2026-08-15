import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DUREE_INVITATION_JOURS,
  DUREE_INVITATION_MAX_JOURS,
  USAGES_INVITATION_MAX,
  USAGES_INVITATION_PAR_DEFAUT,
  listInvites,
  listPendingRequests,
} from "@/lib/circles";
import { mutedIn } from "@/lib/notifications";
import { defaultAudience } from "@/lib/publications";
import { COOKIE_INVITATION, requireAccount } from "@/lib/session";
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
  refuserDemande,
  remplacerInvitation,
  revoquerInvitation,
} from "../../actions";
import { CodeQR } from "../../qr";
import { Alerte, Bouton, Carte, Jeton, Pastille, jourCourt, teinte } from "../../ui";

const MESSAGES: Record<string, string> = {
  pas_admin: "Seul un administrateur peut faire cela.",
  cible_inconnue: "Cette personne n'est plus membre du cercle.",
  action_sur_soi: "Pour partir, utilisez « Quitter ce cercle ».",
  pas_membre: "Vous ne faites pas partie de ce cercle.",
  invitation_inconnue: "Cette invitation n'existe plus.",
};

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
            <Pastille couleur={couleur}>vous l&apos;administrez</Pastille>
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
        <strong className="text-[color:var(--color-encre)]">
          {membres.length === 1 ? "Vous êtes seul·e" : `${membres.length} familles`}
        </strong>{" "}
        dans ce cercle
        {demandesEnAttente > 0 ? (
          <>
            {" · "}
            <strong className="text-[color:var(--color-corail)]">
              {demandesEnAttente === 1 ? "1 demande" : `${demandesEnAttente} demandes`}
            </strong>{" "}
            à valider
          </>
        ) : null}
        {placesOuvertes > 0 ? (
          <>
            {" · "}
            {placesOuvertes === 1 ? "1 place ouverte" : `${placesOuvertes} places ouvertes`} sur
            vos liens
          </>
        ) : null}
      </p>

      {/*
        Seul, un cercle ne montre rien. Le dire vaut mieux que de laisser quelqu'un publier
        des sorties pendant une semaine avant de comprendre que personne ne les voit.
      */}
      {membres.length === 1 ? (
        <Alerte>
          <strong className="mb-1 block">Il manque du monde</strong>
          Tant que vous y êtes seul·e, vos sorties ne sont vues par personne. Envoyez un lien
          d&apos;invitation aux familles avec qui vos enfants aiment jouer.
        </Alerte>
      ) : null}

      {erreur ? <Alerte ton="erreur">{MESSAGES[erreur] ?? "Cela n'a pas marché."}</Alerte> : null}

      {lien ? (
        <Alerte ton="succes">
          <strong className="mb-1 block text-lg">Lien d&apos;invitation créé 🔗</strong>
          <p className="mb-3 text-sm leading-snug">
            Envoyez-le maintenant aux familles concernées, ou faites-leur scanner le carré.
            Chaque personne qui le suivra devra être validée
            {admin ? " par vous" : " par un administrateur"}.
          </p>
          {/*
            Le jeton n'est enregistré que sous forme de condensé : cet écran est le seul
            endroit où il existe en clair, et il n'y a aucun moyen de le réafficher ensuite.
            Le taire reviendrait à laisser un administrateur le découvrir le jour où une
            famille le lui redemande.
          */}
          <p className="mb-3 text-sm leading-snug font-bold">
            C&apos;est la seule fois qu&apos;il s&apos;affiche. Copiez-le ou envoyez-le tout
            de suite : plus bas, vous ne verrez que sa durée et le nombre d&apos;entrées.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <CodeQR valeur={`${appUrl}/rejoindre/${lien}`} />
            <code className="min-w-0 flex-1 break-all rounded-xl bg-[color:var(--color-surface)] p-3 text-sm">
              {appUrl}/rejoindre/{lien}
            </code>
          </div>
        </Alerte>
      ) : null}

      {demandes?.ok && demandes.value.length > 0 ? (
        <Carte className="mb-6" accent="ambre">
          <h2 className="titre mb-4 text-lg font-bold">
            {demandes.value.length === 1
              ? "Une personne demande à entrer"
              : `${demandes.value.length} personnes demandent à entrer`}
          </h2>
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
                    <Bouton className="!py-2.5">Accepter</Bouton>
                  </form>
                  <form action={refuserDemande} className="flex-1">
                    <input type="hidden" name="demande" value={demande.id} />
                    <input type="hidden" name="cercle" value={id} />
                    <Bouton variante="second" className="!py-2.5">
                      Refuser
                    </Bouton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      <h2 className="titre mb-2 text-lg font-bold">
        {membres.length} membre{membres.length > 1 ? "s" : ""}
      </h2>
      {/*
        Deux leviers voisins qui ne font pas du tout la même chose, et dont l'un se donnait
        pour toute explication un pictogramme et une infobulle — que l'on ne survole pas avec
        un pouce. Les distinguer par écrit coûte deux lignes ; les confondre coûte une
        personne qu'on croyait avoir seulement mise en sourdine.
      */}
      <p className="mb-2 text-sm leading-snug text-[color:var(--color-doux)]">
        <strong>Décocher</strong> coupe la visibilité dans les deux sens : cette personne ne
        voit plus vos sorties, vous ne voyez plus les siennes, et rien ne le lui signale.
      </p>
      <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
        <strong>🔔 et 🔕</strong> ne touchent qu&apos;au téléphone : mettre quelqu&apos;un en
        sourdine, c&apos;est ne plus être prévenu de ses sorties tout en continuant à les
        voir à l&apos;écran.
      </p>

      <ul className="mb-7 space-y-2">
        {membres.map((membre) => (
          <li
            key={membre.accountId}
            className={`rounded-2xl bg-[color:var(--color-surface)] px-4 py-3 ring-2 ring-[color:var(--color-trait)] ${
              membre.linkCut ? "opacity-55" : ""
            }`}
          >
            <div className="flex items-center gap-3">
            <Jeton nom={membre.displayName} id={membre.accountId} taille={36} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold leading-tight">
                {membre.accountId === account.id ? "Vous" : membre.displayName}
              </span>
              {membre.role === "admin" ? (
                <span className="text-sm text-[color:var(--color-doux)]">administrateur</span>
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
                        ? `Être à nouveau prévenu des sorties de ${membre.displayName}`
                        : `Ne plus être prévenu des sorties de ${membre.displayName}`
                    }
                    title={
                      sourdines.has(membre.accountId)
                        ? "Être à nouveau prévenu"
                        : "Ne plus être prévenu"
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
                    {membre.linkCut ? "Rétablir" : "Décocher"}
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
                  Administrer cette personne
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
                      {membre.role === "admin"
                        ? "Retirer le rôle d'administrateur"
                        : "Nommer administrateur"}
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
                      Retirer du cercle
                    </button>
                  </form>
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ul>

      <Carte className="mb-5" accent={cocheParDefaut ? "vert" : "ambre"}>
        <p className="mb-1 font-bold">
          {cocheParDefaut
            ? "Vos sorties partent vers ce cercle"
            : "Vos sorties ne partent pas vers ce cercle"}
        </p>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          C&apos;est le réglage par défaut au moment de publier. Vous voyez toujours les
          sorties des autres, quoi qu&apos;il en soit.
        </p>
        <form action={basculerDefaut}>
          <input type="hidden" name="cercle" value={id} />
          <input type="hidden" name="coche" value={cocheParDefaut ? "1" : "0"} />
          <Bouton variante="second">
            {cocheParDefaut ? "Ne plus y publier par défaut" : "Y publier par défaut"}
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
            {invitations.value.length === 1
              ? "Un lien d'invitation est actif"
              : `${invitations.value.length} liens d'invitation sont actifs`}
          </h2>
          <p className="mb-2 text-sm leading-snug text-[color:var(--color-doux)]">
            Tant qu&apos;un lien vit, quiconque l&apos;a reçu peut demander à entrer. Révoquez
            celui qui a circulé trop loin. Passé sa date, le cercle continue de vivre : c&apos;est
            seulement l&apos;entrée qui se referme.
          </p>
          {/*
            Un lien perdu est le cas courant, pas le cas rare : il circule par message, et
            l'on redemande à celui qui l'a envoyé. Sans ce bouton, la seule issue est de
            révoquer puis recréer — deux gestes, avec la portée annoncée perdue au milieu.
          */}
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            Un lien ne se réaffiche jamais. « Refaire le lien » en crée un nouveau pour le
            même nombre de familles et coupe l&apos;ancien pour tout le monde, y compris ceux
            à qui il avait déjà été transmis.
          </p>
          <ul className="space-y-2">
            {invitations.value.map((invitation) => (
              <li
                key={invitation.id}
                className="rounded-2xl bg-[color:var(--color-fond)] px-4 py-3"
              >
                <p className="text-sm font-bold">
                  {invitation.useCount} entrée{invitation.useCount > 1 ? "s" : ""} sur{" "}
                  {invitation.maxUses}
                </p>
                <p className="text-sm text-[color:var(--color-doux)]">
                  créé le {jourCourt(invitation.createdAt).nombre}{" "}
                  {jourCourt(invitation.createdAt).mois}, expire le{" "}
                  {jourCourt(invitation.expiresAt).nombre}{" "}
                  {jourCourt(invitation.expiresAt).mois}
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
                      Refaire le lien 🔗
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
                      Révoquer
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
            <h2 className="titre mb-1 text-lg font-bold">Inviter des familles</h2>
            <p className="text-sm leading-snug text-[color:var(--color-doux)]">
              Annoncez combien de familles vous attendez : le lien cesse de fonctionner une
              fois ce nombre atteint, même s&apos;il a été transféré plus loin.
            </p>
          </div>

          <div className="flex gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-sm font-bold">Combien de familles</span>
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
              <span className="mb-1 block text-sm font-bold">Valable (jours)</span>
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

          <Bouton variante="second">Créer le lien 🔗</Bouton>
        </form>
      </Carte>

      <form action={quitterCercle}>
        <input type="hidden" name="cercle" value={id} />
        <Bouton variante="discret">Quitter ce cercle</Bouton>
      </form>

      <p className="mt-7 text-center">
        <Link href="/cercles" className="text-[color:var(--color-doux)] underline underline-offset-4">
          Retour aux cercles
        </Link>
      </p>
    </main>
  );
}
