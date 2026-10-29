# Validation sur copie du schéma réel — 29 octobre 2026

Le schéma a été exporté en lecture seule depuis le projet Supabase cible, puis reconstruit dans un PostgreSQL embarqué local. Aucun utilisateur, vol ou solde réel n’a été copié. Tous les enregistrements manipulés pendant la recette sont fictifs.

La copie reprend 153 tables, neuf types énumérés, les colonnes, valeurs par défaut, contraintes, index, politiques RLS et permissions exportées. Six vues, 16 fonctions supplémentaires et 21 triggers existants ont été rejoués, dont les règles qui gèrent les appareils, les plans, les réservations d’événements et les transpondeurs.

Les cinq migrations ont été installées deux fois. Les données fictives initiales, les colonnes préexistantes, les contraintes, index et politiques sont préservés. Les tests vérifient le devis stable, les montants serveur, le dépôt et la réservation de charge, la restitution unique après annulation et l’enregistrement au carnet en attente avec répétition idempotente et filtrage des plans déjà enregistrés.

Cette recette a trouvé une incompatibilité absente des premières fixtures : `plans_vol.armee_mission_id` est un texte dans la base cible. Le helper de classement des missions accepte désormais ce type, avec conversion explicite compatible avec l’ancienne fixture UUID. Un test permanent couvre aussi les identifiants de mission non UUID.

Le bundle validé porte l’empreinte SHA-256 : `f3b4df6751b3abfae2fc86e0e95d0cd560dfe07f4b60996c46b019223d8d6149`.

La suite applicative complète passe à **319 tests réussis**. Les traces détaillées de la copie restent locales dans `tmp/release-copy-validation.json` et le schéma exporté n’est pas publié dans le dépôt.

Limites : il s’agit d’une copie des définitions avec données fictives, pas d’un clone des données de production. `auth.users` est simulé localement ; 21 autres triggers, notamment les notifications, restent hors de cette recette. La concurrence entre connexions externes, la charge réelle, les emails et les paramètres hébergés ne sont pas certifiés par ce test.
