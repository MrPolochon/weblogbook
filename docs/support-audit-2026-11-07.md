# Audit PTFR Assistance — 7 novembre 2026

Source : export « Fetch Support Tickets in Creation Order », 100 tickets créés du 21 août au 11 octobre 2026 (UTC). Le champ conversation contient 2 238 tours ; 69 tickets disposent aussi d'un transcript structuré. Quatre conversations atteignent la limite de 100 tours : le transcript peut alors être plus complet. Les statuts waiting/staff ne permettent pas, seuls, de mesurer la résolution. Cet export ne démontre pas que tous les tickets de production sont inclus, notamment après le 11 octobre.

Les anciennes réponses et les messages du staff servent à identifier les échecs, pas à définir des règles produit. Les procédures actuelles du dépôt restent la référence. Aucun historique brut, identité, mot de passe ou donnée de compte n'est ajouté aux sources ou aux tests.

| Constat | Exemples de tickets | Réponse apportée |
| --- | --- | --- |
| Recrutement envoyé vers des onglets inexistants | t0ee, l5y1 | Réponse serveur avec le vrai Discord entreprises, sans génération de menus. Les cas de licence, de personnel et de plan restent contextualisés. |
| CAT pilote confondue avec ATC Delivery ou instruction ATC | r93w, xetc | Consigne explicite de séparation des parcours ; aucun remplacement automatique d'une catégorie par CAT 3. |
| QCM corrigé/assigné pris pour une validation, voire pour une autre catégorie | bpds, z99v | Interdiction d'inférer une licence, une réussite ou une progression d'un autre QCM. |
| Boutons de report, assignation ou pratique inventés | 8drt, bpds, pfeg | Exemples interdits dans les consignes ; un créneau concret passe à un humain, conformément à la politique existante. |
| Demande naturelle d'humain non reconnue, notamment « pas avec un bote » | u801, 9kpt | Détection déterministe élargie, sans appel au modèle ; conservation des négations et hypothèses. |
| Incompréhension courte ignorée ou procédure entière répétée | g4ux, u801, n459 | Reconnaissance des formulations fautives courantes ; une prochaine action à la fois dans les consignes. |
| Réponses numériques au menu ignorées | Vérification du gestionnaire actuel | Les choix 1 à 4 sont reconnus uniquement après le menu du bot et orientent la recherche vers le bon sujet. |
| Clarification répétée sans issue | Vérification du gestionnaire actuel | Après les explications puis les choix concrets, une troisième réponse vague transmet le ticket au staff ; les relances ne multiplient pas les alertes. |
| Livret public présenté comme réservé aux comptes connectés | vysq | Réponse serveur vers /livret-progression sans connexion. |
| Partenariat envoyé vers un autre salon inventé | 9kpt | Consigne : recueillir les informations manquantes dans le ticket actuel, puis transmettre au staff. |
| Conseil de tribunal RP pour une question hors jeu | 2p1r | Clarifier le contexte ; ne pas inventer de démarche administrative réelle. |

## Protections déjà présentes

Le code actuel possède déjà des garde-fous pour les propositions de clôture, la reprise par le staff, la déduplication des alertes, l'isolation des dossiers et la recherche documentaire. Ils ne sont pas présentés comme de nouvelles corrections. Six conversations anciennes contiennent « C'est résolu ? » dans la prose du bot ; huit annoncent un échec de génération. Ces détections textuelles ne constituent pas des taux de panne ni de satisfaction.

## Validation

Tests sans réseau : demandes humaines avec négations et hypothèses, passage par le vrai gestionnaire HTTP, absence d'appel LLM pour les réponses fixes, messages d'incompréhension, recrutement et accès public au livret. Aucun compte réel ni ticket de production n'est modifié par les tests. Les améliorations de consignes sur les parcours restent probabilistes : ces tests ne garantissent pas les futures réponses d'un fournisseur LLM.

La suite support et archivage compte 64 tests réussis après la seconde passe, dont les parcours numériques, la sortie des clarifications en boucle et le refus de proposer une fermeture pendant une question de diagnostic. Le commit ne peut pas être créé dans cet environnement : l'écriture de `.git/index.lock` est refusée. Aucun déploiement n'est donc revendiqué.
