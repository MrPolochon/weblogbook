# Prêts bancaires personnalisés

## Conditions

- Prêt personnalisé : de 1 000 000 à 10 000 000 F$, par F$ entier.
- Les anciennes offres standard de 200 000, 500 000, 1 000 000 et 5 000 000 F$ restent proposées.
- Tout nouveau prêt est limité au capital net de la compagnie mesuré avant le crédit : trésorerie + valeur catalogue des avions possédés non détruits − dettes bancaires restantes. Les appareils appartenant à un bailleur et les biens personnels du PDG sont exclus.
- Un seul prêt actif ; aucun nouvel emprunt avec un compte en découvert.
- Durée choisie : de 1 à 90 jours (convention de trois mois dans le jeu).
- Taux forfaitaire fixe pour la durée du contrat, et non taux annuel.

Le taux à 90 jours est interpolé entre les repères suivants, puis multiplié par durée/90 et arrondi à deux décimales :

| Capital emprunté | Taux pour 90 jours |
| --- | ---: |
| 200 000 F$ | 1,5 % |
| 500 000 F$ | 5 % |
| 1 000 000 F$ | 10 % |
| 5 000 000 F$ | 20 % |
| 10 000 000 F$ | 30 % |

Les intérêts sont arrondis au F$ le plus proche. Exemple : 2 500 000 F$ sur 60 jours, taux de 9,17 %, intérêts de 229 250 F$, total de 2 729 250 F$.

## Remboursements

**Quotidien** : dès 24 heures après la souscription. La cible cumulée au jour J est arrondie(total × J/durée). La différence avec les sommes déjà remboursées est prélevée. Cette formule rattrape les jours manqués, répartit les arrondis et tient compte des remboursements anticipés. Le traitement existant s'exécute toutes les heures ; il ne prélève pas deux fois une échéance déjà couverte.

**À l'échéance** : aucun prélèvement quotidien ; la totalité restante est débitée à la date limite.

Un remboursement anticipé partiel ou total est possible à tout moment. Les intérêts fixés à la souscription restent dus, sans frais de remboursement supplémentaires. Avant la date limite, les prélèvements quotidiens sont limités au solde disponible ; les impayés sont rattrapés. À la date limite, le reliquat est prélevé intégralement conformément à la politique existante, qui peut créer un découvert et enclencher la procédure de régularisation de sept jours.

Les nouveaux prêts n'ont aucun prélèvement supplémentaire sur les vols. Les anciens prêts conservent leur taux, leur échéance et leur mode historique « vols ».

## Déploiement et validation

Appliquer **supabase/company_loans_20261110.sql avant de publier l'application**. La migration conserve les conditions des prêts existants. Un doublon de prêts actifs fait échouer la création de l'index plutôt que de supprimer une dette. Vérifier ces doublons avant déploiement :

    SELECT compagnie_id,count(*) FROM prets_bancaires
    WHERE statut='actif' GROUP BY compagnie_id HAVING count(*)>1;

La migration ferme les écritures directes depuis les rôles navigateur ; les opérations passent par des fonctions réservées au service serveur, qui vérifient le PDG, co-PDG ou administrateur. Souscription et remboursement manuel enregistrent dette, solde, journal et identifiant de demande dans une même transaction.

Les fonctions de règlement des vols sont conservées, avec un filtre limitant le prélèvement historique aux prêts de mode « vols ». La clôture historique TypeScript applique le même filtre.

Validation prévue : tests de parité TypeScript/PostgreSQL, bornes et capital, droits, idempotence, annulation transactionnelle, échéancier et rattrapage, remboursement final, absence de double prélèvement sur les vols, API, puis lint/typecheck/build.

Les anciennes procédures de vente d'actifs après découvert restent en place ; cette modification ne refond pas les ventes forcées.
