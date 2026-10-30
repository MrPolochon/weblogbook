# Règlement économique version 2

L’activation est exclusivement déterminée par `economy_release_settings.enabled`.
Elle n’est pas effectuée par la migration. Les plans existants et les devis déjà
tirés dans la journée restent en version 1. Un plan version 2 déjà déposé peut
toujours être réglé si l’activation est ensuite suspendue.

Le devis journalier conserve le chargement et les tarifs du premier tirage. Les
montants, effets de développement, contrats de location/alliance/codeshare,
consommation RP et durée de référence sont figés côté serveur. La durée saisie par
le pilote reste opérationnelle et ne permet pas de réduire la facture de carburant.
La référence économique est affichée avant confirmation du dépôt.

Les tarifs sont conservés au centime ; recettes, salaires, factures et soldes sont
réglés en F$ entiers. Le prix historique du plan reste arrondi pour respecter une
vue existante ; le tarif exact se trouve dans le devis et dans `economy_snapshot`.

La ligne **aide de transition** est déterminée une fois au devis à partir du
carburant standard type/route et des tarifs initiaux de la compagnie/liaison. Elle
est plafonnée à un quart de la recette commerciale et n’augmente pas pour compenser
un choc de carburant, un résultat négatif ou un déroutement. Une recette nulle ne
génère aucune aide. Les références normales testées restent proches de l’ancien
résultat ; cette cible ne garantit pas le bénéfice des configurations défavorables.

La première demande de clôture éligible fixe l’arrivée : cinq minutes de franchise,
puis 0,5 point de décote par minute, plafonnés à 15 %. Le fret express/périssable
reçoit en plus 1 point/minute, plafonné à 25 %, sur sa seule part de recette.
L’arrivée en avance n’est pas pénalisée. Une tentative trop précoce peut être
annulée puis renouvelée ; une première demande valide ne peut plus être décalée.

Le déroutement divise la recette par deux et multiplie les taxes d’arrivée par
vingt. Le taux staff IFR/VFR est celui de l’aéroport d’arrivée effectif, y compris
zéro. Le multiplicateur fiscal de l’aléa est figé dans le devis. Les taux ne sont
pas changés dans la configuration staff.

Le salaire convenu est garanti, avec répartition équipage 50/50 à l’unité près.
La compagnie peut financer une perte et passer à découvert. Le règlement crédite
directement Felitz Bank, sans créer de chèques à encaisser. Recette, carburant,
taxes, salaires, contrats, prêt, usure, clôture et avis sont réunis dans une seule
transaction idempotente ; chaque mouvement de solde possède sa ligne comptable.
Les services au sol ne produisent pas une seconde facture de consommation.

Une clôture administrative version 2 règle aussi le vol et son amende séparée une
seule fois. Une annulation administrative de vol non effectué ou trop ancien
libère le stock, sans règlement de vol. Un vol déjà réglé ne peut plus être annulé,
rouvert ou supprimé. Un verrou transactionnel commun sérialise les règlements v2
afin d’éviter les interblocages de contrats croisés.

Les tests PostgreSQL intégrés couvrent atomicité, répétition, perte, salaires,
contrats figés, taxes nulles et aléas, conservation legacy et reprise de clôture.
Ils utilisent une base locale ; la validation sur copie du schéma réellement
déployé complète les fixtures et reste nécessaire avant la publication.
