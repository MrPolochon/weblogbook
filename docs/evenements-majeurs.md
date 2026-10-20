# Événements majeurs et réservations

## Utilisation

- Dans le calendrier, un administrateur coche « Événement majeur », choisit les aéroports, la durée des slots, la capacité et les postes ATC ouverts. Les heures sont UTC.
- La page de l’événement permet de choisir un créneau comme pilote ou contrôleur, modifier une réservation non utilisée, confirmer sa présence ou annuler. Un compte Discord lié est requis. Pour un pilote, le choix du créneau réserve la place et ouvre le dépôt prérempli : l'inscription n'est confirmée qu'après le dépôt effectif du plan. Un simple brouillon ne confirme rien. L’ATC est confirmé directement.
- Avant la prise de service ATC, « Réserver une position » ouvre le planning libre. Les réservations libres et événementielles partagent le même planning : la première réservation confirmée est conservée.
- Admin → Événements majeurs affiche le manifeste, la liste d’attente, les présences et l’export CSV. Les identifiants Discord sont réservés aux administrateurs.
- Un bandeau apparaît sur la connexion et le logbook à J-1, puis annonce l’événement en cours.

## Contrôles

Une réservation pilote confirmée est nécessaire pour déposer un plan depuis ou vers un aéroport concerné pendant l’événement, y compris un dépôt anticipé pour son créneau. Route, callsign, horaire et durée doivent correspondre. Le lien de dépôt préremplit ces informations. Le strip affiche le nom de l’événement et le slot.

En base, `event_reservations.status=confirmed` réserve la capacité du créneau ; pour les pilotes, le manifeste et l'export ne présentent l'inscription comme confirmée qu'une fois `plan_id`/`claimed_at` renseigné par le déclencheur de dépôt. L'historique reste confirmé si un plan terminé est ensuite remplacé par son vol dans le carnet. Les inscriptions incomplètes gardent leur créneau jusqu'à annulation, comme les réservations existantes. La liste d'attente n'ouvre le dépôt qu'après promotion. La présence pilote ne peut pas être confirmée avant le dépôt.

La capacité est un nombre entier de 1 à 100 mouvements par aéroport et par créneau, pas un total pour tout l'événement. Le formulaire et l'API affichent les mêmes messages de validation en français.

Les contrôles sont appliqués côté serveur et en base, y compris pour les créations ATC. Une réservation n’est utilisable que pour un plan. Un déroutement d’un vol existant reste possible. Les postes réservés ne peuvent pas être pris par un autre contrôleur.

### Relève des positions ATC

Migration complémentaire : `supabase/atc_reservation_handover.sql` (après la migration principale). Le contrôleur qui occupe la position réservée à une autre personne reçoit des avertissements visuels et sonores à 3, 2 puis 1 minute. Le son nécessite une première interaction avec la page, conformément aux restrictions du navigateur ; les avertissements visuels restent disponibles.

À l'échéance, Supabase Cron contrôle les relèves chaque seconde, même sans navigateur ouvert. Ce délai d'exécution peut varier si le serveur est indisponible ou surchargé ; il ne s'agit pas d'une garantie temps réel. La session ATC est terminée, les vols libérés passent en autosurveillance, la durée est arrêtée à l'heure réservée et le chèque inclut salaire et taxes accumulés. Le compte du site reste connecté. Une réservation annulée, expirée ou appartenant au contrôleur en place ne provoque aucune expulsion.

La clôture volontaire et automatique utilisent la même transaction pour éviter un double paiement. La tâche de nettoyage ATC existante traite l'arrêt du bot ATIS et les clôtures de vols restantes. Les détails d'exécution du travail chaque seconde sont conservés une journée.

Tests complémentaires : `node --test scripts/test-atc-handover.cjs`.

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
