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
            // Le domaine est en .app, donc déjà forcé en HTTPS par les navigateurs.
            // L'en-tête reste utile si l'application était servie ailleurs un jour.
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
