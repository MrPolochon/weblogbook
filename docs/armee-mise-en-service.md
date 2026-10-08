# Mise à jour Armée

## Activation

1. Appliquer `supabase/secure_armee_operations.sql` au projet Supabase utilisé par le site, après les migrations Armée existantes (`add_armee_avions_missions.sql`, `add_armee_features.sql`, `add_vols_equipage_militaire.sql`).
2. Vérifier que la requête se termine sans erreur. Le script est transactionnel et réexécutable. Il conserve les anciens journaux et n'effectue aucun versement de rattrapage.
3. Déployer le code correspondant. Les nouvelles mutations refusent de revenir à l'ancien paiement non transactionnel si la fonction SQL manque.
4. Tester avec un profil Armée, un profil commandement et un profil civil : onglets, dépôt, contrôle des membres, décision et historique bancaire.

Le navigateur et la connexion de production n'étaient pas accessibles pendant la préparation : l'application effective de la migration doit être confirmée avant déploiement.

## Comportement

- Un dossier ouvert par pilote bénéficiaire et par mission. Les anciens doublons ne sont pas supprimés ; le délai est revérifié lors de leur validation.
- Validation, crédit du compte Armée, transaction bancaire, journal de mission et journal du commandement en une transaction. Une nouvelle tentative d'une même décision ne crée pas de nouveau versement ou refus.
- Le pilote enregistré reçoit la progression ; la prime va au compte Armée. Aucune prime personnelle supplémentaire n'est introduite.
- La réduction de ponctualité utilise le dépôt initial, pas l'heure de validation. La série d'opérations est calculée en UTC.
- Pas de validation avant l'arrivée déclarée ; pas de modification ou suppression d'un vol déjà payé.
- Participants habilités et non suspendus, durée entière de 1 à 1 440 minutes, chaînes bornées. Le chef du dossier est son pilote.
- Remplacement de l'équipage et changement du vol enregistrés ensemble ; contrôle des rôles également dans la base.
- Tableau opérationnel paginé, décisions du commandement, journal des 20 dernières actions, flotte avec dernier vol et état de destruction.
- Statistiques calculées en base sur l'historique complet ; taux de succès sur les dossiers décidés. Carnet lu par pages et affichage progressif par 30 vols.
- État d'erreur et nouvelle tentative lors du chargement. Les missions ne sont activées qu'après vérification de leur disponibilité.
- Trame de briefing et limites de publication, enregistrement accompagné d'une entrée de journal.

## Vérification locale

Installer le moteur PostgreSQL isolé (sans modifier les dépendances de l'application) :

```powershell
npm install --prefix tmp/armee-sql-tests --no-save --package-lock=false @electric-sql/pglite
node --test scripts/test-armee-sql.cjs
node --test scripts/test-armee-rules.cjs
npx tsc --noEmit
```

Les tests SQL couvrent les nouvelles tentatives, le rollback d'un échec de journal, le délai et les dossiers doublons, les droits, l'équipage, la ponctualité, les agrégats dépassant 1 000 lignes, la conservation des paiements et les briefings. Ce moteur utilise une seule session ; un test de validations concurrentes dans des sessions PostgreSQL distinctes reste une vérification de mise en service.

Pendant la bascule, éviter de valider des missions depuis l'ancienne version : la garantie transactionnelle s'applique une fois le nouveau code déployé. Les anciennes routes gardent leur logique précédente pendant cette courte étape ; la migration ne tente pas de créditer ou corriger les anciens dossiers.
