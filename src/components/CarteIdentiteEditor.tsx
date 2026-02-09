'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Palette, Upload, Type, Hash, Calendar, Grid3X3, Loader2, Trash2, User, Building } from 'lucide-react';
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

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
          <h2 className="text-xl font-bold text-slate-900">Modifier la carte de {identifiant}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="h-6 w-6 text-slate-600" />
          </button>
        </div>

        {/* Content - 2 colonnes */}
        <div className="flex-1 flex overflow-hidden">
          {/* Colonne gauche - Formulaire (scrollable) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Section: Apparence */}
            <div className="bg-slate-50 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Palette className="h-5 w-5 text-sky-600" />
                Apparence
              </h3>
              
              {/* Couleur de fond */}
              <div className="mb-4">
                <label className="text-sm font-medium text-slate-700 mb-2 block">Couleur de fond</label>
                <div className="flex flex-wrap gap-3 mb-3">
                  {COULEURS_PREDEFINES.map(c => (
                    <button
                      key={c.valeur}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, couleur_fond: c.valeur }))}
                      className={`w-10 h-10 rounded-xl border-2 transition-all hover:scale-105 ${
                        formData.couleur_fond === c.valeur ? 'border-slate-900 scale-110 shadow-lg' : 'border-slate-300'
                      }`}
                      style={{ backgroundColor: c.valeur }}
                      title={c.nom}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.couleur_fond}
                    onChange={e => setFormData(prev => ({ ...prev, couleur_fond: e.target.value }))}
                    className="w-20 h-10 rounded-lg cursor-pointer border border-slate-300"
                  />
                  <span className="text-sm text-slate-500">ou choisir une couleur personnalisée</span>
                </div>
              </div>
            </div>

            {/* Section: Textes */}
            <div className="bg-slate-50 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Type className="h-5 w-5 text-sky-600" />
                Textes
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Titre principal</label>
                  <input
                    type="text"
                    value={formData.titre}
                    onChange={e => setFormData(prev => ({ ...prev, titre: e.target.value }))}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900"
                    placeholder="IFSA"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Sous-titre</label>
                  <input
                    type="text"
                    value={formData.sous_titre || ''}
                    onChange={e => setFormData(prev => ({ ...prev, sous_titre: e.target.value || null }))}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900"
                    placeholder="délivré par l'instance de l'IFSA"
                  />
                </div>
              </div>
            </div>

            {/* Section: Images */}
            <div className="bg-slate-50 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Upload className="h-5 w-5 text-sky-600" />
                Images
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Logo */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-3 block">Logo</label>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => handleFileSelect(e, 'logo')}
                    className="hidden"
                  />
                  <div className="flex items-center gap-4">
                    {formData.logo_url ? (
                      <div className="relative">
                        <Image
                          src={formData.logo_url}
                          alt="Logo"
                          width={80}
                          height={80}
                          className="rounded-xl object-cover border-2 border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, logo_url: null }))}
                          className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-slate-200 border-2 border-dashed border-slate-400 flex items-center justify-center">
                        <span className="text-sm text-slate-500">Logo</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="px-5 py-3 bg-white border-2 border-slate-300 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                      {uploadingLogo ? (
                        <><Loader2 className="h-5 w-5 animate-spin" /> Upload...</>
                      ) : (
                        <><Upload className="h-5 w-5" /> {formData.logo_url ? 'Changer' : 'Uploader'}</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Photo */}
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-3 block">Photo de profil</label>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => handleFileSelect(e, 'photo')}
                    className="hidden"
                  />
                  <div className="flex items-center gap-4">
                    {formData.photo_url ? (
                      <div className="relative">
                        <Image
                          src={formData.photo_url}
                          alt="Photo"
                          width={80}
                          height={100}
                          className="rounded-xl object-cover border-2 border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, photo_url: null }))}
                          className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-24 rounded-xl bg-slate-200 border-2 border-dashed border-slate-400 flex items-center justify-center">
                        <span className="text-sm text-slate-500">Photo</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="px-5 py-3 bg-white border-2 border-slate-300 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                      {uploadingPhoto ? (
                        <><Loader2 className="h-5 w-5 animate-spin" /> Upload...</>
                      ) : (
                        <><Upload className="h-5 w-5" /> {formData.photo_url ? 'Changer' : 'Uploader'}</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Informations */}
            <div className="bg-slate-50 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-sky-600" />
                Informations
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Nom affiché</label>
                  <input
                    type="text"
                    value={formData.nom_affiche || ''}
                    onChange={e => setFormData(prev => ({ ...prev, nom_affiche: e.target.value || null }))}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900"
                    placeholder="DUVAL Martin"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Organisation
                  </label>
                  <input
                    type="text"
                    value={formData.organisation || ''}
                    onChange={e => setFormData(prev => ({ ...prev, organisation: e.target.value || null }))}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900"
                    placeholder="IFSA"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Numéro de carte
                  </label>
                  <input
                    type="text"
                    value={formData.numero_carte || ''}
                    onChange={e => setFormData(prev => ({ ...prev, numero_carte: e.target.value || null }))}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-mono text-slate-900"
                    placeholder="000 00 000001"
                  />
                </div>
              </div>
            </div>

            {/* Section: Dates */}
            <div className="bg-slate-50 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-600" />
                Dates
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Date de délivrance</label>
                  <input
                    type="date"
                    value={formData.date_delivrance || ''}
                    onChange={e => setFormData(prev => ({ ...prev, date_delivrance: e.target.value || null }))}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Date d&apos;expiration</label>
                  <input
                    type="date"
                    value={formData.date_expiration || ''}
                    onChange={e => setFormData(prev => ({ ...prev, date_expiration: e.target.value || null }))}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Section: Cases */}
            <div className="bg-slate-50 rounded-xl p-5">
              <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Grid3X3 className="h-5 w-5 text-sky-600" />
                Cases personnalisées
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Cases du haut (qualifications)
                  </label>
                  <input
                    type="text"
                    value={casesHautInput}
                    onChange={e => handleCasesHautChange(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900"
                    placeholder="TRA, MAN, ITB, NAV"
                  />
                  <p className="text-xs text-slate-500 mt-2">Séparez les valeurs par des virgules. Exemple: TRA, MAN, ITB, NAV</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Cases du bas (catégories)
                  </label>
                  <input
                    type="text"
                    value={casesBasInput}
                    onChange={e => handleCasesBasChange(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900"
                    placeholder="A, B, F, P"
                  />
                  <p className="text-xs text-slate-500 mt-2">Séparez les valeurs par des virgules. Exemple: A, B, F, P</p>
                </div>
              </div>
            </div>
          </div>

          {/* Colonne droite - Prévisualisation (fixe) */}
          <div className="w-80 lg:w-96 border-l border-slate-200 bg-slate-100 p-6 flex flex-col items-center">
            <h3 className="text-base font-semibold text-slate-800 mb-6">Prévisualisation</h3>
            <div className="sticky top-6">
              <CarteIdentite carte={formData} identifiant={identifiant} size="md" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
          <div className="flex gap-4 ml-auto">
            <button
              onClick={onClose}
              className="px-6 py-3 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors font-medium"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl transition-colors font-medium disabled:opacity-50"
            >
              <Save className="h-5 w-5" />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
