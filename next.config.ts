import createNextIntlPlugin from "next-intl/plugin";
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

  /*
   * Qui reçoit les métadonnées dans le `<head>`, plutôt qu'en fin de page.
   *
   * Next diffuse la page avant que `generateMetadata` n'ait répondu, et rattache titre et
   * description au `<body>` : Googlebot exécute le JavaScript et les retrouve, mais un
   * robot qui lit le HTML brut ne voit qu'un titre par défaut. La liste par défaut de Next
   * (reprise ici mot pour mot) couvre Bing, Facebook, LinkedIn ; elle est d'avant les
   * robots d'assistants, que `robots.ts` invite pourtant explicitement. On les ajoute :
   * une fiche d'activité dont le titre ne serait lu que par Google ne servirait pas à
   * grand-chose dans une réponse d'assistant. Le coût est pour eux seuls — les pages des
   * parents continuent d'arriver en flux.
   *
   * Vérifier à chaque montée de version : la liste vit dans
   * node_modules/next/dist/shared/lib/router/utils/html-bots.js.
   */
  htmlLimitedBots:
    /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|Claude-SearchBot|PerplexityBot|Perplexity-User|Amazonbot|[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i,

  experimental: {
    serverActions: {
      // Une photo d'affiche prise au téléphone pèse couramment 3 à 6 Mo ; la limite par
      // défaut d'une Server Action est 1 Mo et refuserait la requête avant même que
      // `lireAnnonce` ne s'exécute. 10 Mo laisse la marge du multipart au-dessus des
      // 8 Mo que `extraireDePhoto` accepte (MAX_IMAGE_OCTETS).
      bodySizeLimit: "10mb",
    },
  },

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

// Le plugin trouve src/i18n/request.ts tout seul — c'est son emplacement par défaut.
export default createNextIntlPlugin()(nextConfig);
