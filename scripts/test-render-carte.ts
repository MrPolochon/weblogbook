import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderCartePng } from '../src/lib/cartes/render-carte-png';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const mockCarte = {
  couleur_fond: '#1E3A8A',
  logo_url: null,
  photo_url: null,
  titre: "Carte d'identification de membre d'equipage",
  sous_titre: "delivre par l'instance de l'IFSA",
  nom_affiche: 'DUPONT JEAN',
  organisation: 'IFSA',
  numero_carte: '123 45 678901',
  date_delivrance: '2024-01-15',
  date_expiration: '2026-01-15',
  cases_haut: ['PPL', 'IR'],
  cases_bas: ['A', 'B', 'C'],
};

async function main() {
  const buf = await renderCartePng(mockCarte, {
    identifiant: 'JDUPONT',
    discordUsername: 'pilote#1234',
  });

  if (!buf) {
    console.error('renderCartePng returned null');
    process.exit(1);
  }

  const out = path.join(root, 'test-carte-render.png');
  fs.writeFileSync(out, buf);
  console.log('OK:', out, buf.length, 'bytes');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
