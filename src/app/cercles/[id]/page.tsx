import Link from "next/link";
import { notFound } from "next/navigation";

import { listPendingRequests } from "@/lib/circles";
import { requireAccount } from "@/lib/session";
import { isCircleAdmin, readerCircles, visibleCircleMembers } from "@/lib/visibility";
import { accepterDemande, basculerLien, creerInvitation, refuserDemande } from "../../actions";
import { Alerte, Bouton, Carte, Jeton, Pastille, teinte } from "../../ui";

export default async function Cercle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lien?: string; erreur?: string }>;
}) {
  const account = await requireAccount();
  const { id } = await params;
  const { lien, erreur } = await searchParams;

  const cercle = (await readerCircles(account.id)).find((c) => c.id === id);
  if (!cercle) notFound();

  const [membres, admin] = await Promise.all([
    visibleCircleMembers(account.id, id),
    isCircleAdmin(account.id, id),
  ]);

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
            Envoyez-le aux familles concernées, par message ou comme vous voulez. Il vaut
            14 jours et 20 usages. Chaque personne qui le suivra devra être validée
            {admin ? " par vous" : " par un administrateur"}.
          </p>
          <code className="block break-all rounded-xl bg-[color:var(--color-surface)] p-3 text-sm">
            {appUrl}/rejoindre/{lien}
          </code>
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
            )}
          </li>
        ))}
      </ul>

      <form action={creerInvitation}>
        <input type="hidden" name="cercle" value={id} />
        <Bouton variante="second">Créer un lien d&apos;invitation 🔗</Bouton>
      </form>

      <p className="mt-7 text-center">
        <Link href="/cercles" className="text-[color:var(--color-doux)] underline underline-offset-4">
          Retour aux cercles
        </Link>
      </p>
    </main>
  );
}
