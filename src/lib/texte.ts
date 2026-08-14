/**
 * Comparer deux morceaux de français sans se faire prendre en défaut par un accent.
 *
 * Deux endroits en ont besoin, pour la même raison : les contrôles d'ingestion, qui
 * confrontent ce qu'un modèle a rendu à la page dont il l'a tiré, et les mots-clés de
 * l'agenda, qui cherchent « théâtre » dans un titre écrit « Theatre de marionnettes ».
 */

/**
 * Ramène un texte à ce qui compte pour une comparaison : minuscules, sans accents, sans
 * ponctuation, espaces réduits. Une page écrit « Fête de l'Escalade », le modèle rend
 * « Fete de l'escalade ». C'est le même titre, et aucun des deux ne doit être pris en
 * défaut pour ça.
 */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Cherche `aiguille` dans `meule`, en exigeant un début de mot. Les deux doivent avoir été
 * normalisés.
 *
 * Sans cette précaution, « 4 janvier » se trouvait dans « 14 janvier » : le contrôle des
 * dates validait le lendemain de ce qu'il vérifiait, une fois sur dix.
 *
 * La fin du mot, elle, reste ouverte : qui surveille « piscine » veut aussi qu'on le
 * prévienne pour « piscines ».
 */
export function contient(meule: string, aiguille: string): boolean {
  if (!aiguille) return false;
  return ` ${meule} `.includes(` ${aiguille}`);
}
