# Plan iPhone et iPad — à reprendre

Décision conservée à la demande de l'utilisateur le 23 novembre 2026 (Tahiti). L'implémentation iOS n'est pas commencée. Priorité actuelle : Android, placement du PTT, volume et validation des mises à jour.

## Architecture proposée

- Application native Swift/SwiftUI avec WebRTC pour rejoindre les mêmes fréquences Cloudflare SFU/TURN que le site, Android et Windows.
- Framework Apple PushToTalk pour l'émission/réception en arrière-plan et les commandes système. Ne pas promettre une bulle arbitraire au-dessus de Roblox identique à Android.
- APNs PushToTalk pour réveiller l'application. Ajouter au serveur les abonnements iOS persistants, les jetons temporaires par canal et un signal explicite début/fin d'émission sur les clients. Aujourd'hui la présence dépend du WebSocket et le microphone se coupe localement : cela ne suffit pas à réveiller iOS.
- Valider l'envoi APNs HTTP/2 depuis l'infrastructure choisie. Cloudflare conserve le transport radio ; ne pas présumer que la chaîne de notifications est déjà opérationnelle.

## Premier jalon, avant de développer toute l'interface

Prototype sur de vrais iPhones : échanges avec Android et Windows, Roblox ouvert, écran verrouillé, inactivité prolongée, changement réseau et casque, appel entrant. Mesurer le temps de réveil, la connexion et la restitution des premières syllabes. APNs et le SFU ne garantissent pas à eux seuls la conservation des premiers mots ; si nécessaire, concevoir une solution de mise en attente ou de tampon audio, puis la mesurer.

## Fonctions ensuite

COM active/présélection et bascule, OBS sans plan actif, droits ATC, volume, OFF qui arrête les tentatives, PTT natif. Valider séparément le micro ouvert. Respecter les sons système imposés par Apple aux transitions PTT ; un effet radio reçu ne doit pas les remplacer. Ne pas promettre le partage du microphone avec Discord sur le même iPhone : privilégier un autre appareil pour le cockpit.

## Distribution

Apple Developer Program : 99 USD/an au tarif de référence, prix et disponibilité régionaux à confirmer au moment de l'inscription. TestFlight d'abord (mises à jour automatiques activables, expiration d'une build à 90 jours), App Store après essais. Compilations macOS via GitHub Actions standard gratuit pour ce dépôt public. Un compte développeur et des testeurs iPhone sont nécessaires ; aucun achat ni inscription n'a été effectué.

Sources officielles consultées :

- https://developer.apple.com/documentation/pushtotalk/creating-a-push-to-talk-app
- https://developer.apple.com/videos/play/wwdc2022/10117/
- https://developer.apple.com/help/account/membership/program-enrollment
- https://developer.apple.com/testflight/
- https://testflight.apple.com/
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
