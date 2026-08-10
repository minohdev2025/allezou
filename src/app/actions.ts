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
import { redirect } from "next/navigation";

import { destroySession, requestMagicLink, setDisplayName } from "@/lib/auth";
import { addChild } from "@/lib/children";
import {
  approveJoin,
  createCircle,
  createInvite,
  cutLink,
  rejectJoin,
  requestJoin,
  restoreLink,
} from "@/lib/circles";
import { heureDeGeneve } from "@/lib/heure";
import { createPlace } from "@/lib/places";
import { declarePresence, joinPresence, leavePresence, withdraw } from "@/lib/publications";
import { clearSessionCookie, readSessionToken, requireAccount } from "@/lib/session";

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

/* -------------------------------------------------------------------- cercles */

export async function creerCercle(formData: FormData) {
  const account = await requireAccount();
  const result = await createCircle(account.id, String(formData.get("nom") ?? ""));
  if (!result.ok) redirect("/cercles?erreur=1");
  redirect(`/cercles/${result.value.id}`);
}

export async function creerInvitation(formData: FormData) {
  const account = await requireAccount();
  const circleId = String(formData.get("cercle") ?? "");
  const result = await createInvite(account.id, circleId);
  if (!result.ok) redirect(`/cercles/${circleId}?erreur=${result.reason}`);
  redirect(`/cercles/${circleId}?lien=${result.value.token}`);
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

/* ------------------------------------------------------------------- sorties */

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
  revalidatePath("/maintenant");
}

export async function retirerSortie(formData: FormData) {
  const account = await requireAccount();
  await withdraw(account.id, String(formData.get("sortie") ?? ""));
  revalidatePath("/maintenant");
}
