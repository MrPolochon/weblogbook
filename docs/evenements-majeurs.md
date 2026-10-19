# Événements majeurs et réservations

## Utilisation

- Dans le calendrier, un administrateur coche « Événement majeur », choisit les aéroports, la durée des slots, la capacité et les postes ATC ouverts. Les heures sont UTC.
- La page de l’événement permet de réserver comme pilote ou contrôleur, modifier une réservation non utilisée, confirmer sa présence ou annuler. Un compte Discord lié est requis.
- Avant la prise de service ATC, « Réserver une position » ouvre le planning libre. Les réservations libres et événementielles partagent le même planning : la première réservation confirmée est conservée.
- Admin → Événements majeurs affiche le manifeste, la liste d’attente, les présences et l’export CSV. Les identifiants Discord sont réservés aux administrateurs.
- Un bandeau apparaît sur la connexion et le logbook à J-1, puis annonce l’événement en cours.

## Contrôles

Une réservation pilote confirmée est nécessaire pour déposer un plan depuis ou vers un aéroport concerné pendant l’événement, y compris un dépôt anticipé pour son créneau. Route, callsign, horaire et durée doivent correspondre. Le lien de dépôt préremplit ces informations. Le strip affiche le nom de l’événement et le slot.

Les contrôles sont appliqués côté serveur et en base, y compris pour les créations ATC. Une réservation n’est utilisable que pour un plan. Un déroutement d’un vol existant reste possible. Les postes réservés ne peuvent pas être pris par un autre contrôleur ; les sessions déjà actives ne sont pas déconnectées.

Après réservation, les dates, aéroports, capacités et postes de l’événement sont verrouillés. Fermer les inscriptions conserve les réservations. Désactiver l’événement annule les réservations non utilisées et conserve leur historique ; les réservations libres restent intactes.

## Installation et validation

Migration : `supabase/major_events_and_reservations.sql`, transactionnelle et réexécutable. Installée avec succès sur le projet Supabase weblogbook le 19 octobre 2026. Aucun événement réel n’est créé par le script.

Tests :

```text
node --test scripts/test-major-event-rules.cjs
node --test scripts/test-major-events-sql.cjs
```

Les tests SQL utilisent PostgreSQL isolé via PGlite. Installation de cette dépendance de test uniquement :

```text
npm install --prefix tmp/armee-sql-tests --no-save --package-lock=false @electric-sql/pglite
```

Les tests couvrent les conflits, quotas des deux extrémités, priorité des réservations libres, liste d’attente, modification atomique, prise de service, plan unique, déroutement, permissions et frontières temporelles. Les verrous transactionnels sérialisent les réservations ; les tests isolés ne simulent pas plusieurs connexions simultanées.
