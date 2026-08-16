"use server";

/**
 * Toutes les mutations de l'interface.
 *
 * Chacune commence par `requireAccount()` : une Server Action est joignable par une requête
 * POST directe, pas seulement depuis un bouton de l'application. L'autorisation ne peut donc
 * pas vivre dans l'écran qui l'appelle.
 *
 * Les erreurs repartent par l'URL plutôt que par un état React : tout reste rendu côté
 * serveur, et l'application fonctionne même si le JavaScript n'a pas fini de charger — ce qui
 * arrive au parc, sur un téléphone, avec une barre de réseau.
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { destroySession, requestMagicLink, setDisplayName } from "@/lib/auth";
import { deleteAccount } from "@/lib/account";
import {
  acceptCoparent,
  addChild,
  inviteCoparent,
  removeChild,
  renameChild,
  setChildInCircle,
} from "@/lib/children";
import {
  approveJoin,
  createCircle,
  createInvite,
  cutLink,
  leaveCircle,
  rejectJoin,
  removeMember,
  requestJoin,
  restoreLink,
  revokeInvite,
  setCircleAlias,
  setRole,
} from "@/lib/circles";
import { heureDeGeneve } from "@/lib/heure";
import { ACCES, TARIFS } from "@/lib/ingest/tarif";
import { clearWarnings, correctAndPublish, rejectEvent, withdrawEvent } from "@/lib/ingest/run";
import {
  ajouterMotCle,
  muteMember,
  notifyJoinRequest,
  notifyNewlyPublished,
  notifyPublication,
  reglerAlerteInscription,
  retirerMotCle,
  pauseCircle,
  setPrefs,
  subscribe,
  unmuteMember,
  unsubscribe,
  webPushSender,
} from "@/lib/notifications";
import {
  connecterParCle,
  enregistrerCle,
  oublierCle,
  optionsConnexion,
  optionsEnregistrement,
} from "@/lib/passkeys";
import {
  completerAdresse,
  createPlace,
  proposeAddress,
  proposeRename,
  voteRename,
} from "@/lib/places";
import {
  createEventAndAttend,
  declareAttendance,
  declarePresence,
  extendPresence,
  joinPresence,
  lastOuting,
  leavePresence,
  myAttendance,
  setDefaultAudience,
  setNote,
  setParticipantChildren,
  setPublicationCircles,
  withdraw,
} from "@/lib/publications";
import {
  COOKIE_DEFI,
  COOKIE_INVITATION,
  clearSessionCookie,
  destinationSure,
  masquerAccueil,
  poserSuite,
  readSessionToken,
  releverSuite,
  requireAccount,
  requireRelecteur,
  setSessionCookie,
} from "@/lib/session";

/* -------------------------------------------------------------------- accueil */

/**
 * Quitter l'accueil pour la connexion, en retenant au passage qu'on ne veut plus le revoir.
 *
 * La case est dans le même formulaire que le bouton : cochée seule, elle n'aurait rien
 * enregistré sans JavaScript, et l'application doit tenir sans lui.
 */
export async function entrer(formData: FormData) {
  if (formData.get("ne_plus_afficher")) await masquerAccueil();
  redirect("/connexion");
}

/* ------------------------------------------------------------------ connexion */

export async function demanderLien(formData: FormData) {
  // Où reprendre après le courriel. Vérifié avant d'être gardé : ce qui arrive ici vient
  // d'une URL, donc de n'importe qui, et une destination extérieure ferait de notre
  // connexion un tremplin d'hameçonnage.
  const suite = destinationSure(formData.get("suite")?.toString());
  if (suite) await poserSuite(suite);

  const result = await requestMagicLink(String(formData.get("email") ?? ""));

  if (!result.ok) {
    redirect(`/connexion?erreur=${result.reason}`);
  }
  redirect("/connexion?envoye=1");
}

/**
 * La fin de l'accueil d'un nouveau compte.
 *
 * Un lien fixe vers `/cercles` renvoyait dans le vide quelqu'un qui était venu suivre une
 * invitation : elle avait traversé le courriel et l'accueil, et se perdait à la dernière
 * marche.
 */
export async function terminerBienvenue() {
  await requireAccount();
  redirect((await releverSuite()) ?? "/cercles");
}

export async function seDeconnecter() {
  const token = await readSessionToken();
  if (token) await destroySession(token);
  await clearSessionCookie();
  redirect("/connexion");
}

/* ----------------------------------------------------------------- bienvenue */

export async function enregistrerNom(formData: FormData) {
  const account = await requireAccount();
  const result = await setDisplayName(account.id, String(formData.get("nom") ?? ""));
  if (!result.ok) redirect("/bienvenue?erreur=1");
  redirect("/bienvenue/enfants");
}

export async function ajouterEnfant(formData: FormData) {
  const account = await requireAccount();
  const result = await addChild(account.id, {
    firstName: String(formData.get("prenom") ?? ""),
  });
  if (!result.ok) redirect("/bienvenue/enfants?erreur=1");
  redirect("/bienvenue/enfants");
}

/* --------------------------------------------------------------------- compte */

export async function changerNom(formData: FormData) {
  const account = await requireAccount();
  const result = await setDisplayName(account.id, String(formData.get("nom") ?? ""));
  redirect(result.ok ? "/compte" : "/compte?erreur=nom");
}

export async function ajouterEnfantCompte(formData: FormData) {
  const account = await requireAccount();
  const result = await addChild(account.id, {
    firstName: String(formData.get("prenom") ?? ""),
  });
  redirect(result.ok ? "/compte" : "/compte?erreur=prenom");
}

export async function renommerEnfant(formData: FormData) {
  const account = await requireAccount();
  const result = await renameChild(
    account.id,
    String(formData.get("enfant") ?? ""),
    String(formData.get("prenom") ?? ""),
  );
  redirect(result.ok ? "/compte" : "/compte?erreur=prenom");
}

export async function retirerEnfant(formData: FormData) {
  const account = await requireAccount();
  await removeChild(account.id, String(formData.get("enfant") ?? ""));
  redirect("/compte");
}

export async function inviterAutreParent() {
  const account = await requireAccount();
  const { token } = await inviteCoparent(account.id);
  redirect(`/compte?coparent=${token}`);
}

/**
 * Le code d'un lien, qu'on ait collé le lien entier ou seulement le code.
 *
 * Ce qu'on reçoit par message, c'est « https://allezou.ch/rejoindre/ab12… », souvent avec une
 * ponctuation collée au bout par la messagerie. Exiger le code nu ferait échouer le geste le
 * plus naturel — coller ce qu'on a reçu — et l'erreur n'en dirait pas la raison.
 */
function codeDuLien(saisie: string): string {
  const sansSuite = saisie.trim().split(/[?#]/)[0];
  const segments = sansSuite.split("/").filter(Boolean);
  return (segments.pop() ?? "").replace(/[.,;:)\]}>]+$/, "");
}

export async function accepterCoparent(formData: FormData) {
  const account = await requireAccount();
  const result = await acceptCoparent(
    account.id,
    codeDuLien(String(formData.get("jeton") ?? "")),
  );
  redirect(result.ok ? "/compte" : `/compte?erreur=${result.reason}`);
}

/**
 * Entrer par un lien d'invitation qu'on a sous les yeux plutôt qu'en le suivant.
 *
 * Un lien passé par message se recopie de travers, se coupe en deux, ou arrive dans une
 * application qui refuse de l'ouvrir. Sans cette porte, la seule issue est de redemander le
 * lien à quelqu'un — et il ne peut pas le réafficher.
 */
export async function rejoindreParLien(formData: FormData) {
  await requireAccount();
  const code = codeDuLien(String(formData.get("lien") ?? ""));
  if (!code) redirect("/cercles?erreur=lien_vide");
  redirect(`/rejoindre/${encodeURIComponent(code)}`);
}

/**
 * Suppression du compte. On exige d'écrire le mot en toutes lettres : c'est irréversible,
 * et un bouton seul se touche par accident sur un téléphone.
 */
export async function supprimerCompte(formData: FormData) {
  const account = await requireAccount();
  if (String(formData.get("confirmation") ?? "").trim().toUpperCase() !== "SUPPRIMER") {
    redirect("/compte?erreur=confirmation");
  }

  await deleteAccount(account.id);
  await clearSessionCookie();
  redirect("/connexion?supprime=1");
}

/* -------------------------------------------------------------------- cercles */

export async function creerCercle(formData: FormData) {
  const account = await requireAccount();
  const result = await createCircle(account.id, String(formData.get("nom") ?? ""));
  if (!result.ok) redirect("/cercles?erreur=1");
  redirect(`/cercles/${result.value.id}`);
}

/**
 * Porte le jeton fraîchement créé jusqu'à l'écran qui l'affiche.
 *
 * Par un cookie et non par l'URL : une barre d'adresse se retrouve dans l'historique, dans
 * les journaux du proxy et dans le référent des liens sortants. Cinq minutes suffisent, et
 * c'est la seule fenêtre où le jeton existe en clair — seul son condensé est enregistré.
 *
 * Le lien que l'administrateur envoie ensuite porte évidemment le jeton, puisque c'est ce
 * qu'il est. Ce détour ne protège pas le lien partagé, il évite seulement d'en laisser une
 * copie de plus dans les journaux de qui le fabrique.
 */
async function poserJetonInvitation(circleId: string, token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_INVITATION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/cercles/${circleId}`,
    maxAge: 300,
  });
}

export async function creerInvitation(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");

  const nombre = Number(formData.get("familles"));
  const jours = Number(formData.get("jours"));

  const result = await createInvite(account.id, circleId, {
    maxUses: Number.isFinite(nombre) ? nombre : undefined,
    days: Number.isFinite(jours) ? jours : undefined,
  });
  if (!result.ok) redirect(`/cercles/${circleId}?erreur=${result.reason}`);

  await poserJetonInvitation(circleId, result.value.token);
  redirect(`/cercles/${circleId}?invitation=1`);
}

/**
 * Refaire un lien à la place d'un autre.
 *
 * Un lien ne s'affiche qu'une fois. L'administrateur à qui une famille redemande « le lien »
 * n'a donc pas d'autre issue que d'en refaire un — et s'il révoque puis recrée en deux
 * gestes, il perd entre-temps le nombre de familles qu'il avait annoncé. En un seul geste,
 * la portée est reprise et la conséquence peut être écrite à côté du bouton : l'ancien lien
 * cesse de fonctionner pour tout le monde, y compris ceux à qui il avait déjà été transmis.
 */
export async function remplacerInvitation(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  const nombre = Number(formData.get("familles"));

  await revokeInvite(account.id, String(formData.get("invitation") ?? ""));

  const result = await createInvite(account.id, circleId, {
    maxUses: Number.isFinite(nombre) ? nombre : undefined,
  });
  if (!result.ok) redirect(`/cercles/${circleId}?erreur=${result.reason}`);

  await poserJetonInvitation(circleId, result.value.token);
  redirect(`/cercles/${circleId}?invitation=1`);
}

export async function accepterDemande(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  await approveJoin(account.id, String(formData.get("demande") ?? ""));
  revalidatePath(`/cercles/${circleId}`);
}

export async function refuserDemande(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  await rejectJoin(account.id, String(formData.get("demande") ?? ""));
  revalidatePath(`/cercles/${circleId}`);
}

export async function quitterCercle(formData: FormData) {
  const account = await requireAccount();
  await leaveCircle(account.id, String(formData.get("cercle") ?? ""));
  redirect("/cercles");
}

/** Cocher ou décocher un cercle pour ses prochaines sorties. */
export async function basculerDefaut(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  await setDefaultAudience(account.id, circleId, formData.get("coche") !== "1");
  revalidatePath(`/cercles/${circleId}`);
}

export async function basculerLien(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  const autre = String(formData.get("membre") ?? "");

  if (formData.get("coupe") === "1") {
    await restoreLink(account.id, circleId, autre);
  } else {
    await cutLink(account.id, circleId, autre);
  }
  revalidatePath(`/cercles/${circleId}`);
}

export async function demanderAdhesion(formData: FormData) {
  const account = await requireAccount();
  const jeton = String(formData.get("jeton") ?? "");
  const result = await requestJoin(account.id, jeton);

  if (!result.ok) redirect(`/rejoindre/${jeton}?erreur=${result.reason}`);

  // Sans ce signal, la demande dort jusqu'à ce qu'un administrateur pense à ouvrir la page.
  const circleId = result.value.circleId;
  after(async () => {
    try {
      await notifyJoinRequest(circleId, await webPushSender());
    } catch {
      // Une notification qui ne part pas ne doit pas remettre la demande en cause.
    }
  });

  redirect("/rejoindre/merci");
}

/* ------------------------------------------------- gouvernance d'un cercle */

export async function revoquerInvitation(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  await revokeInvite(account.id, String(formData.get("invitation") ?? ""));
  revalidatePath(`/cercles/${circleId}`);
}

export async function exclureMembre(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  const result = await removeMember(
    account.id,
    circleId,
    String(formData.get("membre") ?? ""),
  );
  redirect(result.ok ? `/cercles/${circleId}` : `/cercles/${circleId}?erreur=${result.reason}`);
}

export async function changerRole(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  const result = await setRole(
    account.id,
    circleId,
    String(formData.get("membre") ?? ""),
    formData.get("admin") === "1" ? "member" : "admin",
  );
  redirect(result.ok ? `/cercles/${circleId}` : `/cercles/${circleId}?erreur=${result.reason}`);
}

/* ------------------------------------------------------------------ relecture */

export async function publierActivite(formData: FormData) {
  await requireRelecteur();
  const id = String(formData.get("activite") ?? "");

  const debut = heureDeGeneve(formData.get("debut")?.toString());
  const fin = heureDeGeneve(formData.get("fin")?.toString());
  const age = (champ: string) => {
    const valeur = formData.get(champ)?.toString().trim();
    return valeur ? Number(valeur) : null;
  };

  const parmi = <T extends string>(champ: string, valeurs: readonly T[]): T | undefined => {
    const valeur = formData.get(champ)?.toString();
    return valeurs.includes(valeur as T) ? (valeur as T) : undefined;
  };

  await correctAndPublish(id, {
    title: String(formData.get("titre") ?? "").trim() || undefined,
    description: formData.get("description")?.toString().trim() || null,
    startsAt: debut ?? undefined,
    endsAt: fin,
    allDay: formData.get("journee") === "1",
    recurrence: formData.get("rythme")?.toString().trim() || null,
    placeLabel: formData.get("lieu")?.toString().trim() || null,
    commune: formData.get("commune")?.toString().trim() || null,
    url: formData.get("lien")?.toString().trim() || null,
    minAge: age("ageMin"),
    maxAge: age("ageMax"),
    tarif: parmi("tarif", TARIFS),
    acces: parmi("acces", ACCES),
  });

  // Une activité relue à la main paraît comme les autres : ceux qui la guettaient doivent
  // l'apprendre au même moment.
  after(async () => {
    try {
      await notifyNewlyPublished(await webPushSender());
    } catch {
      // Une alerte qui ne part pas ne remet pas la publication en cause.
    }
  });

  revalidatePath("/relecture");
}

/**
 * Rattacher un enfant à un cercle, ou l'en détacher.
 *
 * On est rarement dans un cercle pour soi : on y est parce qu'un enfant est dans cette
 * classe. Le dire permet à l'écran de sortie de ne plus adresser au cercle de l'aînée une
 * sortie où seul le petit est venu.
 */
/** Comment cette personne appelle ce cercle. Personne d'autre ne le voit. */
export async function renommerPourMoi(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");

  const result = await setCircleAlias(
    account.id,
    circleId,
    String(formData.get("alias") ?? ""),
  );

  redirect(result.ok ? `/cercles/${circleId}` : `/cercles/${circleId}?erreur=${result.reason}`);
}

export async function rattacherEnfantCercle(formData: FormData) {
  const account = await requireAccount();
  const cercle = String(formData.get("cercle") ?? "");

  const result = await setChildInCircle(
    account.id,
    String(formData.get("enfant") ?? ""),
    cercle,
    formData.get("lie") === "1",
  );

  redirect(result.ok ? `/cercles/${cercle}` : `/cercles/${cercle}?erreur=${result.reason}`);
}

/* ------------------------------------------------------ alertes de l'agenda */

export async function ajouterMotCleAgenda(formData: FormData) {
  const account = await requireAccount();
  const result = await ajouterMotCle(account.id, String(formData.get("mot") ?? ""));
  redirect(result.ok ? "/reglages" : `/reglages?erreur=${result.reason}`);
}

export async function retirerMotCleAgenda(formData: FormData) {
  const account = await requireAccount();
  await retirerMotCle(account.id, String(formData.get("mot") ?? ""));
  redirect("/reglages");
}

export async function basculerAlerteInscription(formData: FormData) {
  const account = await requireAccount();
  await reglerAlerteInscription(account.id, formData.get("actif") === "1");
  redirect("/reglages");
}

export async function ecarterActivite(formData: FormData) {
  await requireRelecteur();
  await rejectEvent(String(formData.get("activite") ?? ""));
  revalidatePath("/relecture");
}

/** « J'ai regardé la page d'origine, l'activité est juste. » */
export async function confirmerActivite(formData: FormData) {
  await requireRelecteur();
  await clearWarnings(String(formData.get("activite") ?? ""));
  revalidatePath("/relecture");
}

/** Sortir de l'agenda une activité déjà publiée, sans effacer les inscriptions prises. */
export async function retirerActivite(formData: FormData) {
  await requireRelecteur();
  await withdrawEvent(String(formData.get("activite") ?? ""));
  revalidatePath("/relecture");
}

/* ------------------------------------------------------------- clés d'accès */

async function poserDefi(defi: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_DEFI, defi, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 120,
  });
}

/** Lit le défi et l'efface aussitôt : une signature ne doit pouvoir servir qu'une fois. */
async function releverDefi(): Promise<string | null> {
  const cookieStore = await cookies();
  const defi = cookieStore.get(COOKIE_DEFI)?.value ?? null;
  cookieStore.delete(COOKIE_DEFI);
  return defi;
}

export async function preparerCleAcces() {
  const account = await requireAccount();
  const options = await optionsEnregistrement(account.id, account.displayName);
  await poserDefi(options.challenge);
  return options;
}

export async function enregistrerCleAcces(reponseJson: string, libelle: string) {
  const account = await requireAccount();
  const defi = await releverDefi();
  if (!defi) return { ok: false as const, reason: "defi_absent" as const };

  const result = await enregistrerCle(account.id, JSON.parse(reponseJson), defi, libelle);
  revalidatePath("/compte");
  return result.ok ? { ok: true as const } : { ok: false as const, reason: result.reason };
}

export async function preparerConnexionCle() {
  const options = await optionsConnexion();
  await poserDefi(options.challenge);
  return options;
}

export async function connecterParCleAcces(reponseJson: string) {
  const defi = await releverDefi();
  if (!defi) return { ok: false as const, reason: "defi_absent" as const };

  const result = await connecterParCle(JSON.parse(reponseJson), defi);
  if (!result.ok) return { ok: false as const, reason: result.reason };

  await setSessionCookie(result.value.sessionToken);
  return { ok: true as const };
}

export async function oublierCleAcces(formData: FormData) {
  const account = await requireAccount();
  await oublierCle(account.id, String(formData.get("cle") ?? ""));
  redirect("/compte");
}

/* ------------------------------------------------------------- notifications */

const abonnementPush = z.object({
  endpoint: z.string().url().max(500),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function enregistrerAbonnement(abonnementJson: string) {
  const account = await requireAccount();
  const parsed = abonnementPush.safeParse(JSON.parse(abonnementJson));
  if (!parsed.success) return;
  await subscribe(account.id, parsed.data);
}

export async function oublierAbonnement(endpoint: string) {
  const account = await requireAccount();
  await unsubscribe(account.id, endpoint);
}

export async function reglerCercle(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");

  await setPrefs(account.id, circleId, {
    onPresence: formData.get("presences") === "1",
    onAttendance: formData.get("inscriptions") === "1",
  });
  revalidatePath("/reglages");
}

export async function mettreEnPause(formData: FormData) {
  const account = await requireAccount();
  await pauseCircle(
    account.id,
    String(formData.get("cercle") ?? ""),
    Number(formData.get("heures") ?? 0),
  );
  revalidatePath("/reglages");
}

export async function basculerSourdine(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  const autre = String(formData.get("membre") ?? "");

  if (formData.get("sourdine") === "1") {
    await unmuteMember(account.id, circleId, autre);
  } else {
    await muteMember(account.id, circleId, autre);
  }
  revalidatePath(`/cercles/${circleId}`);
}

/* ------------------------------------------------------------------- sorties */

/**
 * Prévenir les destinataires après coup, sans faire attendre celui qui vient de publier :
 * l'envoi push prend le temps qu'il prend, et il ne doit pas retenir l'écran de quelqu'un
 * qui a un enfant dans les bras.
 */
function prevenir(publicationId: string) {
  after(async () => {
    try {
      await notifyPublication(publicationId, await webPushSender());
    } catch {
      // Une notification qui ne part pas ne doit pas remettre la sortie en cause.
    }
  });
}

export async function declarerSortie(formData: FormData) {
  const account = await requireAccount();

  // Le champ « quand » est vide quand on y est déjà : la sortie commence alors maintenant.
  const debut = heureDeGeneve(formData.get("debut")?.toString());

  /*
    Les cercles cochés à l'écran font foi, y compris quand il n'y en a aucun : c'est alors
    `aucun_destinataire` et non un repli silencieux sur les réglages par défaut. Une sortie
    publiée vers un cercle qu'on croyait avoir décoché est exactement la faute que l'écran
    cherche à rendre impossible.
  */
  const result = await declarePresence(account.id, {
    placeId: String(formData.get("lieu") ?? ""),
    minutes: Number(formData.get("duree") ?? 120),
    circleIds: formData.getAll("cercle").map(String),
    childIds: formData.getAll("enfant").map(String),
    startsAt: debut ?? undefined,
  });

  if (!result.ok) redirect(`/sortir?erreur=${result.reason}`);

  prevenir(result.value.publicationId);
  redirect("/maintenant");
}

/**
 * Un parent propose une activité à l'agenda.
 *
 * Elle est publiée sans passer par la file de relecture : celle-ci existe pour ce qu'une
 * IA a extrait d'une page web, pas pour ce qu'une famille du cercle écrit elle-même.
 */
export async function proposerActivite(formData: FormData) {
  const account = await requireAccount();

  const debut = heureDeGeneve(formData.get("debut")?.toString());
  if (!debut) redirect("/agenda/nouveau?erreur=dates_invalides");

  const lieuId = String(formData.get("lieu") ?? "");

  const result = await createEventAndAttend(account.id, {
    title: String(formData.get("titre") ?? ""),
    startsAt: debut,
    endsAt: heureDeGeneve(formData.get("fin")?.toString()) ?? undefined,
    placeId: lieuId || undefined,
    placeLabel: formData.get("lieuLibre")?.toString().trim() || undefined,
    circleIds: formData.getAll("cercle").map(String),
    childIds: formData.getAll("enfant").map(String),
  });

  if (!result.ok) redirect(`/agenda/nouveau?erreur=${result.reason}`);

  prevenir(result.value.publicationId);
  redirect(`/agenda/${result.value.eventId}`);
}

/* ---------------------------------------------------------------------- lieux */

export async function proposerRenommage(formData: FormData) {
  const account = await requireAccount();
  const result = await proposeRename(
    account.id,
    String(formData.get("lieu") ?? ""),
    String(formData.get("nom") ?? ""),
  );
  redirect(result.ok ? "/lieux?propose=1" : `/lieux?erreur=${result.reason}`);
}

/** Proposer une autre adresse pour un lieu qui en a déjà une. Elle se valide à plusieurs. */
export async function proposerAdresse(formData: FormData) {
  const account = await requireAccount();
  const result = await proposeAddress(
    account.id,
    String(formData.get("lieu") ?? ""),
    String(formData.get("adresse") ?? ""),
  );
  redirect(result.ok ? "/lieux?propose=1" : `/lieux?erreur=${result.reason}`);
}

export async function validerRenommage(formData: FormData) {
  const account = await requireAccount();
  const result = await voteRename(account.id, String(formData.get("proposition") ?? ""));

  if (!result.ok) redirect(`/lieux?erreur=${result.reason}`);
  redirect(result.value.votes >= result.value.needed ? "/lieux?applique=1" : "/lieux");
}

export async function ajouterLieu(formData: FormData) {
  const account = await requireAccount();

  /*
    La position vient d'un toucher sur la carte, jamais d'un champ tapé : deux nombres,
    ensemble ou pas du tout. Un seul des deux, ou un texte à leur place, c'est un
    formulaire trafiqué — refusé plutôt que deviné.
  */
  const latBrut = String(formData.get("lat") ?? "").trim();
  const lonBrut = String(formData.get("lon") ?? "").trim();
  let coord: { lat: number; lon: number } | undefined;
  if (latBrut || lonBrut) {
    const lat = Number(latBrut);
    const lon = Number(lonBrut);
    if (!latBrut || !lonBrut || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      redirect("/sortir/lieu?erreur=position_invalide");
    }
    coord = { lat, lon };
  }

  const result = await createPlace(account.id, {
    name: String(formData.get("nom") ?? ""),
    commune: String(formData.get("commune") ?? "") || undefined,
    address: String(formData.get("adresse") ?? "") || undefined,
    coord,
  });
  if (!result.ok) redirect(`/sortir/lieu?erreur=${result.reason}`);
  redirect("/sortir");
}

/**
 * Compléter l'adresse d'un lieu qui n'en a pas.
 *
 * Cent lieux sont entrés avant que ce champ existe : sans ce geste, ils resteraient muets
 * pour toujours, et l'adresse ne servirait qu'aux lieux créés à partir d'aujourd'hui.
 */
export async function completerAdresseLieu(formData: FormData) {
  await requireAccount();
  const result = await completerAdresse(
    String(formData.get("lieu") ?? ""),
    String(formData.get("adresse") ?? ""),
  );
  redirect(result.ok ? "/lieux?adresse=1" : `/lieux?erreur=${result.reason}`);
}

/* ------------------------------------------------------- activités du calendrier */

export async function sInscrireActivite(formData: FormData) {
  const account = await requireAccount();
  const eventId = String(formData.get("activite") ?? "");

  const circleIds = formData.getAll("cercle").map(String);
  const childIds = formData.getAll("enfant").map(String);

  const deja = await myAttendance(account.id, eventId);

  // Déjà inscrit : on ne recrée rien, on met à jour les destinataires et les enfants.
  if (deja) {
    const cercles = await setPublicationCircles(account.id, deja.publicationId, circleIds);
    if (!cercles.ok) redirect(`/agenda/${eventId}?erreur=${cercles.reason}`);
    await setParticipantChildren(account.id, deja.publicationId, childIds);
    redirect(`/agenda/${eventId}`);
  }

  const result = await declareAttendance(account.id, { eventId, circleIds, childIds });
  if (!result.ok) redirect(`/agenda/${eventId}?erreur=${result.reason}`);

  prevenir(result.value.publicationId);
  redirect(`/agenda/${eventId}`);
}

export async function annulerParticipation(formData: FormData) {
  const account = await requireAccount();
  const eventId = String(formData.get("activite") ?? "");
  const deja = await myAttendance(account.id, eventId);
  if (deja) await withdraw(account.id, deja.publicationId);
  redirect(`/agenda/${eventId}`);
}

export async function rejoindreSortie(formData: FormData) {
  const account = await requireAccount();
  await joinPresence(
    account.id,
    String(formData.get("sortie") ?? ""),
    formData.getAll("enfant").map(String),
  );
  revalidatePath("/maintenant");
}

export async function quitterSortie(formData: FormData) {
  const account = await requireAccount();
  await leavePresence(account.id, String(formData.get("sortie") ?? ""));
  redirect("/maintenant");
}

export async function retirerSortie(formData: FormData) {
  const account = await requireAccount();
  await withdraw(account.id, String(formData.get("sortie") ?? ""));
  redirect("/maintenant");
}

export async function corrigerEnfants(formData: FormData) {
  const account = await requireAccount();
  const sortie = String(formData.get("sortie") ?? "");
  await setParticipantChildren(account.id, sortie, formData.getAll("enfant").map(String));
  redirect(`/sortie/${sortie}`);
}

export async function prolongerSortie(formData: FormData) {
  const account = await requireAccount();
  const sortie = String(formData.get("sortie") ?? "");
  const result = await extendPresence(account.id, sortie, 60);
  redirect(result.ok ? `/sortie/${sortie}` : `/sortie/${sortie}?erreur=${result.reason}`);
}

export async function enregistrerMot(formData: FormData) {
  const account = await requireAccount();
  const sortie = String(formData.get("sortie") ?? "");
  const result = await setNote(account.id, sortie, String(formData.get("mot") ?? ""));
  redirect(result.ok ? `/sortie/${sortie}` : `/sortie/${sortie}?erreur=${result.reason}`);
}

/** Rejouer la dernière sortie : même lieu, même durée, mêmes enfants. */
export async function refaireDerniereSortie() {
  const account = await requireAccount();
  const derniere = await lastOuting(account.id);
  if (!derniere) redirect("/sortir");

  const result = await declarePresence(account.id, {
    placeId: derniere.placeId,
    minutes: derniere.minutes,
    childIds: derniere.childIds,
  });

  if (!result.ok) redirect(`/sortir?erreur=${result.reason}`);

  prevenir(result.value.publicationId);
  redirect("/maintenant");
}
