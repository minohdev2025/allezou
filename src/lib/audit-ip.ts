import { createHash, randomBytes } from "node:crypto";

import { headers as nextHeaders } from "next/headers";

/**
 * Hash d'IP salé côté serveur pour le journal d'audit.
 *
 * Pas de magic : SHA-256 sur (sel + IP). Le sel vit dans
 * `process.env.AUDIT_IP_SALT`. S'il est absent ou trop court, on génère
 * un sel aléatoire par-process — pratique pour les tests et le dev,
 * cassant la corrélation au redémarrage. En prod, AUDIT_IP_SALT DOIT être
 * posé, sinon le journal perd ses corrélations à chaque déploiement.
 *
 * Le sel fait au moins 16 caractères côté env : plus court, c'est trop
 * facile à brute-forcer si quelqu'un vole la base.
 */

let selAffecte: Buffer | null = null;

function obtenirSel(): Buffer {
  if (selAffecte) return selAffecte;
  const depuisEnv = process.env.AUDIT_IP_SALT;
  if (depuisEnv && depuisEnv.length >= 16) {
    selAffecte = Buffer.from(depuisEnv);
    return selAffecte;
  }
  selAffecte = randomBytes(32);
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[audit] AUDIT_IP_SALT absent ou trop court : les corrélations seront perdues au prochain démarrage.",
    );
  }
  return selAffecte;
}

/**
 * Hash d'une IP. Renvoie `null` si l'IP est absente ou vide — plutôt
 * qu'inventer une chaîne qui laisserait penser que l'IP est connue.
 *
 * On accepte IPv4 (« a.b.c.d ») et IPv6 (chaque groupe hexadécimal).
 * Si l'IP contient une virgule (chaîne `x-forwarded-for` avec plusieurs
 * IP), on prend la première : c'est le client réel, les suivantes sont
 * les proxies intermédiaires.
 */
export function hashIp(ipBrute: string | null | undefined): string | null {
  if (!ipBrute) return null;
  const premiere = ipBrute.split(",")[0]?.trim() ?? "";
  if (!premiere) return null;
  return createHash("sha256").update(obtenirSel()).update(premiere).digest("hex");
}

/**
 * L'IP du client, déduite des en-têtes de la requête.
 *
 * Caddy pose `x-forwarded-for` et on lui fait confiance : il tourne sur
 * le même VPS, derrière le pare-feu. Sans cette confiance, un client
 * pourrait forger l'en-tête et empoisonner le journal d'audit.
 *
 * En l'absence de `x-forwarded-for`, on tente `x-real-ip`, puis
 * `remote-addr` (le cas du localhost).
 */
export function ipDepuisHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const premiere = xff.split(",")[0]?.trim();
    if (premiere) return premiere;
  }
  return headers.get("x-real-ip") ?? headers.get("remote-addr");
}

/**
 * Helper tout-en-un : lit les en-têtes de la requête en cours et
 * retourne le hash IP. Utilisé par les Server Actions et routes API
 * qui appellent `recordAudit` avec l'IP capturée automatiquement.
 *
 * Renvoie `null` hors d'un contexte de requête (scripts, tests).
 */
export async function hashIpDeLaRequete(): Promise<string | null> {
  try {
    const h = await nextHeaders();
    return hashIp(ipDepuisHeaders(h));
  } catch {
    return null;
  }
}
