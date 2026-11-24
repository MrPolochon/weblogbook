# VHF Radio Android

Version 1.2.0 beta 1, Android 8 ou plus récent. Le téléphone rejoint les mêmes fréquences Cloudflare que le site et l'application Windows.

## Utilisation

1. Installer l'APK depuis la release `android-v1.2.0-beta.1` du dépôt. Cette version de test utilise une signature Android de développement et un identifiant `.beta` séparé. Une future mise à jour pourra nécessiter sa désinstallation.
2. Se connecter avec les identifiants WebLogbook. En pilote sans plan actif, la radio reste en OBS. En ATC/AFIS, prendre une position sur le site.
3. Régler la fréquence en attente, puis « Basculer et connecter ». Les molettes et la saisie ne modifient que la présélection. Les 3 040 canaux de 118.000 à 136.990 sont disponibles sans annuaire imposé.
4. Choisir PTT et autoriser le microphone. Puis « Afficher la bulle sur Roblox » et autoriser l'affichage par-dessus les autres applications. Activer le mode PTT avant de quitter l'écran de la radio.
5. Ouvrir Roblox. Maintenir le bouton de la bulle pour émettre ; relâcher pour couper. Déplacer la bulle par sa fréquence. « Réduire » la replie. « Couper le micro » est disponible dans la bulle et la notification.
6. OFF coupe la radio et arrête les tentatives de reconnexion. Une perte réseau coupe toujours le micro ; il faut réactiver PTT ou micro ouvert après reconnexion. Verrouiller l'écran coupe aussi le micro. Fermer l'application depuis les applications récentes arrête la radio.

Le mode micro ouvert transmet toutes les paroles, même en arrière-plan. Utiliser un casque. Discord cockpit doit de préférence fonctionner sur un autre appareil : les systèmes mobiles limitent le partage du microphone entre deux applications d'appel. Cette application ne modifie pas Discord et ne promet pas de contourner ces restrictions.

## Cycle de vie et confidentialité

Le service Android possède la connexion et les jetons en mémoire. Une rotation ou une recréation de l'Activity ne détruit pas une radio déjà démarrée. Aucun jeton ni mot de passe n'est enregistré sur disque. Le service ne se redémarre pas automatiquement après un arrêt du processus.

L'écoute démarre avec le type `mediaPlayback`. La capture n'est créée qu'après un choix PTT/micro ouvert dans l'Activity visible, l'accord de permission et la promotion du service en `microphone`. Les réponses signées serveur et le message `hello.canPublish` doivent tous les deux autoriser la publication ; OBS ne crée aucune piste locale. Une annulation tactile, la perte réseau, OFF, un verrouillage ou la déconnexion remettent le micro au repos. Les effets radio sont générés localement et ne sont pas envoyés au SFU.

## Validation

`gradle testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest` compile l'APK et vérifie les contrôles d'émission, les fréquences et les reconnexions. `gradle connectedDebugAndroidTest` vérifie le démarrage/recréation de l'Activity, le service et le refus d'émission sans droits sur émulateur Android 15. Le workflow publie l'APK bêta seulement après ces contrôles.

Les tests automatisés ne remplacent pas cette recette sur téléphone : pilote et contrôleur sur deux appareils, parole dans les deux sens, casque Bluetooth/USB, PTT depuis Roblox, relâchement et annulation, OBS, refus de permission, rotation, réseau coupé puis restauré, verrouillage et OFF. La latence et la coexistence avec les autres applications audio doivent être mesurées sur le téléphone utilisé.
