# Polices

Ces fichiers sont commités pour que `next build` ne dépende plus de la disponibilité de
Google Fonts : un déploiement est tombé le 16 août 2026 sur des 404 transitoires de
fonts.gstatic.com pendant une rotation de version. Ce sont exactement les woff2 variables
que `next/font/google` téléchargeait au build — mêmes glyphes, même rendu.

| Fichier              | Famille            | Axe `wght` | Sous-ensemble | Téléchargé de                                                                              |
| -------------------- | ------------------ | ---------- | ------------- | ------------------------------------------------------------------------------------------ |
| `fredoka-latin.woff2` | Fredoka (variable) | 300–700    | latin         | `https://fonts.gstatic.com/s/fredoka/v17/X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_DWu89U.woff2`    |
| `nunito-latin.woff2`  | Nunito (variable)  | 200–1000   | latin         | `https://fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaB.woff2`                        |

Le sous-ensemble latin couvre tout le français : accents (U+0000–00FF), œ/Œ (U+0152–0153),
apostrophe et tirets typographiques (U+2000–206F), € (U+20AC). N'en manquent que des
raretés comme Ÿ (latin-ext) ; si un besoin apparaît, télécharger le fichier latin-ext de la
même façon : `curl` sur `https://fonts.googleapis.com/css2?family=…` avec un User-Agent de
navigateur récent, puis prendre l'URL du bloc voulu.

Les deux familles sont sous licence [SIL Open Font License 1.1](https://openfontlicense.org),
qui autorise cette redistribution — Fredoka © Milena Brandão, Hafontia ;
Nunito © The Nunito Project Authors.
