import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listPendingRequests } from "@/lib/circles";
import { mutedIn } from "@/lib/notifications";
import { defaultAudience } from "@/lib/publications";
import { COOKIE_INVITATION, requireAccount } from "@/lib/session";
import { isCircleAdmin, readerCircles, visibleCircleMembers } from "@/lib/visibility";
import {
  accepterDemande,
  basculerDefaut,
  basculerLien,
  basculerSourdine,
  creerInvitation,
  quitterCercle,
  refuserDemande,
} from "../../actions";
import { CodeQR } from "../../qr";
import { Alerte, Bouton, Carte, Jeton, Pastille, teinte } from "../../ui";

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
          🫂
        </div>
        <h1 className="text-[1.75rem] font-bold leading-tight">{cercle.name}</h1>
        {admin ? (
          <p className="mt-2">
            <Pastille couleur={couleur}>vous l&apos;administrez</Pastille>
          </p>
        ) : null}
      </header>

      {erreur ? <Alerte ton="erreur">L&apos;invitation n&apos;a pas pu être créée.</Alerte> : null}

      {lien ? (
        <Alerte ton="succes">
          <strong className="mb-1 block text-lg">Lien d&apos;invitation créé 🔗</strong>
          <p className="mb-3 text-sm leading-snug">
            Envoyez-le aux familles concernées, ou faites-leur scanner le carré. Il vaut
            14 jours et 20 usages. Chaque personne qui le suivra devra être validée
            {admin ? " par vous" : " par un administrateur"}.
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
      <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
        Décochez quelqu&apos;un pour qu&apos;il ne voie plus vos sorties — vous ne verrez plus
        les siennes non plus, et rien ne le lui signale.
      </p>

      <ul className="mb-7 space-y-2">
        {membres.map((membre) => (
          <li
            key={membre.accountId}
            className={`flex items-center gap-3 rounded-2xl bg-[color:var(--color-surface)] px-4 py-3 ring-2 ring-[color:var(--color-trait)] ${
              membre.linkCut ? "opacity-55" : ""
            }`}
          >
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
              <div className="flex shrink-0 gap-2">
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

      <form action={creerInvitation} className="mb-3">
        <input type="hidden" name="cercle" value={id} />
        <Bouton variante="second">Créer un lien d&apos;invitation 🔗</Bouton>
      </form>

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
