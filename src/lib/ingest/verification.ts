/**
 * La relecture croisée : un second passage du modèle, indépendant du premier, qui relit
 * le bloc d'origine et dit s'il y retrouve l'activité annoncée.
 *
 * Les contrôles de `controles.ts` vérifient la lettre — chaque valeur figure-t-elle sur la
 * page ? Ce passage-ci vérifie le sens : la page parle-t-elle bien de cette activité, à
 * cette date, ou d'une voisine ? Annonce-t-elle une annulation que la lettre ne voit pas ?
 * « COMPLET » à côté d'un titre laisse tous les contrôles littéraux indifférents, et c'est
 * précisément le genre de chose qu'une relecture attrape.
 *
 * Le verdict du vérificateur ne publie jamais rien : il ne sait que retenir. Un désaccord
 * devient un échec de contrôle, et l'activité attend une relecture humaine. Et comme le
 * vérificateur est un modèle, son propre avis n'est pas cru sur parole : seul un verdict
 * au format attendu compte, et une panne le rend muet plutôt que sévère — les contrôles
 * déterministes restent alors seuls juges, comme avant lui.
 */

import { z } from "zod";

import { contient, normaliser } from "../texte";
import type { Echec } from "./controles";
import { appelMiniMax, parseModelJson } from "./minimax";
import type { RawEvent } from "./types";

/**
 * En dessous, le vérificateur dit lui-même qu'il n'y croit pas : l'activité attend une
 * relecture. Le seuil est volontairement bas — le vérificateur doit attraper ce qui
 * cloche, pas faire douter de tout ce qui passe.
 */
export const SEUIL_CERTITUDE = 0.6;

/**
 * Le modèle rend parfois `"problemes": null` plutôt qu'un tableau vide, et omet volontiers
 * `annulee` quand rien n'est annulé. Ces formes disent la même chose que la forme pleine.
 */
export const verdictSchema = z.object({
  certitude: z.number().min(0).max(1),
  annulee: z
    .boolean()
    .nullish()
    .transform((v) => v ?? false),
  problemes: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
});

export type Verdict = z.infer<typeof verdictSchema>;

const SYSTEME_VERIFICATION = [
  "Tu vérifies le travail d'un autre modèle. On te donne l'extrait d'une page d'agenda et",
  "les champs d'une activité qui prétend en être tirée.",
  'Réponds uniquement par un objet JSON, sans texte autour : {"certitude":0.0,"annulee":false,"problemes":["..."]}',
  "- « certitude » : entre 0 et 1, ta confiance que l'extrait annonce bien cette activité,",
  "  ce jour-là, à cette heure-là.",
  "- « annulee » : true si l'extrait dit que l'activité est annulée, complète ou reportée.",
  "- « problemes » : une phrase courte par champ que l'extrait contredit. Tableau vide si",
  "  tout correspond.",
  "- Ne juge que ce qui est écrit dans l'extrait. Une reformulation ou une abréviation",
  "  n'est pas un problème ; une date, une heure ou un lieu différents, si.",
  "- Un champ que l'extrait ne mentionne pas n'est pas un problème : les champs absents",
  "  ont leurs propres contrôles. Signale ce que l'extrait contredit, pas ce qu'il tait.",
].join("\n");

/** « samedi 12 septembre 2026 à 14h30 », la date comme la page l'écrirait. */
function enClair(date: Date, avecHeure: boolean): string {
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(avecHeure ? { hour: "2-digit" as const, minute: "2-digit" as const, hour12: false } : {}),
  }).format(date);
}

/** La fiche telle qu'on la présente au vérificateur : les champs, rien d'autre. */
export function presenterLActivite(event: RawEvent): string {
  const lignes = [
    `Titre : ${event.title}`,
    event.allDay
      ? `Date : ${enClair(event.startsAt, false)} (sans horaire annoncé)`
      : `Début : ${enClair(event.startsAt, true)}`,
  ];
  if (event.endsAt) lignes.push(`Fin : ${enClair(event.endsAt, !event.allDay)}`);
  if (event.placeLabel) lignes.push(`Lieu : ${event.placeLabel}`);
  if (event.recurrence) lignes.push(`Rythme : ${event.recurrence}`);
  if (event.minAge !== undefined || event.maxAge !== undefined) {
    lignes.push(`Âge : ${event.minAge ?? "?"} à ${event.maxAge ?? "?"} ans`);
  }
  return lignes.join("\n");
}

/**
 * Traduit un verdict en échecs de contrôle. Fonction pure : c'est elle que les tests
 * verrouillent, le reste n'est qu'un appel réseau.
 */
export function echecsDuVerdict(verdict: Verdict): Echec[] {
  const echecs: Echec[] = [];

  if (verdict.annulee) {
    echecs.push({
      code: "activite_annulee",
      detail: "La page annonce que l'activité est annulée, complète ou reportée.",
    });
  }

  if (verdict.problemes.length > 0) {
    echecs.push({
      code: "verification_ia",
      detail: verdict.problemes.slice(0, 3).join(" ; "),
    });
  } else if (verdict.certitude < SEUIL_CERTITUDE) {
    echecs.push({
      code: "verification_ia",
      detail: `Le vérificateur ne retrouve pas cette activité dans la page (certitude ${verdict.certitude.toFixed(2)}).`,
    });
  }

  return echecs;
}

export type Verificateur = (event: RawEvent) => Promise<Echec[]>;

/* ------------------------------------------------------------- le tri famille */

/**
 * Les sources structurées n'ont pas de modèle pour trier : leur JSON-LD dit tout, sauf si
 * la sortie intéresse une famille. Leurs filtres éditoriaux le disent mal — la Ville de
 * Genève range sa Fête de la rentrée dans « Tous publics », pas dans « Enfants et
 * famille » : l'étiquette dit qui la commune visait, pas qui la sortie intéresse.
 *
 * Ce tri-là est donc le seul travail qu'on confie au modèle sur ces sources : oui, non,
 * ou doute. Jamais un fait — les dates, lieux et titres restent ceux du flux structuré.
 */
export type VerdictFamille = "oui" | "non" | "doute";

export type TrieurFamilles = (events: RawEvent[]) => Promise<VerdictFamille[]>;

/** Cinquante par appel : la réponse reste courte, et un appel perdu ne perd pas le reste. */
const TRIAGE_PAR_LOT = 50;

const SYSTEME_TRIAGE = [
  "Tu tries l'agenda d'une collectivité suisse romande pour un agenda destiné aux familles",
  "avec enfants.",
  'Réponds uniquement par un objet JSON, sans texte autour : {"verdicts":[{"rang":0,"famille":"oui"}]}',
  "- « famille » vaut « oui », « non » ou « doute », un verdict par entrée, dans l'ordre,",
  "  avec le rang recopié.",
  "- « oui » : une sortie qu'un parent pourrait faire avec un enfant — fête, atelier,",
  "  spectacle jeune public, cinéma en plein air, vide-grenier, bibliothèque, marché,",
  "  sport ou animation ouverts à tous.",
  "- « non » : sans place pour un enfant — séance administrative ou politique, activité",
  "  réservée aux aînés ou aux adultes, conférence spécialisée, soirée dansante, cours de",
  "  sport pour adultes, vernissage, concert de soirée sans mention des familles.",
  "- Le public s'annonce aussi par qui organise et par où ça se passe : « avec Cité",
  "  Séniors », « club des aînés », un EMS, une maison de retraite. Une activité douce",
  "  — taiji, gym, marche, chant, jeux de société — portée par un tel nom est faite pour",
  "  les aînés, et c'est un « non », même quand elle est ouverte à tous.",
  "- « doute » : rare. Réserve-le aux entrées dont le titre et la description ne disent",
  "  vraiment rien du public. Une activité pensée pour les adultes est un « non » franc,",
  "  même si un enfant pourrait techniquement s'y asseoir.",
].join("\n");

/*
  La garde des aînés, posée après le modèle et sans lui demander son avis.

  « Taiji avec Cité Séniors » est passé en « oui » un matin d'août, et un parent qui
  surveillait le mot « taiji » a reçu la notification. Le nom de l'organisateur était dans
  le titre : ce n'est pas une lecture difficile, c'est une lecture que le modèle rate
  parfois, et une fois suffit pour que l'agenda cesse de ressembler à sa promesse.

  Un mot d'aînés dans le titre, la description ou le lieu vaut donc « non », quoi qu'ait
  répondu le modèle — sauf si le même texte appelle explicitement les familles, parce que
  les activités intergénérationnelles existent et qu'elles, on les veut.
*/
const MARQUEURS_AINES = [
  "seniors",
  "senior",
  "aines",
  "aine",
  "3e age",
  "3eme age",
  "troisieme age",
  "ems",
  "maison de retraite",
];

/** Ce qui rouvre la porte : le texte dit lui-même que les enfants sont attendus. */
const MARQUEURS_FAMILLE = [
  "intergenerationnel",
  "intergenerationnelle",
  "famille",
  "familles",
  "familial",
  "familiale",
  "enfant",
  "enfants",
  "petits enfants",
  "parents",
  "jeune public",
  "bebe",
  "bebes",
  "ados",
  "adolescents",
  "grands parents",
];

/**
 * Vrai quand le texte destine l'activité aux aînés sans appeler les familles.
 *
 * Pure, et c'est le point : les tests la verrouillent sans payer un appel au modèle, et
 * elle ne tousse jamais — contrairement à la lecture qu'elle double.
 */
export function reserveeAuxAines(event: RawEvent): boolean {
  const texte = normaliser(
    [event.title, event.description, event.placeLabel].filter(Boolean).join(" "),
  );
  if (!MARQUEURS_AINES.some((mot) => contient(texte, mot))) return false;
  return !MARQUEURS_FAMILLE.some((mot) => contient(texte, mot));
}

const verdictsTriageSchema = z.object({
  verdicts: z.array(
    z.object({
      rang: z.number().int(),
      famille: z.enum(["oui", "non", "doute"]),
    }),
  ),
});

/**
 * La seconde lecture d'un doute : une seule activité, la fiche entière cette fois.
 *
 * Le premier tri ne voit que le titre et une description tronquée — de quoi trancher
 * l'évident, pas les cas limites. Plutôt que d'envoyer chaque hésitation à un humain, on
 * paie une lecture de plus : la fiche complète dit presque toujours à qui elle s'adresse.
 * Ce qui résiste aux deux lectures est un vrai doute, et il y en a peu.
 */
const SYSTEME_SECOND_AVIS = [
  "Tu tries l'agenda d'une collectivité suisse romande pour un agenda destiné aux familles",
  "avec enfants. Un premier tri, sur le seul titre, n'a pas su trancher pour cette",
  "activité : voici sa fiche entière.",
  'Réponds uniquement par un objet JSON, sans texte autour : {"famille":"oui"}',
  "- « oui » : une sortie qu'un parent pourrait faire avec un enfant.",
  "- « non » : sans place pour un enfant — activité pensée pour les adultes, même si un",
  "  enfant pourrait techniquement s'y asseoir.",
  "- « doute » : seulement si la fiche entière ne dit vraiment rien du public.",
].join("\n");

const secondAvisSchema = z.object({ famille: z.enum(["oui", "non", "doute"]) });

/**
 * Range les verdicts rendus par le modèle face aux rangs demandés. Fonction pure : c'est
 * elle que les tests verrouillent. Un rang que le modèle a oublié devient un doute — il
 * sera regardé par quelqu'un, ce qui est le sort le plus honnête pour un oubli.
 */
export function alignerVerdicts(
  brut: unknown,
  nombre: number,
): VerdictFamille[] {
  const { verdicts } = verdictsTriageSchema.parse(brut);
  const parRang = new Map(verdicts.map((v) => [v.rang, v.famille]));
  return Array.from({ length: nombre }, (_, rang) => parRang.get(rang) ?? "doute");
}

/**
 * Trie un lot d'activités structurées : familles, pas familles, ou doute.
 *
 * Contrairement au vérificateur, une panne ici ne se tait pas : elle fait échouer la
 * source. Une source non filtrée qui s'ingérerait sans tri déverserait les séances du
 * Conseil municipal dans l'agenda des familles — mieux vaut une source en erreur, visible
 * dans sa santé, qu'un agenda qui ne ressemble plus à sa promesse.
 */
export async function trierPourFamilles(events: RawEvent[]): Promise<VerdictFamille[]> {
  const verdicts: VerdictFamille[] = [];

  for (let debut = 0; debut < events.length; debut += TRIAGE_PAR_LOT) {
    const lot = events.slice(debut, debut + TRIAGE_PAR_LOT);
    /*
      Le lieu part avec le titre : c'est souvent lui qui dit le public.

      « Gym douce » ne dit rien, « Gym douce — Cité Séniors » dit tout. Le flux structuré
      porte le lieu depuis toujours ; il ne coûte rien de le montrer au trieur.
    */
    const lignes = lot.map((event, rang) => {
      const description = event.description ? ` — ${event.description}` : "";
      const lieu = event.placeLabel ? ` (lieu : ${event.placeLabel})` : "";
      return `${rang}. ${event.title}${lieu}${description}`;
    });

    const contenu = await appelMiniMax(SYSTEME_TRIAGE, lignes.join("\n"));
    verdicts.push(...alignerVerdicts(parseModelJson(contenu), lot.length));
  }

  /*
    Les doutes ont droit à une seconde lecture, la fiche entière sous les yeux.

    Elle échoue en silence : un second avis qui tousse laisse le doute en place, et le
    doute finit en file — c'est déjà le sort le plus prudent. Seul le premier tri, sans
    lequel rien ne protège l'agenda, a le droit de faire échouer la source.
  */
  for (let rang = 0; rang < events.length; rang += 1) {
    if (verdicts[rang] !== "doute" || !events[rang].texteSource) continue;
    try {
      const contenu = await appelMiniMax(
        SYSTEME_SECOND_AVIS,
        `${events[rang].title}\n\n${events[rang].texteSource}`,
      );
      verdicts[rang] = secondAvisSchema.parse(parseModelJson(contenu)).famille;
    } catch {
      // Le doute reste un doute.
    }
  }

  return verdicts;
}

/**
 * Relit le bloc d'une activité et rend les échecs que le verdict impose.
 *
 * Muette quand il n'y a rien à relire — un flux structuré n'a pas de texte source — et
 * muette en cas de panne : retenir tout l'agenda parce que le vérificateur tousse
 * reviendrait à préférer une panne complète à une garde partielle. Les contrôles
 * déterministes, eux, ne toussent jamais.
 */
export async function verifierExtraction(event: RawEvent): Promise<Echec[]> {
  if (!event.texteSource) return [];

  try {
    const contenu = await appelMiniMax(
      SYSTEME_VERIFICATION,
      `Extrait de la page :\n${event.texteSource}\n\nActivité annoncée :\n${presenterLActivite(event)}`,
    );
    return echecsDuVerdict(verdictSchema.parse(parseModelJson(contenu)));
  } catch {
    return [];
  }
}
