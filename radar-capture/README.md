# Radar Capture — WebLogbook

Outil de capture ecran pour alimenter le radar ATC en positions avions reelles depuis la minimap PTFS.

## Installation

```bash
pip install -r requirements.txt
```

## Utilisation

```bash
python main.py
```

### Etapes :

1. **Renseignez** l'URL du serveur et le token API (genere depuis "Mon compte" sur le site)
2. **Selectionnez la zone** : cliquez "Selectionner zone" puis dessinez un rectangle autour de la minimap PTFS
3. **Calibrez** : cliquez "Calibrer", puis cliquez sur 3 aeroports connus sur la minimap et entrez leur code OACI
4. **Demarrez** la capture : l'outil detecte les points rouges toutes les 2 secondes et les envoie au serveur

## Creer un .exe

```bash
pyinstaller --onefile --windowed --name RadarCapture main.py
```

Le `.exe` sera dans le dossier `dist/`.

## Configuration

Le fichier `config.json` sauvegarde :
- URL du serveur et token API
- Zone de capture ecran
- Points de calibration
- Parametres de detection (teinte rouge, seuils)
