/**
 * Le message qu'un parent envoie pour inviter les autres.
 *
 * Le lien seul laisse à celui qui invite le travail le plus ingrat du produit : expliquer
 * Allezou à quinze familles, une par une, dans un groupe où personne n'a rien demandé. Ce
 * texte répond aux questions qu'un parent se pose avant de cliquer sur un lien reçu par
 * message, et il le fait avec les mots du site plutôt qu'avec ceux qu'on improvise un
 * dimanche soir.
 *
 * Il ne promet rien que le produit ne tienne : gratuit, hébergé en Suisse, sans publicité,
 * un prénom par enfant. Chacune de ces phrases se vérifie sur la page des données, vers
 * laquelle il renvoie — c'est elle qui convainc, pas le message.
 *
 * La date de fin y figure parce qu'elle donne la raison de s'y mettre maintenant : un lien
 * sans échéance se range dans « un de ces jours ».
 *
 * Il part dans la langue de qui invite : c'est cette personne qui connaît son groupe
 * WhatsApp, et le lien de la page données qu'il contient est préfixé pour la même langue.
 */

import type { InvitationLisible } from "./circles";
import { cheminLocalise, jourLong, traducteur } from "./traduire";

export function messageDInvitation(
  invitation: InvitationLisible,
  lien: string,
  locale = "fr",
): string {
  const t = traducteur(locale, "MessageInvitation");
  return t("texte", {
    cercle: invitation.circleName,
    lien,
    date: jourLong(invitation.expiresAt, locale),
    donnees: `${new URL(lien).origin}${cheminLocalise(locale, "/donnees")}`,
  });
}
