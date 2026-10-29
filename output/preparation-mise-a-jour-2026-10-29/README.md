# Préparation de la mise à jour — 29 octobre 2026

Les corrections ci-dessous sont présentes dans le code local. Aucun commit, push, déploiement ni changement de la base réelle n’a été effectué pour cette préparation. Ce document remplace le verdict technique des audits antérieurs pour les points corrigés ici ; ces audits restent des traces historiques.

## Corrections préparées

- **Carnet :** un vol transmis compte comme enregistré dès son entrée dans le carnet, même en attente du staff. Enregistrement, liaison au plan et marquage se font ensemble. Un deuxième envoi retrouve l’entrée existante. Les anciens doublons et les heures historiques ne sont ni supprimés ni fusionnés.
- **Validation :** protections en base contre l’auto-validation, les fausses confirmations et l’auto-attribution de privilèges. Les corrections ordinaires et les confirmations vérifiées par le serveur restent possibles.
- **Dépôt :** appartenance compagnie, propriété personnelle et disponibilité de l’appareil contrôlées. Le serveur calcule le chargement et les montants ; les valeurs économiques envoyées par le navigateur ne font plus foi.
- **Remplissage :** devis conservé pour le pilote, la compagnie, l’appareil, le trajet et le transport pendant la journée UTC. Le callsign, l’heure, l’annulation et la recréation ne relancent pas le tirage. Quantités, cargaison, tarifs et montants restent liés. Un tarif modifié s’applique aux nouveaux devis ; il ne transforme pas un ancien remplissage obtenu avec un billet moins cher.
- **Formulaire :** affichage du même devis que celui du dépôt ; réponses anciennes ignorées si le trajet change, erreurs visibles et dépôt bloqué sans devis valide. Callsign complet prérempli avec le code compagnie ou l’immatriculation, puis librement modifiable ; la saisie, le brouillon et la réservation restent prioritaires.
- **Stocks et paiements au dépôt :** création du plan, réservation PAX/fret, frais ferry et loyers dans une transaction. Loyer crédité au bailleur avec son historique bancaire. Échec = retour arrière. Annulation/refus restitue une fois ; reprise après refus réserve à nouveau. La confirmation copilote ne prélève pas une deuxième fois.
- **Accès directs :** les écritures de plans passent par les commandes vérifiées du serveur. Les anciennes fonctions de consommation de stock ne sont plus accessibles aux rôles publics. Les lectures et abonnements temps réel conservent leurs politiques.
- **BRIA :** briefing texte du formulaire dans l’application, lecture facultative du navigateur, sans ElevenLabs ni microphone, sans dépôt automatique. Dépendance retirée.
- **Taxes et paramètres :** un zéro explicite reste zéro. Taux hors limites et saisies vides refusés. Clôture, ferry, transit réparation et affichage du marché respectent les taux à zéro. Les prix de compagnie actuels restent entiers, conformément au schéma existant.
- **Revente personnelle :** le statut d’instruction « brouillon » par défaut ne suffit plus à interdire une revente ; les vrais appareils fictifs ou liés à une session restent protégés.
- **Délai du bilan :** message français indiquant que le serveur met trop de temps à répondre, à la place de l’erreur technique d’annulation.

## Vérifications locales

- Suite applicative : **318 tests réussis**, aucun échec ou test ignoré.
- TypeScript : réussi.
- ESLint : **960 fichiers, aucune erreur, sept avertissements préexistants**.
- Tests supplémentaires après la suite : les 13 vérifications de dépôt SQL repassent avec le verrou des anciennes fonctions de stock.
- Compilation de production : réussie, avec une connexion de base volontairement fictive. La relance après le blocage de droits Windows a terminé avec un code de sortie 0.

Les tests SQL utilisent PostgreSQL embarqué PGlite sur des données fictives et couvrent retours arrière, permissions et répétitions. Ils ne remplacent pas un essai de migration sur une copie du schéma réel ni une vérification de concurrence sur plusieurs connexions PostgreSQL externes. Les interactions du formulaire sont exécutées avec une simulation des Hooks ; elles ne constituent pas une recette visuelle sur tous les mobiles.

Traces : `tmp/preparation-update-tests.log`, `tmp/preparation-update-types.log`, `tmp/preparation-update-lint.json`, `tmp/preparation-update-build.log`, `tmp/preparation-targeted-sql.log`.

## Dossier de migration

`migrations.sql` regroupe, dans cet ordre et dans **une transaction unique** :

1. `supabase/logbook_registration_20261029.sql`
2. `supabase/logbook_staff_validation_20261029.sql`
3. `supabase/flight_submission_integrity_20261029.sql`
4. `supabase/flight_plan_access_20261029.sql`
5. `supabase/fix_revente_avions_personnels.sql`

`manifest.json` contient les empreintes des sources et du regroupement. Pour régénérer ces deux fichiers après une modification : `node scripts/prepare-update.cjs`. Ce programme écrit seulement le dossier local ; il n’ouvre aucune connexion et ne publie rien.

## Ordre de mise en service à respecter

1. Exécuter `preflight.sql` en lecture seule sur la cible ou sa copie. Résoudre les colonnes absentes, comptes entreprise manquants et états de flotte inhabituels avant installation. Examiner explicitement **ILMR / IMLR pour Mellor** : aucun renommage ni taux staff n’est modifié automatiquement.
2. Vérifier une sauvegarde récente et tester `migrations.sql` sur une copie du schéma réel. Conserver un état avant/après des volumes du carnet et des soldes.
3. Vérifier sur cette copie : dépôt commercial, personnel et ferry ; ATC et sans ATC ; refus puis renvoi ; annulation ; validation/refus copilote ; enregistrement en attente puis validation staff ; BRIA ; taxes à zéro ; ancien plan et vol militaire/MEDEVAC.
4. Installer les migrations avant le nouveau code. La nouvelle API refuse proprement le dépôt si ses fonctions SQL manquent ; certaines lectures attendent aussi les nouvelles colonnes. Ne pas publier le code seul.
5. Publier uniquement une version identifiée après réussite de ces contrôles, puis refaire les parcours connectés. Ces opérations ne sont pas exécutées par le dossier de préparation.

Les migrations ajoutent des protections sans réécrire l’historique. Pour un retour arrière applicatif, conserver d’abord les colonnes et données ajoutées ; ne pas supprimer les devis ou liaisons déjà créés et ne pas rétablir les anciennes permissions permissives pour contourner une erreur.

## Nouveautés de novembre : préparation séparée

La nouvelle économie, les décotes modérées de retard, le salaire maintenu, les factures carburant, la recherche/RSE, les aléas communs et les avis simulés restent dans les conceptions, maquettes et moteurs locaux. Leur activation est désactivée. **Leur raccordement aux règlements réels n’est pas livré par ces migrations** ; la date du 1er novembre ne doit pas déclencher à elle seule une mise en production.

La réception réelle des emails, la santé de la base et les parcours privés en ligne n’ont pas été revalidés pendant cette préparation. Les protections de profils préservent les privilèges historiques existants ; elles ne constituent pas une revue rétroactive des habilitations. Les paramètres de formation élève et les compteurs de temps ATC/SIAIV restent hors de ce verrou ciblé.
