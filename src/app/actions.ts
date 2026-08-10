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
} from "@/lib/children";
import {
  approveJoin,
  createCircle,
  createInvite,
  cutLink,
  leaveCircle,
  rejectJoin,
  requestJoin,
  restoreLink,
} from "@/lib/circles";
import { heureDeGeneve } from "@/lib/heure";
import { correctAndPublish, rejectEvent } from "@/lib/ingest/run";
import {
  muteMember,
  notifyPublication,
  pauseCircle,
  setPrefs,
  subscribe,
  unmuteMember,
  unsubscribe,
  webPushSender,
} from "@/lib/notifications";
import { createPlace } from "@/lib/places";
import {
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
  COOKIE_INVITATION,
  clearSessionCookie,
  readSessionToken,
  requireAccount,
  requireRelecteur,
} from "@/lib/session";

/* ------------------------------------------------------------------ connexion */

export async function demanderLien(formData: FormData) {
  const result = await requestMagicLink(String(formData.get("email") ?? ""));

  if (!result.ok) {
    redirect(`/connexion?erreur=${result.reason}`);
  }
  redirect("/connexion?envoye=1");
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

export async function accepterCoparent(formData: FormData) {
  const account = await requireAccount();
  const result = await acceptCoparent(account.id, String(formData.get("jeton") ?? ""));
  redirect(result.ok ? "/compte" : `/compte?erreur=${result.reason}`);
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
 * Le jeton d'invitation ne passe pas par l'URL.
 *
 * Une barre d'adresse se retrouve dans l'historique du navigateur, dans les journaux du
 * serveur et dans le référent des liens sortants. Le jeton voyage donc dans un cookie de
 * courte durée, lu une fois par la page qui l'affiche, puis oublié de lui-même.
 */
export async function creerInvitation(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");

  const result = await createInvite(account.id, circleId);
  if (!result.ok) redirect(`/cercles/${circleId}?erreur=${result.reason}`);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_INVITATION, result.value.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/cercles/${circleId}`,
    maxAge: 300,
  });

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
  redirect(result.ok ? "/rejoindre/merci" : `/rejoindre/${jeton}?erreur=${result.reason}`);
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

  await correctAndPublish(id, {
    title: String(formData.get("titre") ?? "").trim() || undefined,
    startsAt: debut ?? undefined,
    endsAt: fin,
    placeLabel: formData.get("lieu")?.toString().trim() || null,
    commune: formData.get("commune")?.toString().trim() || null,
    minAge: age("ageMin"),
    maxAge: age("ageMax"),
  });

  revalidatePath("/relecture");
}

export async function ecarterActivite(formData: FormData) {
  await requireRelecteur();
  await rejectEvent(String(formData.get("activite") ?? ""));
  revalidatePath("/relecture");
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

  const result = await declarePresence(account.id, {
    placeId: String(formData.get("lieu") ?? ""),
    minutes: Number(formData.get("duree") ?? 120),
    childIds: formData.getAll("enfant").map(String),
    startsAt: debut ?? undefined,
  });

  if (!result.ok) redirect(`/sortir?erreur=${result.reason}`);

  prevenir(result.value.publicationId);
  redirect("/maintenant");
}

export async function ajouterLieu(formData: FormData) {
  const account = await requireAccount();
  const result = await createPlace(account.id, {
    name: String(formData.get("nom") ?? ""),
    commune: String(formData.get("commune") ?? "") || undefined,
  });
  if (!result.ok) redirect("/sortir/lieu?erreur=1");
  redirect("/sortir");
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
