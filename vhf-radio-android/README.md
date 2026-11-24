# VHF Radio Android

Version 1.2.0 beta 4, Android 8 ou plus récent. Le téléphone rejoint les mêmes fréquences Cloudflare que le site et l'application Windows.

Cette version ajoute le placement libre et mémorisé de la bulle PTT et une amplification réglable de la réception. Elle se met à jour directement depuis la bêta 3 avec la même signature permanente. Seules les anciennes bêtas 1 et 2 demandent une dernière désinstallation.

## Utilisation

1. Depuis la bêta 3, utiliser « Mettre à jour », puis « Installer la mise à jour ». Pour une première installation, prendre l'APK signé de la release `android-v1.2.0-beta.4`. Éteindre la radio avec OFF avant l'installation. Android peut demander l'autorisation d'installer depuis VHF Radio, puis une confirmation. La recherche et le téléchargement ne coupent pas la radio.
2. Se connecter avec les identifiants WebLogbook. En pilote sans plan actif, la radio reste en OBS. En ATC/AFIS, prendre une position sur le site.
3. Régler la fréquence en attente, puis « Basculer et connecter ». Les molettes et la saisie ne modifient que la présélection. Les 3 040 canaux de 118.000 à 136.990 sont disponibles sans annuaire imposé.
4. Choisir PTT et autoriser le microphone. Puis « Afficher la bulle sur Roblox » et autoriser l'affichage par-dessus les autres applications. Activer le mode PTT avant de quitter l'écran de la radio.
5. Ouvrir Roblox. Maintenir le bouton de la bulle pour émettre ; relâcher pour couper. Faire glisser la poignée « Déplacer » ou la bulle réduite pour choisir librement son emplacement. Les boutons « PTT à gauche / à droite » proposent un placement rapide. Les positions portrait et paysage sont mémorisées séparément sur le téléphone, y compris après une mise à jour. « Réduire » replie la bulle. « Couper le micro » est disponible dans la bulle et la notification.
6. OFF coupe la radio et arrête les tentatives de reconnexion. Une perte réseau coupe toujours le micro ; il faut réactiver PTT ou micro ouvert après reconnexion. Verrouiller l'écran coupe aussi le micro. Fermer l'application depuis les applications récentes arrête la radio.

Le mode micro ouvert transmet toutes les paroles, même en arrière-plan. Utiliser un casque. Discord cockpit doit de préférence fonctionner sur un autre appareil : les systèmes mobiles limitent le partage du microphone entre deux applications d'appel. Cette application ne modifie pas Discord et ne promet pas de contourner ces restrictions.

Sur Android 12 et plus, « Choisir la sortie audio » permet de sélectionner le haut-parleur, l'écouteur ou un casque reconnu par Android. Un changement de sortie ou le retrait du casque coupe le micro : réactiver PTT ensuite.

Le volume de réception est réglé à 200 % par défaut et peut aller de 0 à 300 %. Au-dessus de 100 %, le gain WebRTC amplifie les voix ; réduire le réglage si une source forte sature. Le grésillement conserve un gain maximal de 100 %. Ce réglage est mémorisé et appliqué aussi aux nouveaux participants et aux reconnexions. Il ne modifie ni le microphone émis, ni le volume global des autres applications. Sur l'écran radio, les touches du téléphone règlent le volume de communication.

## Cycle de vie et confidentialité

Le service Android possède la connexion et les jetons en mémoire. Une rotation ou une recréation de l'Activity ne détruit pas une radio déjà démarrée. Aucun jeton ni mot de passe n'est enregistré sur disque. Le service ne se redémarre pas automatiquement après un arrêt du processus.

L'écoute démarre avec le type `mediaPlayback`. La capture n'est créée qu'après un choix PTT/micro ouvert dans l'Activity visible, l'accord de permission et la promotion du service en `microphone`. Les réponses signées serveur et le message `hello.canPublish` doivent tous les deux autoriser la publication ; OBS ne crée aucune piste locale. Une annulation tactile, la perte réseau, OFF, un verrouillage ou la déconnexion remettent le micro au repos. Les effets radio sont générés localement et ne sont pas envoyés au SFU.

## Validation

`gradle testDebugUnitTest lintDebug lintRelease assembleDebug assembleDebugAndroidTest assembleRelease` vérifie les contrôles radio, les métadonnées de mise à jour et le téléchargement borné avec empreinte SHA-256. `gradle connectedDebugAndroidTest` vérifie le cycle de vie et le partage privé de l'APK sur Android 15. Le workflow installe ensuite une version de test supérieure avec `adb install -r` et vérifie la conservation d'une donnée locale avant de publier.

## Publication et signature

Le secret GitHub Actions `ANDROID_SIGNING_BUNDLE` est un JSON privé contenant `keystoreBase64` (PKCS#12), `password` et `alias`. Il est restauré uniquement pour les publications depuis `main`, jamais dans les pull requests. L'empreinte publique du certificat attendu est conservée dans `signing-certificate.sha256`. Une publication sans secret, avec une autre signature ou avec un APK débogable échoue. Sauvegarder durablement le keystore et son mot de passe en lieu sûr ; ne jamais les ajouter au dépôt ni aux artefacts.

Chaque version doit augmenter `versionCode` et `versionName` dans `app/build.gradle.kts`. `scripts/release.py` génère le manifeste depuis l'APK signé et `scripts/publish.py` publie d'abord la release versionnée, puis avance le manifeste de `android-channel-beta`. Les releases Windows restent indépendantes. Les APK publiés sont immuables ; un nouvel APK exige un nouveau numéro de version. Mettre à jour `RELEASE_NOTES.md` et le bouton du site après publication.

L'application interroge ce manifeste public à l'ouverture, sans jeton de compte, et propose aussi une vérification manuelle. Elle refuse les URL hors de la release Android attendue, les APK tronqués ou altérés, les autres identifiants d'application, les versions inférieures et les signatures différentes. Aucun fichier ne quitte le cache privé sauf l'APK partagé temporairement avec l'installateur Android.

La distribution directe utilise `REQUEST_INSTALL_PACKAGES`. Pour une future publication Play Store, créer une variante sans cette permission et sans cet installateur externe, et utiliser les mises à jour Google Play. Les builds `debug` portent le suffixe `.dev` et ne sont pas distribués ; la bêta signée reste `com.weblogbook.vhfradio.beta`.

Les tests automatisés ne remplacent pas cette recette sur téléphone : pilote et contrôleur sur deux appareils, parole dans les deux sens, casque Bluetooth/USB, PTT depuis Roblox, relâchement et annulation, OBS, refus de permission, rotation, réseau coupé puis restauré, verrouillage et OFF. La latence et la coexistence avec les autres applications audio doivent être mesurées sur le téléphone utilisé.
