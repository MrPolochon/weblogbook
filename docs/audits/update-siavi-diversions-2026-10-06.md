# Mise à jour connexion, Halloween, SIAVI et déroutement — 6 octobre 2026

## Connexion

La page utilise une disposition compacte adaptée à la hauteur disponible, avec deux colonnes sur ordinateur bas. Vérification visuelle sans défilement en 1280×720 et 390×844 ; le bouton Discord a également été vérifié sur ordinateur. Le clavier mobile, le zoom et les messages longs peuvent nécessiter le défilement pour conserver les contrôles accessibles. Le contenu n'est pas coupé avec overflow:hidden.

Le thème Halloween partage les surfaces sombres, accents orange et violet et contours sur les espaces du site. La connexion comporte un fond statique et une décoration Halloween, sans animation lourde.

La connexion directe par passkey est désactivée côté interface et API (410). La passkey existante peut toujours servir à la vérification après connexion par identifiant. Discord utilise l'identité OAuth vérifiée pour retrouver uniquement un compte déjà lié ; aucun compte n'est créé ou fusionné sur la base de l'email. Après connexion Discord, aucune vérification email ou passkey supplémentaire n'est demandée. Les contrôles OAuth, les comptes bannis, les droits et les sanctions existants restent appliqués.

## Audit et corrections SIAVI

- La prise de service choisissait automatiquement AFIS sans choix pompier : choix explicite Pompier ou Pompier + AFIS, avec changement en service.
- L'état AFIS pouvait rester incohérent après arrivée d'un ATC : avertissement sur la console et contrôle de disponibilité serveur avant prise d'un nouveau vol.
- Les vols proposés et la prise AFIS ne limitaient pas l'aéroport : filtrage départ/arrivée et contrôle serveur.
- Deux agents pouvaient prendre un vol simultanément : écriture conditionnelle avec conflit 409.
- La fin de service ignorait les erreurs de libération des vols : conservation du service et erreur visible si la libération échoue, y compris côté administrateur.
- Les vols ordinaires pouvaient être présentés comme mission MEDEVAC : restriction aux missions identifiées.
- La prise d'appel et la prime pompier étaient séparées : transaction SQL unique, verrouillage et nouvelle tentative sans double prime.
- Les erreurs de prise d'appel restaient silencieuses : notification explicite.
- La page privilégiait un grand bandeau et les statistiques : console opérationnelle, prise de service en premier, fonctions distinctes, effectif pompier, AFIS et flotte disponible, accès aux missions, rapports et procédures.

Le mode maintenance SIAVI déjà actif est conservé : la refonte reste visible aux administrateurs tant que ce mode n'est pas levé. L'audio réel et les parcours d'équipe nécessitent encore une validation en service. Les nouveaux contrôles AFIS sont des vérifications applicatives ; l'arrivée simultanée d'un ATC et d'une prise AFIS reste à surveiller pour une coordination entièrement transactionnelle des deux services.

## Déroutement

Seul le pilote propriétaire peut dérouter un plan accepté, en cours ou en autosurveillance, avant demande de clôture. La destination initiale est conservée. Le changement est atomique ; les anciennes STAR/routes et transferts sont effacés. Le segment suivant d'une mission MEDEVAC est ajusté lorsqu'il est encore planifié.

Les strips déroutés passent en orange et portent la mention DÉROUTÉ. Les alertes d'urgence gardent leur priorité visuelle.

À la clôture commerciale, avec ou sans contrôleur : recette effective divisée par deux ; taxes de la nouvelle destination multipliées par vingt ; salaire non plafonné au reliquat de recette. La compagnie finance le déficit, y compris un découvert. Les chèques pilote/copilote, la location, les prêts, l'alliance et le codeshare restent traités. Sans contrôleur, les taxes sont tout de même prélevées. Le règlement est une transaction verrouillée et mémorisée par plan pour éviter tout double débit ou double chèque.

Exemple sans bonus ni location : recette initiale 100 000 F$, recette déroutée 50 000 F$. Avec une taxe IFR de 2 %, taxes déroutées 20 000 F$. Salaire prévu 15 000 F$ : revenu compagnie 15 000 F$. Avec une taxe VFR de 5 %, les taxes sont 50 000 F$ et le déficit compagnie atteint 15 000 F$ pour garantir le salaire.

## Validation

32 tests automatisés réussis, TypeScript et lint ciblé sans erreur. Les migrations déroutement et SIAVI sont appliquées. Deux tests PostgreSQL annulés par ROLLBACK ont validé le déficit, l'absence de doubles paiements et la prise d'appel avec prime idempotente. Aucun mouvement financier issu des tests n'est conservé. La compilation finale est en cours.

Résultat final : compilation complète réussie avec les variables Supabase fictives locales. Le test déroutement a également validé le salaire et le débit avec une trésorerie compagnie initialement nulle, sans conserver ce scénario en base.

Le test PostgreSQL de cinq règlements positifs a également réussi avec les répartitions existantes. Les clôtures automatiques et les déconnexions ATC prennent en compte le déroutement. Une clôture concurrente est refusée si la destination vient de changer.
