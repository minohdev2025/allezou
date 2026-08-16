# La carte Google Maps — pourquoi, où, et la garantie 0 franc

## Le choix

Allezou géocode ses lieux sur Nominatim (OpenStreetMap), côté serveur, et rien n'y
change : `src/lib/geo.ts` reste tel quel. Ce qui change, c'est ce que voient les
familles :

- **`lienCarte` (ui.tsx) pointe vers Google Maps** au lieu d'openstreetmap.org — c'est
  l'application que les parents ont déjà, avec leurs trajets et les horaires de bus.
  Lien officiel, gratuit, sans clé, en quantité illimitée. Toujours au clic : rien ne
  part tant que personne ne demande rien.
- **Une carte intégrée** (`src/app/carte-client.tsx`) sur l'agenda (toutes les activités
  filtrées) et sur « Nous sortons » (tous les lieux du catalogue, choisissables d'un
  toucher de marqueur). Elle est **voilée** : Google Maps ne se charge qu'après un
  toucher sur « Voir sur la carte », dans le même esprit. La CSP (`src/proxy.ts`)
  autorise les hôtes Google nécessaires, suivant la liste documentée par Google.
- **Poser un nouveau lieu du doigt** (`src/app/sortir/lieu/position-client.tsx`) : à
  l'ajout d'un lieu, le point touché sur la carte part avec le formulaire — plus précis
  que le géocodage, qui n'a alors plus rien à deviner.
- **Pas de géolocalisation**, nulle part : `Permissions-Policy: geolocation=()` la bloque
  pour toute l'application. C'est la promesse « pas de position GPS » de PRODUIT.md,
  opposable au code — la carte se pince, comme un plan papier.

## Le coût

Depuis mars 2025, chaque service Google Maps a son palier gratuit mensuel propre :

| Service | Gratuit / mois | Au-delà |
|---|---|---|
| Maps JavaScript API (chargements de la carte intégrée) | 10 000 | ~7 $ / 1 000 |
| Liens `lienCarte` / « Itinéraire ↗ » | illimité | — |

Un chargement = un toucher sur « Voir sur la carte », pas une visite de page : l'usage
réel restera très en dessous du palier. L'étape 4 ci-dessous plafonne le quota pour que
« gratuit » soit une garantie, pas un pari.

## Mise en place (une fois, ~10 min)

1. **Créer un projet** sur [console.cloud.google.com](https://console.cloud.google.com/projectcreate)
   et activer la facturation (carte bancaire requise ; rien ne sera débité une fois le
   quota plafonné).
2. **Activer l'API** : [Maps JavaScript API](https://console.cloud.google.com/apis/library/maps-backend.googleapis.com) → Enable.
3. **Créer la clé** : APIs & Services → Credentials → Create credentials → API key,
   puis la restreindre :
   - *Application restrictions* → **Websites** : `https://allezou.ch/*` et
     `http://localhost:3000/*` pour le développement ;
   - *API restrictions* → **Restrict key** → uniquement *Maps JavaScript API*.
4. **Plafonner le quota (la garantie)** : Maps JavaScript API → Quotas & System limits →
   **Map loads per day** → **300 par jour** (≈ 9 300/mois, sous les 10 000 gratuits).
   Au-delà la carte s'excuse, la facture n'existe pas.
5. **Alerte budget** : Billing → Budgets & alerts → 1 CHF, alerte à 50 %.
6. *(Facultatif)* **Map ID** pour styler la carte : Map management → Create map ID
   (JavaScript). Sans lui, `DEMO_MAP_ID` suffit en développement.

Puis remplir la variable — la clé est lue **à l'exécution** par le serveur, jamais figée
au build :

- **En développement**, dans `.env.local` :

  ```
  GOOGLE_MAPS_API_KEY=la_clé_de_l_étape_3
  GOOGLE_MAPS_MAP_ID=facultatif_étape_6
  ```

- **En production**, dans le `.env` du serveur (`/home/ubuntu/allezou/.env`), puis un
  simple redémarrage applique la clé — sans reconstruire ni redéployer :

  ```bash
  ssh -t ubuntu@allezou.ch "nano /home/ubuntu/allezou/.env"
  ssh ubuntu@allezou.ch "cd /home/ubuntu/allezou && docker compose -f docker-compose.prod.yml up -d"
  ```

Cette clé finira dans la page envoyée au navigateur — c'est le modèle de l'API JS de
Google, et la protection vient des restrictions de domaine et du plafond, pas du secret.
Sans clé, les cartes intégrées expliquent leur absence à l'écran et tout le reste
fonctionne.

## Suivi

Console Google Cloud → Google Maps Platform → Metrics. Si « Voir sur la carte » approche
vraiment 300 touchers/jour, relever le plafond en connaissance de cause — ou se réjouir :
c'est qu'Allezou marche.
