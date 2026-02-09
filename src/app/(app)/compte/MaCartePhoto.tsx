'use client';

import { useState, useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import CarteIdentite from '@/components/CarteIdentite';

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
  initialCarte: CarteData | null;
  identifiant: string;
};

export default function MaCartePhoto({ initialCarte, identifiant }: Props) {
  const [carte, setCarte] = useState<CarteData | null>(initialCarte);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/cartes/ma-photo', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'upload');
      }

      // Mettre à jour la carte locale
      setCarte(prev => prev 
        ? { ...prev, photo_url: data.url }
        : {
            couleur_fond: '#DC2626',
            logo_url: null,
            photo_url: data.url,
            titre: 'IFSA',
            sous_titre: null,
            nom_affiche: null,
            organisation: null,
            numero_carte: null,
            date_delivrance: null,
            date_expiration: null,
            cases_haut: [],
            cases_bas: [],
          }
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <CarteIdentite carte={carte} identifiant={identifiant} size="md" />
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors text-sm disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Upload en cours...
          </>
        ) : (
          <>
            <Camera className="h-4 w-4" />
            Changer ma photo
          </>
        )}
      </button>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
      {success && (
        <p className="text-emerald-400 text-sm">Photo mise à jour !</p>
      )}
    </div>
  );
}
