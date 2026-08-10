/**
 * Conversion des colonnes renvoyées par `db.execute`.
 *
 * Les requêtes SQL brutes ne passent pas par le mappage de Drizzle : les `timestamptz`
 * en reviennent sous forme de chaînes. Annoncer `Date` dans un type sans convertir la
 * valeur produit un mensonge de type qui n'explose que plus tard, à l'usage. Tout ce qui
 * sort d'une requête brute passe donc par ici.
 */

export function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

export function asDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return asDate(value);
}
