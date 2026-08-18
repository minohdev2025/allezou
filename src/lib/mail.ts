/**
 * Envoi des liens de connexion.
 *
 * Sans SMTP configuré (développement, tests), le lien est écrit dans la console au lieu
 * d'être envoyé — on ne veut ni dépendance à un service externe pour développer, ni
 * courriel parti par accident.
 */

import nodemailer, { type Transporter } from "nodemailer";

import { traducteur } from "./traduire";

let transporter: Transporter | null = null;

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

/** Boîte d'envoi de test : renseignée uniquement quand SMTP n'est pas configuré. */
export const sentMails: Mail[] = [];

/**
 * Le dernier lien de connexion, pour l'afficher à l'écran en développement.
 *
 * Renvoie toujours null en production : afficher un lien de connexion sans l'envoyer par
 * courriel permettrait à n'importe qui d'entrer dans le compte de n'importe quelle adresse.
 * C'est un confort de développement, jamais une fonctionnalité.
 */
export function lienDeConnexionEnDeveloppement(
  env: string | undefined = process.env.NODE_ENV,
): string | null {
  if (env === "production" || smtpConfigured()) return null;

  const dernier = sentMails.at(-1);
  return dernier?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!smtpConfigured()) {
    sentMails.push(mail);
    // On ne garde que les derniers : cette boîte ne sert qu'au développement et aux tests.
    if (sentMails.length > 20) sentMails.splice(0, sentMails.length - 20);

    if (process.env.NODE_ENV !== "test") {
      console.info(`\n[courriel non envoyé — SMTP absent]\nÀ : ${mail.to}\n${mail.text}\n`);
    }
    return;
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM ?? "Allezou <contact@allezou.ch>",
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
}

/** Le courriel part dans la langue de la page d'où le lien a été demandé. */
export function sendLoginLink(email: string, url: string, locale = "fr"): Promise<void> {
  const t = traducteur(locale, "MailConnexion");
  return sendMail({
    to: email,
    subject: t("sujet"),
    text: t("corps", { url }),
  });
}
