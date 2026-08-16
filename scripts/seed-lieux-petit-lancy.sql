-- Les lieux publics du Petit-Lancy — le même recensement que seed-lieux-petit-lancy.mts,
-- en SQL parce que l'image de production n'embarque pas la chaîne TypeScript (choix du
-- Dockerfile), et qu'un bootstrap de données n'y justifie pas d'exception.
--
-- Depuis le dépôt, sur ta machine :
--
--   ssh ubuntu@allezou.ch "cd /home/ubuntu/allezou && docker compose -f docker-compose.prod.yml exec -T postgres psql -U totir -d totir" < scripts/seed-lieux-petit-lancy.sql
--
-- Rejouable sans risque : un lieu déjà présent (même nom, casse ignorée) n'est pas
-- recréé. `created_by` reste vide — ces lieux sont recensés par la commune (lancy.ch,
-- août 2026), personne ne les signe. Les positions viendront du géocodage du serveur.

WITH nouveaux(name, commune, address, categorie) AS (
  VALUES
    -- Parcs — lancy.ch, « Parcs et promenades »
    ('Parc Louis-Bertrand',              'Petit-Lancy', NULL,                                          'parc'),
    ('Parc du Gué',                      'Petit-Lancy', 'Chemin du Gué 8',                             'parc'),
    ('Parc des Morgines',                'Petit-Lancy', 'Avenue des Morgines 33',                      'parc'),
    ('Parc Cérésole',                    'Petit-Lancy', 'Chemin de la Vendée 31',                      'parc'),
    ('Parc Chuit',                       'Petit-Lancy', 'Chemin des Érables 17',                       'parc'),
    ('Parc de Tivoli',                   'Petit-Lancy', 'Chemin du Fief-de-Chapitre 15',               'parc'),
    ('Parc Saint-Marc',                  'Petit-Lancy', 'Avenue du Bois-de-la-Chapelle 19',            'parc'),
    ('Parc Alphonse-Bernasconi',         'Petit-Lancy', 'Chemin des Vignes 2',                         'parc'),
    -- Places de jeux hors parcs — lancy.ch, « Place de jeux »
    ('Place de jeux Clair-Matin',        'Petit-Lancy', NULL,                                          'aire_de_jeux'),
    ('Square Vendée',                    'Petit-Lancy', NULL,                                          'aire_de_jeux'),
    ('École de Tivoli (préau)',          'Petit-Lancy', NULL,                                          'aire_de_jeux'),
    ('École Cérésole (préau)',           'Petit-Lancy', NULL,                                          'aire_de_jeux'),
    ('École Caroline (préau)',           'Petit-Lancy', NULL,                                          'aire_de_jeux'),
    ('École des Morgines (préau)',       'Petit-Lancy', NULL,                                          'aire_de_jeux'),
    ('École du Petit-Lancy (préau)',     'Petit-Lancy', NULL,                                          'aire_de_jeux'),
    -- Le reste du quartier
    ('Piscine de Tivoli',                'Petit-Lancy', 'Chemin du Fief-de-Chapitre 15',               'piscine'),
    ('Bibliothèque municipale de Lancy', 'Petit-Lancy', 'Route du Pont-Butin 70',                      'bibliotheque'),
    ('Villa Tacchini (maison de quartier)', 'Petit-Lancy', 'Chemin de l''Avenir 11',                   'maison_quartier'),
    -- La seule ludothèque de la commune est au Grand-Lancy : elle porte sa vraie commune.
    ('Ludothèque municipale de Lancy',   'Grand-Lancy', 'Avenue des Communes-Réunies 73, Espace Palettes', 'ludotheque')
)
INSERT INTO place (name, commune, address, categorie)
SELECT n.name, n.commune, n.address, n.categorie::place_categorie
FROM nouveaux n
WHERE NOT EXISTS (
  SELECT 1 FROM place p
  WHERE p.archived_at IS NULL AND lower(p.name) = lower(n.name)
);

SELECT count(*) AS lieux_au_catalogue FROM place WHERE archived_at IS NULL;
