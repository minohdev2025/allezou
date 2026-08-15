/**
 * Ce que ce test garantit : le message tout prêt ne perd jamais ce qui le rend utile.
 *
 * C'est un texte, donc personne ne le relit une fois écrit. Un lien qui disparaîtrait dans
 * une reformulation partirait pourtant à quinze familles sans que rien ne le signale, et le
 * parent qui invite ne s'en apercevrait qu'en voyant que personne n'arrive.
 */

import { describe, expect, it } from "vitest";

import { jourEnFrancais, messageDInvitation } from "@/lib/message-invitation";

const LIEN = "https://allezou.ch/rejoindre/jeton-abc";

describe("Le message d'invitation", () => {
  it("porte le lien, le cercle, la date de fin et la page des données", () => {
    const message = messageDInvitation(
      { circleName: "Classe de Jules", expiresAt: new Date("2026-08-22T10:00:00+02:00") },
      LIEN,
    );

    expect(message).toContain(LIEN);
    expect(message).toContain("Classe de Jules");
    expect(message).toContain("22 août");
    expect(message).toContain("https://allezou.ch/donnees");
  });

  it("renvoie vers les données du site d'où vient le lien", () => {
    // Le lien vaut ce que vaut APP_URL, qui diffère entre le développement et la production.
    // Écrire allezou.ch en dur enverrait un parent en développement vers le site public.
    const message = messageDInvitation(
      { circleName: "Voisinage", expiresAt: new Date("2026-08-22T10:00:00+02:00") },
      "http://localhost:3000/rejoindre/jeton-abc",
    );

    expect(message).toContain("http://localhost:3000/donnees");
    expect(message).not.toContain("https://allezou.ch");
  });

  it("ne promet que ce que le produit tient", () => {
    const message = messageDInvitation(
      { circleName: "Classe de Jules", expiresAt: new Date("2026-08-22T10:00:00+02:00") },
      LIEN,
    );

    // Les quatre phrases que DONNEES.md démontre. Si l'une d'elles doit changer, c'est que
    // le produit a changé, et ce test est le bon endroit pour s'en apercevoir.
    expect(message).toContain("gratuit");
    expect(message).toContain("Suisse");
    expect(message).toContain("sans publicité");
    expect(message).toContain("prénom");
  });

  it("écrit la date à l'heure de Genève", () => {
    // Une minute avant minuit à Genève, c'est encore la veille : un serveur en UTC
    // annoncerait le lendemain.
    expect(jourEnFrancais(new Date("2026-08-22T21:59:00Z"))).toBe("22 août");
    expect(jourEnFrancais(new Date("2026-08-22T22:01:00Z"))).toBe("23 août");
  });
});
