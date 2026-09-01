"use client";

import { useRouter } from "@/i18n/navigation";

/**
 * Le formulaire des filtres : il marche sans JavaScript, et mieux avec.
 *
 * Sans, c'est un `<form method="get">` ordinaire. Le navigateur assemble l'adresse tout
 * seul et navigue ; l'ancre `#filtres` portée par l'action le ramène au bloc de filtres au
 * lieu du haut de la page.
 *
 * Avec, on assemble la même adresse à la main et on la pousse en `scroll: false`. Rien ne
 * bouge à l'écran — ni le défilement, ni la carte au-dessus —, seule la liste change
 * dessous. C'est la différence entre régler un filtre et repartir d'une page neuve : les
 * puces étaient des liens, chacune rechargeait l'écran et le renvoyait en haut, et choisir
 * trois communes voulait dire remonter trois fois.
 *
 * L'adresse produite est la même dans les deux cas, et c'est ce qui compte : elle se
 * partage, se met en favori, et le serveur ne sait pas par quel chemin elle est arrivée.
 */
export function FormulaireFiltres({
  action,
  chemin,
  className,
  children,
}: {
  /** Où poste le formulaire sans JavaScript : le chemin avec sa langue, et l'ancre. */
  action: string;
  /** Le même écran pour le routeur de next-intl, qui pose le préfixe de langue lui-même. */
  chemin: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <form
      id="filtres"
      method="get"
      action={action}
      className={className}
      onSubmit={(evenement) => {
        evenement.preventDefault();

        const params = new URLSearchParams();
        for (const [cle, valeur] of new FormData(evenement.currentTarget).entries()) {
          // « communesToutes » n'est pas un filtre : une case en plus, qui dit « aucune
          // commune choisie ». Elle n'a rien à faire dans une adresse qu'on partage.
          if (cle === "communesToutes") continue;
          params.append(cle, String(valeur));
        }

        const requete = params.toString();
        router.push(requete ? `${chemin}?${requete}` : chemin, { scroll: false });
      }}
    >
      {children}
    </form>
  );
}
