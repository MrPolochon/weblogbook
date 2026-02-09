'use client';

import { useState, useRef } from 'react';
import { X, Save, Palette, Upload, Type, Hash, Calendar, Grid3X3, Loader2, Trash2 } from 'lucide-react';
import CarteIdentite from './CarteIdentite';
import Image from 'next/image';

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
  initialData: CarteData | null;
  onClose: () => void;
  onSave: () => void;
};

const COULEURS_PREDEFINES = [
  { nom: 'Rouge IFSA', valeur: '#DC2626' },
  { nom: 'Bleu Marine', valeur: '#1E3A8A' },
  { nom: 'Vert Foncé', valeur: '#166534' },
  { nom: 'Violet', valeur: '#7C3AED' },
  { nom: 'Orange', valeur: '#EA580C' },
  { nom: 'Noir', valeur: '#1F2937' },
  { nom: 'Bleu Ciel', valeur: '#0284C7' },
  { nom: 'Rose', valeur: '#DB2777' },
];

export default function CarteIdentiteEditor({ userId, identifiant, initialData, onClose, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<CarteData>({
    couleur_fond: initialData?.couleur_fond || '#DC2626',
    logo_url: initialData?.logo_url || null,
    photo_url: initialData?.photo_url || null,
    titre: initialData?.titre || 'IFSA',
    sous_titre: initialData?.sous_titre || 'délivré par l\'instance de l\'IFSA',
    nom_affiche: initialData?.nom_affiche || identifiant,
    organisation: initialData?.organisation || 'IFSA',
    numero_carte: initialData?.numero_carte || '000 00 000001',
    date_delivrance: initialData?.date_delivrance || new Date().toISOString().split('T')[0],
    date_expiration: initialData?.date_expiration || null,
    cases_haut: initialData?.cases_haut || [],
    cases_bas: initialData?.cases_bas || [],
  });

  const [casesHautInput, setCasesHautInput] = useState(formData.cases_haut.join(', '));
  const [casesBasInput, setCasesBasInput] = useState(formData.cases_bas.join(', '));

  function handleCasesHautChange(value: string) {
    setCasesHautInput(value);
    const cases = value.split(',').map(c => c.trim().toUpperCase()).filter(c => c.length > 0);
    setFormData(prev => ({ ...prev, cases_haut: cases }));
  }

  function handleCasesBasChange(value: string) {
    setCasesBasInput(value);
    const cases = value.split(',').map(c => c.trim().toUpperCase()).filter(c => c.length > 0);
    setFormData(prev => ({ ...prev, cases_bas: cases }));
  }

  async function handleUpload(file: File, type: 'logo' | 'photo') {
    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingPhoto;
    setUploading(true);
    setError(null);

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('user_id', userId);
      formDataUpload.append('type', type);

      const res = await fetch('/api/cartes/upload', {
        method: 'POST',
        body: formDataUpload,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'upload');
      }

      // Mettre à jour l'URL dans le formulaire
      if (type === 'logo') {
        setFormData(prev => ({ ...prev, logo_url: data.url }));
      } else {
        setFormData(prev => ({ ...prev, photo_url: data.url }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'photo') {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file, type);
    }
    // Reset input pour permettre de re-sélectionner le même fichier
    e.target.value = '';
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/cartes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...formData }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Modifier la carte de {identifiant}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Formulaire */}
            <div className="space-y-4">
              {/* Couleur de fond */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Palette className="h-4 w-4" />
                  Couleur de fond
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {COULEURS_PREDEFINES.map(c => (
                    <button
                      key={c.valeur}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, couleur_fond: c.valeur }))}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        formData.couleur_fond === c.valeur ? 'border-slate-900 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.valeur }}
                      title={c.nom}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={formData.couleur_fond}
                  onChange={e => setFormData(prev => ({ ...prev, couleur_fond: e.target.value }))}
                  className="w-full h-10 rounded-lg cursor-pointer"
                />
              </div>

              {/* Titre */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <Type className="h-4 w-4" />
                  Titre principal
                </label>
                <input
                  type="text"
                  value={formData.titre}
                  onChange={e => setFormData(prev => ({ ...prev, titre: e.target.value }))}
                  className="input"
                  placeholder="IFSA"
                />
              </div>

              {/* Sous-titre */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Sous-titre</label>
                <input
                  type="text"
                  value={formData.sous_titre || ''}
                  onChange={e => setFormData(prev => ({ ...prev, sous_titre: e.target.value || null }))}
                  className="input"
                  placeholder="délivré par l'instance de l'IFSA"
                />
              </div>

              {/* Cases du haut */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <Grid3X3 className="h-4 w-4" />
                  Cases du haut (séparées par des virgules)
                </label>
                <input
                  type="text"
                  value={casesHautInput}
                  onChange={e => handleCasesHautChange(e.target.value)}
                  className="input"
                  placeholder="TRA, MAN, ITB, NAV"
                />
                <p className="text-xs text-slate-500 mt-1">Ex: TRA, MAN, ITB, NAV</p>
              </div>

              {/* Upload Logo */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Upload className="h-4 w-4" />
                  Logo
                </label>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={e => handleFileSelect(e, 'logo')}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  {formData.logo_url ? (
                    <div className="relative">
                      <Image
                        src={formData.logo_url}
                        alt="Logo"
                        width={60}
                        height={60}
                        className="rounded-lg object-cover border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, logo_url: null }))}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-[60px] h-[60px] rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center">
                      <span className="text-xs text-slate-400">Logo</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {uploadingLogo ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Upload...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        {formData.logo_url ? 'Changer le logo' : 'Uploader un logo'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Upload Photo */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <Upload className="h-4 w-4" />
                  Photo de profil
                </label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={e => handleFileSelect(e, 'photo')}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  {formData.photo_url ? (
                    <div className="relative">
                      <Image
                        src={formData.photo_url}
                        alt="Photo"
                        width={60}
                        height={75}
                        className="rounded-lg object-cover border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, photo_url: null }))}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-[60px] h-[75px] rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center">
                      <span className="text-xs text-slate-400">Photo</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {uploadingPhoto ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Upload...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        {formData.photo_url ? 'Changer la photo' : 'Uploader une photo'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Nom affiché */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Nom affiché</label>
                <input
                  type="text"
                  value={formData.nom_affiche || ''}
                  onChange={e => setFormData(prev => ({ ...prev, nom_affiche: e.target.value || null }))}
                  className="input"
                  placeholder="DUVAL Martin"
                />
              </div>

              {/* Organisation */}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Organisation</label>
                <input
                  type="text"
                  value={formData.organisation || ''}
                  onChange={e => setFormData(prev => ({ ...prev, organisation: e.target.value || null }))}
                  className="input"
                  placeholder="IFSA"
                />
              </div>

              {/* Numéro de carte */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <Hash className="h-4 w-4" />
                  Numéro de carte
                </label>
                <input
                  type="text"
                  value={formData.numero_carte || ''}
                  onChange={e => setFormData(prev => ({ ...prev, numero_carte: e.target.value || null }))}
                  className="input font-mono"
                  placeholder="000 00 000001"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                    <Calendar className="h-4 w-4" />
                    Date délivrance
                  </label>
                  <input
                    type="date"
                    value={formData.date_delivrance || ''}
                    onChange={e => setFormData(prev => ({ ...prev, date_delivrance: e.target.value || null }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Date expiration</label>
                  <input
                    type="date"
                    value={formData.date_expiration || ''}
                    onChange={e => setFormData(prev => ({ ...prev, date_expiration: e.target.value || null }))}
                    className="input"
                  />
                </div>
              </div>

              {/* Cases du bas */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <Grid3X3 className="h-4 w-4" />
                  Cases du bas (séparées par des virgules)
                </label>
                <input
                  type="text"
                  value={casesBasInput}
                  onChange={e => handleCasesBasChange(e.target.value)}
                  className="input"
                  placeholder="A, B, F, P"
                />
                <p className="text-xs text-slate-500 mt-1">Ex: A, B, F, P</p>
              </div>
            </div>

            {/* Prévisualisation */}
            <div className="flex flex-col items-center">
              <h3 className="text-sm font-medium text-slate-700 mb-4">Prévisualisation</h3>
              <CarteIdentite carte={formData} identifiant={identifiant} size="md" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
