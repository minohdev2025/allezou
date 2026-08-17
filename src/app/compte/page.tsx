import Link from "next/link";

import { myChildren } from "@/lib/children";
import { mesCles } from "@/lib/passkeys";
import { estRelecteur, requireAccount } from "@/lib/session";
import {
  accepterCoparent,
  ajouterEnfantCompte,
  changerNom,
  enregistrerCleAcces,
  inviterAutreParent,
  oublierCleAcces,
  preparerCleAcces,
  renommerEnfant,
  retirerEnfant,
  seDeconnecter,
  supprimerCompte,
} from "../actions";
import { AjouterCleAcces } from "../passkey-client";
import { CodeQR } from "../qr";
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  LienBouton,
  Navigation,
  Titre,
  jourCourt,
  teinte,
} from "../ui";

const MESSAGES: Record<string, string> = {
  nom: "Il faut écrire quelque chose.",
  prenom: "Il faut un prénom.",
  confirmation: "Écrivez SUPPRIMER en toutes lettres pour confirmer.",
  invitation_inconnue: "Ce lien de co-parent n'existe pas.",
  invitation_utilisee: "Ce lien a déjà servi.",
  invitation_expiree: "Ce lien a expiré.",
  invitation_revoquee: "Ce lien a été annulé.",
  invitation_a_soi: "Ce lien est le vôtre : donnez-le à l'autre parent.",
};

export default async function Compte({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; coparent?: string; rejoindre?: string }>;
}) {
  const account = await requireAccount();
  const { erreur, coparent, rejoindre } = await searchParams;
  const [enfants, cles] = await Promise.all([myChildren(account.id), mesCles(account.id)]);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const relecteur = estRelecteur(account);

  return (
    <main className="apparait">
      <Titre emoji="🙂" sous={account.email}>
        Votre compte
      </Titre>

      {erreur ? <Alerte ton="erreur">{MESSAGES[erreur] ?? "Cela n'a pas marché."}</Alerte> : null}

      {coparent ? (
        <Alerte ton="succes">
          <strong className="mb-1 block">Lien pour l&apos;autre parent 🔗</strong>
          <p className="mb-2 text-sm leading-snug">
            Donnez-le à la personne qui élève les mêmes enfants. Il vaut 14 jours et ne sert
            qu&apos;une fois. Elle verra alors les mêmes prénoms que vous.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <CodeQR valeur={`${appUrl}/compte?rejoindre=${coparent}`} />
            <code className="min-w-0 flex-1 break-all rounded-xl bg-[color:var(--color-surface)] p-3 text-sm">
              {appUrl}/compte?rejoindre={coparent}
            </code>
          </div>
        </Alerte>
      ) : null}

      {rejoindre ? (
        <Carte className="mb-5" accent="ambre">
          <h2 className="titre mb-2 text-lg font-bold">Rejoindre les enfants d&apos;un parent</h2>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            Vous verrez les mêmes prénoms d&apos;enfants que la personne qui vous a envoyé ce
            lien, et pourrez les déclarer présents à vos sorties.
          </p>
          <form action={accepterCoparent}>
            <input type="hidden" name="jeton" value={rejoindre} />
            <Bouton>Accepter</Bouton>
          </form>
        </Carte>
      ) : null}

      <Carte className="mb-5" accent="bleu">
        <form action={changerNom} className="space-y-4">
          <Champ
            label="Nom affiché"
            aide="Ce que voient les membres de vos cercles."
            name="nom"
            defaultValue={account.displayName}
            required
            maxLength={60}
          />
          <Bouton variante="second">Enregistrer</Bouton>
        </form>
      </Carte>

      <Carte className="mb-5" accent="violet">
        <h2 className="titre mb-3 text-lg font-bold">Vos enfants</h2>

        <ul className="mb-4 space-y-2">
          {enfants.map((enfant) => (
            <li key={enfant.id} className="flex items-center gap-2">
              {/*
                `min-w-0` sur le formulaire, pas seulement sur le champ : la largeur
                intrinsèque d'un champ (size=20) remonte en minimum à travers un flex
                imbriqué, et sur 360 px le rang débordait — le ✕ vivait hors de l'écran.
              */}
              <form action={renommerEnfant} className="flex min-w-0 flex-1 gap-2">
                <input type="hidden" name="enfant" value={enfant.id} />
                <input
                  name="prenom"
                  defaultValue={enfant.firstName}
                  maxLength={40}
                  className="min-w-0 flex-1 rounded-xl bg-[color:var(--color-fond)] px-3 py-2 ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-violet)]"
                />
                <button
                  className="shrink-0 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                  style={{
                    background: `var(--color-${teinte(enfant.id)}-doux)`,
                    color: `var(--color-${teinte(enfant.id)})`,
                  }}
                >
                  Renommer
                </button>
              </form>
              <form action={retirerEnfant}>
                <input type="hidden" name="enfant" value={enfant.id} />
                <button
                  title="Retirer"
                  className="rounded-[var(--radius-pilule)] px-3 py-2 text-sm"
                  style={{ color: "var(--color-doux)" }}
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>

        <form action={ajouterEnfantCompte} className="space-y-3">
          <Champ label="Ajouter un enfant" name="prenom" required maxLength={40} placeholder="Léa" />
          <Bouton variante="second">Ajouter</Bouton>
        </form>
      </Carte>

      <Carte className="mb-5" accent="ambre">
        <h2 className="titre mb-2 text-lg font-bold">L&apos;autre parent</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          Si vous élevez ces enfants à deux, l&apos;autre parent peut avoir son propre compte et
          voir les mêmes prénoms. Chacun garde ses cercles et ses réglages.
        </p>

        <form action={inviterAutreParent} className="mb-4">
          <Bouton variante="second">Créer un lien pour l&apos;autre parent</Bouton>
        </form>

        <form action={accepterCoparent} className="space-y-3">
          <Champ
            label="Vous avez reçu un lien ?"
            aide="Collez-le ici pour rejoindre les enfants de l'autre parent."
            name="jeton"
            placeholder="Le code du lien reçu"
          />
          <Bouton variante="second">Rejoindre</Bouton>
        </form>
      </Carte>

      <Carte className="mb-5" accent="vert">
        <h2 className="titre mb-2 text-lg font-bold">Revenir sans courriel</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          Enregistrez cet appareil et vous entrerez ensuite comme vous le déverrouillez :
          empreinte, visage ou code, selon votre téléphone. Rien de tout cela ne nous est
          transmis : l&apos;appareil garde une clé qu&apos;il ne révèle à personne, et nous
          n&apos;en connaissons que la moitié publique. Le lien par courriel reste là si vous
          changez de téléphone.
        </p>

        {cles.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {cles.map((cle) => (
              <li
                key={cle.id}
                className="flex items-center gap-3 rounded-2xl bg-[color:var(--color-fond)] px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-bold">{cle.label}</span>
                  <span className="text-[color:var(--color-doux)]">
                    {cle.lastUsedAt
                      ? `dernière entrée le ${jourCourt(cle.lastUsedAt).nombre} ${jourCourt(cle.lastUsedAt).mois}`
                      : "jamais utilisé"}
                  </span>
                </span>
                <form action={oublierCleAcces}>
                  <input type="hidden" name="cle" value={cle.id} />
                  <button
                    className="shrink-0 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
                    style={{
                      background: "var(--color-corail-doux)",
                      color: "var(--color-corail)",
                    }}
                  >
                    Oublier
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}

        <AjouterCleAcces
          preparer={preparerCleAcces}
          enregistrer={enregistrerCleAcces}
          nomParDefaut="Cet appareil"
        />
      </Carte>

      {/*
        Les réglages vivaient sous la liste des cercles, où rien ne laissait deviner qu'ils
        s'y trouvaient. Ils sont ici, derrière l'onglet qui porte leur nom.
      */}
      <div className="mb-5 space-y-3">
        <LienBouton href="/reglages">🔔 Notifications</LienBouton>
        <LienBouton href="/lieux">📍 Les lieux</LienBouton>
        {relecteur ? <LienBouton href="/relecture">🧐 Relire l&apos;agenda</LienBouton> : null}
        {relecteur ? <LienBouton href="/mesures">📊 Quelques nombres</LienBouton> : null}
      </div>

      <Carte accent="corail">
        <h2 className="titre mb-2 text-lg font-bold">Supprimer votre compte</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          Vos sorties, vos réglages, votre adresse et votre nom disparaissent. Les cercles que
          vous avez créés continuent d&apos;exister pour leurs membres. Un enfant dont vous
          êtes le seul parent est effacé ; s&apos;il a un second parent, il lui reste. C&apos;est
          définitif.
        </p>

        <form action={supprimerCompte} className="space-y-3">
          <Champ
            label="Écrivez SUPPRIMER pour confirmer"
            name="confirmation"
            autoComplete="off"
            placeholder="SUPPRIMER"
          />
          <Bouton variante="second">Supprimer définitivement</Bouton>
        </form>
      </Carte>

      <div className="mt-10 space-y-4 text-center text-sm">
        <p>
          <Link
            href="/donnees"
            className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            Ce qu&apos;Allezou enregistre
          </Link>
        </p>
        <p>
          <Link
            href="/questions"
            className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            Questions fréquentes
          </Link>
        </p>
        <p>
          <a
            href="mailto:contact@allezou.ch"
            className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            Nous écrire
          </a>
        </p>
        <form action={seDeconnecter}>
          <button className="text-[color:var(--color-doux)] underline underline-offset-4">
            Se déconnecter
          </button>
        </form>
      </div>

      <Navigation actif="vous" />
    </main>
  );
}
