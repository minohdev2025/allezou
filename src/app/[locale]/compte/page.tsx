import { redirect } from "next/navigation";

/**
 * L'ancienne page `/compte` a migré vers `/reglages`. On garde l'adresse
 * pour les liens partagés, les favoris, les QR qui pointaient ici : un
 * visiteur qui atterrit sur `/compte` est redirigé vers la nouvelle
 * adresse, où il retrouvera tout sous forme de tuiles.
 *
 * Pas de préserver la query string pour l'instant : les anciens liens
 * comptaient sur les écrans (`?coparent=…`, `?erreur=…`) qui n'existent
 * plus. Si quelqu'un revient avec une vieille URL, il perd l'erreur —
 * acceptable, l'erreur visait à le débloquer et il n'en a plus besoin.
 */
export default function Compte() {
  redirect("/reglages");
}
