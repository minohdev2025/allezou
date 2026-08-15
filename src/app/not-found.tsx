import { LienBouton, Titre } from "./ui";

/**
 * La page qu'on voit quand une adresse ne mène nulle part.
 *
 * Sans ce fichier, c'est celle du framework qui s'affiche, en anglais : « This page could
 * not be found ». Sur un site dont chaque phrase est écrite pour des parents genevois, et
 * qui pousse le soin jusqu'au « vous seul·e », c'était la seule porte qui donnait sur le
 * chantier.
 *
 * Elle arrive plus souvent qu'on ne croit : un lien d'invitation recopié de travers dans un
 * message, une sortie effacée depuis qu'elle a été partagée, une adresse tapée à la main.
 * Le texte dit donc les deux causes probables plutôt que de laisser quelqu'un penser qu'il
 * s'est trompé, alors que la sortie a simplement expiré comme elle devait.
 *
 * Elle ne demande pas qui regarde : `/` renvoie chacun là où il doit aller, celui qui a un
 * compte comme celui qui n'en a pas.
 */
export default function Introuvable() {
  return (
    <main className="apparait">
      <Titre emoji="🌥️" sous="Le lien est peut-être incomplet, ou la sortie qu'il montrait a déjà expiré.">
        Cette page n&apos;existe pas
      </Titre>
      <LienBouton href="/" variante="principal">
        Revenir à l&apos;accueil
      </LienBouton>
    </main>
  );
}
