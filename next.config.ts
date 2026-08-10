import type { NextConfig } from "next";

/**
 * La politique de sécurité du contenu est posée par `src/proxy.ts`, qui a besoin d'un nonce
 * différent à chaque requête. Ne restent ici que les en-têtes constants.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Rien ne gagne à annoncer le serveur qu'on utilise.
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "web-push", "nodemailer"],

  async headers() {
    return [
      {
        source: "/:chemin*",
        headers: [
          {
            // Le domaine de production est un .ch : contrairement au .app, le TLD n'est pas
            // préchargé en bloc dans les navigateurs. Cet en-tête est donc la protection
            // réelle, et il ne vaut qu'à partir de la deuxième visite — d'où la soumission
            // du domaine à hstspreload.org, dont ces valeurs sont exactement le prérequis.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
