'use client';

import { useState } from 'react';
import { Edit } from 'lucide-react';
import CarteIdentite from '@/components/CarteIdentite';
import CarteIdentiteEditor from '@/components/CarteIdentiteEditor';

type CarteData = {
  couleur_fond: string;
  logo_url: string | null;
  photo_url: string | null;
  titre: string;
  sous_titre: string | null;
  nom_affiche: string | null;
  organisation: string | null;
  numero_carte: string | null;
  date_delivrance: string | null;
  date_expiration: string | null;
  cases_haut: string[];
  cases_bas: string[];
};

type Props = {
  userId: string;
  identifiant: string;
  initialCarte: CarteData | null;
};

export default function PiloteCarteSection({ userId, identifiant, initialCarte }: Props) {
  const [carte, setCarte] = useState<CarteData | null>(initialCarte);
  const [showEditor, setShowEditor] = useState(false);

  async function handleSave() {
    // Recharger la carte après sauvegarde
    const res = await fetch(`/api/cartes?user_id=${userId}`);
    const data = await res.json();
    if (data.data) {
      setCarte(data.data);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">Carte d&apos;identité</h2>
        <button
          onClick={() => setShowEditor(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
        >
          <Edit className="h-4 w-4" />
          Modifier
        </button>
      </div>

      <div className="flex justify-center">
        <CarteIdentite carte={carte} identifiant={identifiant} size="sm" />
      </div>

      {showEditor && (
        <CarteIdentiteEditor
          userId={userId}
          identifiant={identifiant}
          initialData={carte}
          onClose={() => setShowEditor(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
