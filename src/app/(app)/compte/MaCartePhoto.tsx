'use client';

import { useState, useRef } from 'react';
import { Camera, Loader2, Sparkles, Check } from 'lucide-react';
import { toast } from 'sonner';
import CarteIdentite from '@/components/CarteIdentite';
import MonLogoSelector from '@/components/MonLogoSelector';

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
  /** Si true (defaut), affiche le selecteur de logo sous la carte. */
  embedLogoSelector?: boolean;
};

export default function MaCartePhoto({ initialCarte, identifiant, embedLogoSelector = true }: Props) {
  const [carte, setCarte] = useState<CarteData | null>(initialCarte);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/cartes/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.data) {
        setCarte(data.data);
        toast.success('Carte générée avec succès');
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch {
      toast.error('Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
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

      setCarte((prev) =>
        prev
          ? { ...prev, photo_url: data.url }
          : {
              couleur_fond: '#1E3A8A',
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
      toast.success('Photo mise à jour');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleLogoChange(newLogoUrl: string | null) {
    setCarte((prev) => (prev ? { ...prev, logo_url: newLogoUrl } : prev));
  }

  return (
    <div className="flex flex-col gap-3 items-center md:items-stretch">
      <div className="flex justify-center">
        <CarteIdentite carte={carte} identifiant={identifiant} size="md" interactive />
      </div>

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
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.97] text-white rounded-lg transition-all text-sm font-medium disabled:opacity-50 shadow-md shadow-emerald-900/30"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Générer ma carte
              </>
            )}
          </button>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 active:scale-[0.97] text-slate-100 rounded-lg transition-all text-sm font-medium disabled:opacity-50 ${
            !carte ? 'flex-1' : 'w-full'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Upload...
            </>
          ) : (
            <>
              <Camera className="h-4 w-4" />
              {carte?.photo_url ? 'Changer ma photo' : 'Ajouter ma photo'}
              {carte?.photo_url && <Check className="h-3.5 w-3.5 text-emerald-400" />}
            </>
          )}
        </button>
      </div>

      {/* Selecteur de logo de compagnie (peut etre rendu ailleurs via embedLogoSelector=false) */}
      {embedLogoSelector && carte && <MonLogoSelector onChange={handleLogoChange} />}
    </div>
  );
}
