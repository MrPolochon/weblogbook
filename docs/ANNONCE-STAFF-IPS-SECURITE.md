# Nouveautés sur la page Sécurité (consultation des adresses de connexion)

**Pour toute l’équipe admin**

Ce document regroupe **tous les changements** faits sur la page Sécurité et l’accès aux adresses de connexion **depuis le début de ce chantier**.  

Pas besoin de connaître l’informatique : voici ce qui change pour vous, en mots simples.

---

## Liste de tous les changements

Tout ce qui a été mis en place ou modifié apparaît ci-dessous. Les sections suivantes détaillent chaque point.

**Codes par mail et enregistrement des adresses**

1. **Envoi de codes par email** — Quand vous vous connectez au site depuis une **nouvelle adresse** (ou la première fois), un code à 6 chiffres est envoyé à **votre adresse mail**. Vous devez le saisir pour terminer la connexion. Pareil pour demander l’accès à la page Sécurité : après le mot de passe, un code est envoyé à votre mail.
2. **Enregistrement des adresses de connexion** — À chaque connexion, l’**adresse depuis laquelle vous vous connectez** est enregistrée. Si c’est la même qu’avant, pas de code par mail. Si c’est une **nouvelle** adresse, un code est envoyé à votre mail et la nouvelle adresse n’est enregistrée **qu’après** que vous ayez saisi le code. Ainsi on sait toujours depuis où chaque compte s’est connecté.
3. **Historique des changements d’adresse** — Chaque fois qu’un compte se connecte depuis une adresse **différente** (après validation du code par mail), c’est enregistré : date, heure (UTC), ancienne adresse, nouvelle adresse, type d’appareil. Cet historique est visible dans le détail de chaque compte sur la page Sécurité.

**Page Sécurité (consultation des adresses)**

4. **Validation à deux admins** — Peu importe qui valide en premier, l’autre peut toujours entrer son code. Les codes restent affichés jusqu’à ce que les deux aient validé. Message « Vous avez validé. En attente de l’autre admin. » et bouton « Rafraîchir ». La page ne se termine qu’une fois l’accès donné ou refusé.
5. **Impossible de valider sa propre demande** — Le bouton « Participer à l’approbation » n’apparaît plus sur votre propre demande. Un autre admin doit participer pour valider avec vous.
6. **Liste des comptes cliquable** — En cliquant sur une ligne, vous voyez le détail du compte : adresse de connexion actuelle et historique complet des changements d’adresse (dates et heures en UTC).
7. **Couleurs pour les adresses identiques** — Les comptes qui ont la même « dernière adresse de connexion » sont colorés pareil (barre à gauche + fond), pour repérer d’un coup d’œil les partages d’adresse.

---

## 1. Codes par email et enregistrement des adresses de connexion

**À la connexion au site (identifiant + mot de passe) :**

- Le système enregistre **l’adresse depuis laquelle vous vous connectez** (c’est technique, on dit « adresse IP », pour nous c’est « l’adresse de connexion »).
- Si vous vous connectez depuis **la même adresse** que la dernière fois → pas de code par mail, vous entrez directement.
- Si vous vous connectez depuis une **nouvelle adresse** (autre lieu, autre box, autre téléphone, etc.) → un **code à 6 chiffres** est envoyé à **votre adresse mail**. Vous devez le saisir sur la page pour terminer la connexion. **C’est seulement après avoir saisi ce code** que la nouvelle adresse est enregistrée.
- Chaque fois qu’une **nouvelle** adresse est enregistrée (après validation du code), une ligne est ajoutée dans **l’historique** : date, heure (UTC), ancienne adresse, nouvelle adresse, type d’appareil (téléphone, ordinateur, etc.). Cet historique est visible sur la page Sécurité quand un admin consulte le détail d’un compte.

**Pour demander l’accès à la page Sécurité (consultation des adresses) :**

- Vous entrez le **mot de passe superadmin**, puis un **code à 6 chiffres** est envoyé à **votre adresse mail**. Vous le saisissez, puis un **autre admin** doit participer (validation à deux avec échange de codes) pour que l’accès soit donné.

**En bref :** les adresses mail servent à recevoir les codes de sécurité. Les adresses de connexion sont enregistrées à chaque connexion (et après validation du code si c’est une nouvelle adresse). Tout est tracé dans l’historique.

---

## 2. Quand deux admins doivent valider l’accès (page Sécurité)

**Comment ça marche maintenant :**

- **L’un de vous valide en premier, l’autre après** — peu importe l’ordre. Les deux peuvent toujours entrer leur code.
- **Les codes restent affichés** jusqu’à ce que vous ayez validé tous les deux. On ne les efface plus trop tôt.
- **Après avoir validé**, vous verrez le message : *« Vous avez validé. En attente de l’autre admin. »*  
  Vous n’avez plus rien à ressaisir. Utilisez le bouton **« Rafraîchir »** pour voir si l’autre a validé et si l’accès est ouvert.
- **Tant que les deux n’ont pas validé**, la page reste en attente. Elle ne se ferme qu’une fois l’accès **donné** ou **refusé** (par exemple si un code est faux).

---

## 3. On ne peut plus valider sa propre demande

**Avant :** on pouvait cliquer sur « Participer à l’approbation » même pour sa propre demande.

**Maintenant :**

- Si **c’est vous** qui avez demandé l’accès, vous ne verrez **pas** le bouton « Participer à l’approbation » sur votre demande.
- À la place, il est écrit : *« C’est votre demande — un autre admin doit participer »*.
- **Il faut qu’un autre admin** ouvre la page, clique sur « Participer à l’approbation » pour cette demande, puis que vous échangiez vos codes comme d’habitude. Une seule personne ne peut plus faire tout seule.

---

## 4. Voir les infos d’un compte en cliquant dessus

**Ce que vous voyez :**

- Une **liste de tous les comptes** qui se sont connectés (nom d’utilisateur, rôle, dernière adresse de connexion, date de dernière connexion).
- **En cliquant sur une ligne**, vous ouvrez le **détail** de ce compte :
  - **L’adresse de connexion actuelle** (celle enregistrée après le dernier code reçu par mail).
  - **L’historique** : chaque fois que ce compte s’est connecté depuis une **autre** adresse (après avoir validé le code par mail), c’est noté avec la date, l’heure (en UTC), l’ancienne et la nouvelle adresse, et le type d’appareil (téléphone, ordinateur, etc.).
- Le bouton **« Retour à la liste »** vous ramène à la liste des comptes.

**En bref :** vous cliquez sur un compte → vous voyez son adresse actuelle et tout l’historique des changements d’adresse.

---

## 5. Repérer facilement les comptes qui partagent la même adresse

- Les comptes qui ont **exactement la même** « dernière adresse de connexion » sont **colorés pareil** (une barre de couleur à gauche de la ligne + fond légèrement coloré).
- Chaque groupe a une **couleur différente** (rouge, bleu, vert, etc.) pour ne pas les confondre.

**À quoi ça sert :** voir d’un coup d’œil si plusieurs comptes se connectent depuis le même endroit (même adresse = même couleur).

---

## En résumé

| Ce qui concerne | En simple |
|-----------------|-----------|
| **Codes par mail** | Connexion depuis une nouvelle adresse → code envoyé à votre mail. Demande d’accès page Sécurité → code envoyé à votre mail. Vous devez le saisir pour continuer. |
| **Enregistrement des adresses** | À chaque connexion, l’adresse est enregistrée. Si c’est une nouvelle adresse, elle n’est enregistrée qu’après que vous ayez saisi le code reçu par mail. |
| **Historique** | Chaque changement d’adresse (date, heure UTC, ancienne/nouvelle adresse, type d’appareil) est enregistré et visible dans le détail d’un compte sur la page Sécurité. |
| **Validation à deux** | Les deux admins peuvent valider dans n’importe quel ordre. Les codes restent affichés. Message : « Vous avez validé. En attente de l’autre admin. » |
| **Sa propre demande** | Vous ne pouvez plus « participer » à votre propre demande. Un autre admin doit le faire. |
| **Liste des comptes** | Cliquez sur une ligne → adresse actuelle du compte + tout l’historique des changements (dates et heures). |
| **Couleurs** | Même couleur = même adresse de connexion. Utile pour repérer les partages. |

---

**Des questions ou quelque chose qui ne fonctionne pas comme prévu ?** Dites-le à l’équipe technique.
