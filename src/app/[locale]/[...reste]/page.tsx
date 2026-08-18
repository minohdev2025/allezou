import { notFound } from "next/navigation";

/**
 * Tout chemin qui n'existe pas sous une langue valide passe par ici : /en/nimportequoi
 * doit montrer la page « n'existe pas » dans la langue demandée, pas l'écran brut du
 * framework. C'est le pendant, par langue, de ce que not-found.tsx explique.
 */
export default function ResteInconnu() {
  notFound();
}
