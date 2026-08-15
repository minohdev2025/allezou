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
 */

import type { InvitationLisible } from "./circles";

/** « 22 août », à l'heure de Genève et non à celle du serveur. */
export function jourEnFrancais(date: Date): string {
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function messageDInvitation(invitation: InvitationLisible, lien: string): string {
  return [
    `Bonjour ! J'utilise Allezou pour que nos enfants se retrouvent dehors : on y dit quand`,
    `on sort au parc, et on y voit les activités des communes genevoises.`,
    ``,
    `C'est gratuit, hébergé en Suisse, sans publicité, et sur les enfants on n'y met qu'un`,
    `prénom.`,
    ``,
    `Voici le lien pour rejoindre notre cercle « ${invitation.circleName} » :`,
    lien,
    `Il fonctionne jusqu'au ${jourEnFrancais(invitation.expiresAt)}.`,
    ``,
    `Ce que le site enregistre et qui peut le voir : ${new URL(lien).origin}/donnees`,
  ].join("\n");
}
