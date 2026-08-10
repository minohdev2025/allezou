import Link from "next/link";

import {
  FENETRES,
  LIBELLES_FENETRE,
  TRANCHES_AGE,
  communesDisponibles,
  upcomingCalendar,
  type Fenetre,
} from "@/lib/calendar";
import { requireAccount } from "@/lib/session";
import {
  Carte,
  Jeton,
  Navigation,
  Pastille,
  Titre,
  Vide,
  heureCourte,
  jourCourt,
  teinte,
} from "../ui";

type Params = { quand?: string; age?: string; commune?: string; cercle?: string };

/** Chaque filtre est un lien : l'agenda reste utilisable sans JavaScript, et se partage. */
function lien(actuel: Params, changement: Partial<Params>): string {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries({ ...actuel, ...changement })) {
    if (valeur) params.set(cle, valeur);
  }
  const requete = params.toString();
  return requete ? `/agenda?${requete}` : "/agenda";
}

function Puce({
  href,
  actif,
  children,
}: {
  href: string;
  actif: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="shrink-0 rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold"
      style={
        actif
          ? { background: "var(--color-vert)", color: "var(--color-fond)" }
          : {
              background: "var(--color-surface)",
              color: "var(--color-doux)",
              boxShadow: "inset 0 0 0 2px var(--color-trait)",
            }
      }
    >
      {children}
    </Link>
  );
}

function Rangee({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
      {children}
    </div>
  );
}

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const account = await requireAccount();
  const params = await searchParams;

  const quand = (FENETRES as readonly string[]).includes(params.quand ?? "")
    ? (params.quand as Fenetre)
    : "quinzaine";
  const age = params.age ? Number(params.age) : undefined;
  const avecMonCercle = params.cercle === "1";

  const [entrees, communes] = await Promise.all([
    upcomingCalendar(account.id, {
      quand,
      age: Number.isFinite(age) ? age : undefined,
      commune: params.commune,
      avecMonCercle,
    }),
    communesDisponibles(),
  ]);

  return (
    <main className="apparait">
      <Titre emoji="📅" sous="Les activités du canton, et qui de vos cercles y va.">
        Agenda
      </Titre>

      <div className="mb-6 space-y-2">
        <Rangee>
          {FENETRES.map((f) => (
            <Puce key={f} href={lien(params, { quand: f })} actif={quand === f}>
              {LIBELLES_FENETRE[f]}
            </Puce>
          ))}
        </Rangee>

        <Rangee>
          <Puce href={lien(params, { age: undefined })} actif={age === undefined}>
            Tous les âges
          </Puce>
          {TRANCHES_AGE.map((t) => (
            <Puce
              key={t.valeur}
              href={lien(params, { age: String(t.valeur) })}
              actif={age === t.valeur}
            >
              {t.libelle}
            </Puce>
          ))}
        </Rangee>

        {communes.length > 1 ? (
          <Rangee>
            <Puce href={lien(params, { commune: undefined })} actif={!params.commune}>
              Partout
            </Puce>
            {communes.map((c) => (
              <Puce
                key={c}
                href={lien(params, { commune: c })}
                actif={params.commune === c}
              >
                {c}
              </Puce>
            ))}
          </Rangee>
        ) : null}

        <Rangee>
          <Puce
            href={lien(params, { cercle: avecMonCercle ? undefined : "1" })}
            actif={avecMonCercle}
          >
            🫂 Où va quelqu&apos;un de mes cercles
          </Puce>
        </Rangee>
      </div>

      {entrees.length === 0 ? (
        <Vide emoji="🗓️" titre="Rien ne correspond">
          {avecMonCercle || age !== undefined || params.commune ? (
            <p>
              Essayez d&apos;élargir les filtres —{" "}
              <Link href="/agenda" className="font-bold underline underline-offset-4">
                tout voir
              </Link>
              .
            </p>
          ) : (
            <p>Les activités genevoises apparaîtront ici.</p>
          )}
        </Vide>
      ) : (
        <ul className="space-y-4">
          {entrees.map((entree) => {
            const date = jourCourt(entree.startsAt);
            const couleur = teinte(entree.id);

            return (
              <li key={entree.id}>
                <Carte accent={couleur}>
                  <div className="flex gap-4">
                    <div
                      aria-hidden
                      className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl px-1 text-center leading-none"
                      style={{
                        background: `var(--color-${couleur}-doux)`,
                        color: `var(--color-${couleur})`,
                      }}
                    >
                      {entree.enCours ? (
                        <span className="text-xs font-bold uppercase">en cours</span>
                      ) : (
                        <>
                          <span className="text-xs font-bold uppercase">{date.jour}</span>
                          <span className="titre text-2xl font-bold">{date.nombre}</span>
                          <span className="text-xs font-bold">{date.mois}</span>
                        </>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[color:var(--color-doux)]">
                        {entree.enCours
                          ? entree.endsAt
                            ? `jusqu'au ${jourCourt(entree.endsAt).nombre} ${jourCourt(entree.endsAt).mois}`
                            : "en ce moment"
                          : heureCourte(entree.startsAt)}
                      </p>
                      <h2 className="titre text-lg font-bold leading-tight">
                        <Link
                          href={`/agenda/${entree.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {entree.title}
                        </Link>
                      </h2>
                      {entree.place ? (
                        <p className="mt-1 text-sm text-[color:var(--color-doux)]">
                          📍 {entree.place}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entree.ageLabel ? (
                          <Pastille couleur="ambre">{entree.ageLabel}</Pastille>
                        ) : null}
                        {entree.commune ? (
                          <Pastille couleur="bleu">{entree.commune}</Pastille>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {entree.attendees.length > 0 ? (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[color:var(--color-vert-doux)] px-4 py-3">
                      <span className="flex -space-x-2">
                        {entree.attendees.slice(0, 3).map((a) => (
                          <Jeton
                            key={a.publicationId}
                            nom={a.displayName}
                            id={a.accountId}
                            taille={28}
                          />
                        ))}
                      </span>
                      <span className="text-sm font-bold text-[color:var(--color-vert)]">
                        {entree.attendees.map((a) => a.displayName).join(", ")}
                        {entree.attendees.length === 1 ? " y va" : " y vont"}
                      </span>
                    </div>
                  ) : null}

                  {entree.sourceName ? (
                    <p className="mt-3 text-xs text-[color:var(--color-doux)]">
                      Source : {entree.sourceName}
                    </p>
                  ) : null}
                </Carte>
              </li>
            );
          })}
        </ul>
      )}

      <Navigation actif="agenda" />
    </main>
  );
}
