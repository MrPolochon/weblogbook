# RER MI09 pour Blender

Le fichier `livraison/RER_MI09.blend` contient une rame à cinq voitures, une scène de présentation et une animation des portes.

Ouvrez le fichier dans Blender 4.5 ou plus récent. Dans la timeline, l'image 1 présente les portes fermées, l'image 65 les portes ouvertes et l'image 150 les portes refermées. Les objets `PORTE_…` sont les pivots des vantaux.

Le fichier `livraison/RER_MI09_final.glb` permet d'importer la géométrie dans un autre logiciel. Ses portes sont séparées et fermées ; l'animation est conservée dans le fichier Blender uniquement. La présentation (sol, rails, lumières, caméra) est exclue du GLB.

Ce modèle est une interprétation détaillée inspirée du MI09, pas une reproduction certifiée ou une maquette issue de plans industriels. Les dimensions de détail, la cabine et l'aménagement sont approximatifs. Les matériaux sont procéduraux, sans textures photographiques ni logos officiels. Le modèle ne comprend pas les scripts de conduite et de portes Roblox ; ces scripts doivent être raccordés à la nouvelle géométrie. Une version optimisée et des collisions adaptées sont nécessaires pour un grand jeu Roblox.

Référence de configuration : [Alstom, MI09, cinq voitures et trois portes par voiture](https://www.alstom.com/press-releases-news/2012/7/the-alstom-bombardier-consortium-will-supply-70-duplex-trainsets-for-the-rer-a-line-in-paris).

Le générateur `creer_rer_mi09.py` est également fourni pour modifier et reconstruire le modèle depuis l'espace Scripting de Blender. Il crée une scène dédiée.
