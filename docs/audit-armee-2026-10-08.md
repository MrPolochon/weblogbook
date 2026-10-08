# Audit de l’espace Armée — 8 octobre 2026

## Périmètre et limites

Revue statique du dépôt : pages `/militaire`, carnet, missions, permissions, API Armée, validation et paiements, statistiques, migrations SQL. Les constats ci-dessous sont fondés sur le code, pas sur une reproduction en production. Les politiques réellement déployées, les soldes et la livraison des migrations n’ont pas été vérifiés. Aucun paiement ni vol de test n’a été créé. Les autres modifications présentes dans le dépôt ne constituent pas des corrections issues de cet audit.

P1 = correction prioritaire avant d’étendre les missions rémunérées. P2 = fiabilité et expérience utilisateur. Les suggestions fonctionnelles sont séparées des défauts constatés.

## P1 — Paiement et validation non atomiques

Sources : `src/lib/armee/vol-service.ts:456`, notamment 470 et 498–515 ; `src/app/api/armee/vols/[id]/route.ts:65`.

Le crédit bancaire, la transaction Felitz, le journal de mission puis le statut du vol sont quatre écritures séparées. Les trois premières erreurs ne sont pas contrôlées. Un crédit réussi suivi d’un échec d’enregistrement du vol peut être payé à nouveau au prochain essai. Inversement, un crédit refusé peut aboutir à un vol marqué payé. Deux validations simultanées peuvent lire toutes deux une récompense encore vide et créditer deux fois. Le journal de missions ne possède pas de référence unique au vol dans les migrations consultées.

Correction : une fonction SQL transactionnelle verrouillant le vol, contrôlant son état, créditant le compte et enregistrant l’historique et le journal ensemble. Ajouter `vol_id` unique au journal pour garantir un seul paiement par vol. Vérification attendue : deux validations concurrentes = un crédit ; échec injecté = aucune écriture partielle.

## P1 — Délai entre missions contournable et attribution incohérente

Sources : `src/lib/armee/vol-service.ts:86`, 214, 252 et 515.

Le délai est contrôlé uniquement dans le journal des missions déjà validées. Il est donc possible de déposer plusieurs fois la même mission avant la première validation. De plus, le contrôle de délai et de grade porte sur l’auteur du dépôt, alors que le journal et la progression sont attribués au pilote enregistré. Dans les missions actuelles, les formations escadrille/escadron forcent généralement l’auteur comme pilote ; cette différence doit être supprimée avant d’introduire des missions à deux pilotes.

Correction : interdire plusieurs dossiers ouverts pour la même mission et le même bénéficiaire, sous contrainte ou verrou en base ; vérifier le délai à la validation ; définir explicitement le bénéficiaire de la progression et l’utiliser partout. Test : deux dépôts simultanés d’une même mission ne créent pas deux dossiers ouverts.

## P1 — Modification d’équipage moins contrôlée que la création

Sources : `src/lib/armee/vol-service.ts:76`, 244–270 et 421–433 ; `src/app/api/armee/vols/[id]/route.ts:28`.

À la création, les membres sont vérifiés comme militaires et pilote/copilote ne peuvent pas être identiques. À la modification, les identifiants du copilote, du chef et de l’équipage sont acceptés sans ces contrôles. L’API de modification ne recharge que le rôle administrateur : elle ne revérifie ni l’habilitation Armée ni le blocage de l’auteur. Un ancien militaire ou un utilisateur bloqué, encore propriétaire d’un dossier en attente, conserve ainsi cette possibilité.

Correction : appliquer les mêmes contrôles à la création et à la modification, vérifier les membres et empêcher l’attribution arbitraire du rôle de chef. Remplacer l’équipage dans une transaction : le code supprime actuellement l’ancien avant l’insertion du nouveau, sans vérifier les erreurs. Tests : membre civil refusé, pilote identique au copilote refusé, auteur bloqué refusé, ancien équipage conservé si l’insertion échoue.

## P2 — La prime dépend de l’attente administrative

Source : `src/lib/armee/rewards.ts:8`.

La récompense perd 1 % par minute entre l’arrivée déclarée et la validation administrative, avec un minimum de 20 %. Un dossier validé 80 minutes après l’arrivée reçoit donc seulement 20 % de sa base, même si le pilote a terminé à l’heure. Il s’agit d’une règle explicite du code, mais elle pénalise la disponibilité du validateur et mérite une décision produit.

Proposition : calculer la ponctualité au dépôt ou à la clôture effective, puis figer la prime proposée avant la validation. Afficher séparément base, ponctualité, bonus et destinataire du versement : actuellement la récompense va au compte Armée, tandis que les statistiques personnelles parlent de Felitz gagnés.

## P2 — Missions affichées disponibles lorsque la vérification échoue

Source : `src/app/(app)/militaire/components/MissionsTab.tsx:26`, 36 et 71.

Le catalogue statique est affiché dès le départ. Sans réponse valide de l’API, le grade et le délai restent inconnus mais les boutons restent proposés comme disponibles. Le serveur bloque ensuite certains dépôts : l’utilisateur découvre tardivement le problème. Aucun bouton de nouvelle tentative n’est proposé. Les délais chargés ne se mettent pas à jour pendant que la page reste ouverte.

Correction : état « vérification en cours », état d’erreur visible avec nouvelle tentative, puis disponibilité confirmée. Actualiser au retour sur la page et à l’expiration d’un délai.

## P2 — Statistiques potentiellement tronquées et erreurs silencieuses

Sources : `src/lib/armee/stats.ts:33`, 60 et 82 ; `src/app/(app)/militaire/page.tsx:44`.

Plusieurs listes sont chargées sans pagination ni agrégation SQL. Si elles dépassent la limite de lignes configurée dans Supabase, les heures, récompenses et classements sont calculés sur un historique incomplet. Ce seuil n’a pas été vérifié en production. Les erreurs sont souvent transformées en listes vides ou en compteurs zéro. Le taux de réussite inclut les missions en attente dans le dénominateur, ce qui diminue le pourcentage avant qu’une décision soit prise.

Correction : agrégations SQL pour les compteurs et les classements, pagination du carnet, erreur explicite plutôt qu’un faux zéro. Calculer le taux sur les dossiers décidés et afficher les dossiers ouverts à part. Test : historique dépassant la limite API et erreur base simulée.

## P2 — Validation des formulaires et lisibilité mobile

Sources : `src/lib/armee/vol-service.ts:189`, 367 ; `src/app/(app)/militaire/MilitaireClient.tsx:78`, 86 et 132.

Les durées ne sont pas systématiquement vérifiées comme entiers finis avec une borne maximale. La création utilise `parseInt`, qui accepte par exemple un texte commençant par des chiffres suivi de caractères. Sur petit écran, les intitulés des actions et des onglets disparaissent au profit d’icônes sans libellé accessible explicite.

Correction : schéma commun de validation serveur, durée entière bornée, chaînes limitées et valeurs d’énumération contrôlées. Conserver des libellés courts sur mobile et nommer toutes les actions pour les lecteurs d’écran.

## Ce qui est déjà bien posé

- Accès au hub réservé au rôle Armée ou aux administrateurs.
- Dépôt interdit aux profils bloqués.
- Validation réservée au PDG militaire ou aux administrateurs.
- Avions détruits et types non militaires refusés lors de la résolution de l’appareil.
- Rapport après action limité aux acteurs du vol, avec notes et catégories bornées.
- Index dédiés aux recherches de délai ; migrations présentes pour isoler les tables Armée des accès clients. Leur application effective reste à vérifier.

## Évolutions proposées après les corrections

1. Tableau opérationnel : missions en cours, à valider, refusées et terminées ; actions directes du commandement.
2. Flotte dédiée : appareil, disponibilité, dernière mission, destruction et historique. La page actuelle expose surtout un compteur d’appareils actifs.
3. Briefing structuré : objectif, participants, appareil, route, consignes et compte rendu après mission.
4. Progression transparente : grade, prochaines conditions, récompense expliquée et distinction trésorerie Armée / prime personnelle.
5. Journal du commandement : auteur et date de chaque validation, refus et modification d’équipage.

Ordre recommandé : fiabiliser les paiements, les missions et les droits ; ensuite les statistiques et les états d’erreur ; enfin la refonte opérationnelle et mobile.
