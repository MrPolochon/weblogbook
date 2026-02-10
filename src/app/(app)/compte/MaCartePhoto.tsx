'use client';

import { useState, useRef } from 'react';
import { Camera, Loader2, Sparkles } from 'lucide-react';
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
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/cartes/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.data) {
        setCarte(data.data);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (e) {
      setError('Erreur lors de la génération');
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }

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
    <div className="flex flex-col gap-2">
      <CarteIdentite carte={carte} identifiant={identifiant} size="md" />
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex gap-2">
        {!carte && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-xs disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Générer ma carte
              </>
            )}
          </button>
        )}
        
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors text-xs disabled:opacity-50 ${!carte ? 'flex-1' : 'w-full'}`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Upload...
            </>
          ) : (
            <>
              <Camera className="h-3 w-3" />
              Changer ma photo
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-xs text-center">{error}</p>
      )}
      {success && (
        <p className="text-emerald-400 text-xs text-center">Carte mise à jour !</p>
      )}
    </div>
  );
}
