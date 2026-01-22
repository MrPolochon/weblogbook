'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Award, Plus, Edit2, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const TYPES = [
  'PPL', 'CPL', 'ATPL',
  'IR ME',
  'Qualification Type',
  'CAT 3', 'CAT 4', 'CAT 5',
  'CLASS-M', 'CLASS-MT', 'CLASS-MRP',
  'IFR', 'VFR',
  'COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6',
  'CAL-ATC', 'CAL-AFIS',
  'PCAL-ATC', 'PCAL-AFIS',
  'LPAFIS', 'LATC',
] as const;

const TYPES_COM = ['COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6'] as const;
const TYPE_QUALIFICATION_TYPE = 'Qualification Type';

type Pilote = { id: string; identifiant: string };
type TypeAvion = { id: string; nom: string; constructeur: string };
type Licence = {
  id: string;
  user_id: string;
  type: string;
  type_avion_id: string | null;
  langue: string | null;
  date_delivrance: string | null;
  date_expiration: string | null;
  a_vie: boolean;
  note: string | null;
  types_avion: { nom: string; constructeur: string } | null;
};

type Props = { pilotes: Pilote[]; typesAvion: TypeAvion[] };

export default function AdminLicences({ pilotes, typesAvion }: Props) {
  const router = useRouter();
  const [selectedPiloteId, setSelectedPiloteId] = useState<string>('');
  const [licences, setLicences] = useState<Licence[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: '',
    type_avion_id: '',
    langue: '',
    date_delivrance: '',
    date_expiration: '',
    a_vie: false,
    note: '',
  });

  useEffect(() => {
    if (selectedPiloteId) {
      setLoading(true);
      fetch(`/api/licences?user_id=${selectedPiloteId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.data) setLicences(d.data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLicences([]);
    }
  }, [selectedPiloteId]);

  function handleNew() {
    setEditingId(null);
    setFormData({
      type: '',
      type_avion_id: '',
      langue: '',
      date_delivrance: '',
      date_expiration: '',
      a_vie: false,
      note: '',
    });
    setShowForm(true);
  }

  function handleEdit(lic: Licence) {
    setEditingId(lic.id);
    setFormData({
      type: lic.type,
      type_avion_id: lic.type_avion_id || '',
      langue: lic.langue || '',
      date_delivrance: lic.date_delivrance ? lic.date_delivrance.substring(0, 10) : '',
      date_expiration: lic.date_expiration ? lic.date_expiration.substring(0, 10) : '',
      a_vie: lic.a_vie,
      note: lic.note || '',
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPiloteId) return;
    setLoading(true);
    try {
      const body: any = {
        user_id: selectedPiloteId,
        type: formData.type,
        a_vie: formData.a_vie,
      };
      if (formData.type === TYPE_QUALIFICATION_TYPE) {
        if (!formData.type_avion_id) {
          alert('Type d\'avion requis pour Qualification Type');
          setLoading(false);
          return;
        }
        body.type_avion_id = formData.type_avion_id;
      }
      if (TYPES_COM.includes(formData.type as any)) {
        if (!formData.langue) {
          alert('Langue requise pour COM');
          setLoading(false);
          return;
        }
        body.langue = formData.langue;
      }
      if (formData.date_delivrance) body.date_delivrance = formData.date_delivrance;
      if (formData.date_expiration && !formData.a_vie) body.date_expiration = formData.date_expiration;
      if (formData.note) body.note = formData.note;

      const url = editingId ? `/api/licences/${editingId}` : '/api/licences';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setShowForm(false);
      router.refresh();
      if (selectedPiloteId) {
        const r = await fetch(`/api/licences?user_id=${selectedPiloteId}`);
        const data = await r.json();
        if (data.data) setLicences(data.data);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette licence ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/licences/${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
      if (selectedPiloteId) {
        const r = await fetch(`/api/licences?user_id=${selectedPiloteId}`);
        const data = await r.json();
        if (data.data) setLicences(data.data);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const selectedPilote = pilotes.find((p) => p.id === selectedPiloteId);
  const needsTypeAvion = formData.type === TYPE_QUALIFICATION_TYPE;
  const needsLangue = TYPES_COM.includes(formData.type as any);

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Sélectionner un utilisateur</h2>
        <select
          className="input"
          value={selectedPiloteId}
          onChange={(e) => {
            setSelectedPiloteId(e.target.value);
            setShowForm(false);
          }}
        >
          <option value="">— Choisir —</option>
          {pilotes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.identifiant}
            </option>
          ))}
        </select>
      </div>

      {selectedPiloteId && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-slate-200">
                Licences de {selectedPilote?.identifiant}
              </h2>
              <button
                type="button"
                onClick={handleNew}
                className="btn-primary flex items-center gap-2"
                disabled={loading}
              >
                <Plus className="h-4 w-4" />
                Ajouter
              </button>
            </div>

            {loading && !showForm ? (
              <p className="text-slate-400 text-sm">Chargement…</p>
            ) : licences.length === 0 ? (
              <p className="text-slate-400 text-sm">Aucune licence.</p>
            ) : (
              <div className="space-y-3">
                {licences.map((lic) => {
                  const libelle =
                    lic.type === TYPE_QUALIFICATION_TYPE && lic.types_avion
                      ? `Qualification Type ${lic.types_avion.constructeur} ${lic.types_avion.nom}`
                      : lic.type.startsWith('COM') && lic.langue
                        ? `${lic.type} ${lic.langue}`
                        : lic.type;
                  return (
                    <div key={lic.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-200">{libelle}</p>
                          <div className="mt-1.5 space-y-1 text-sm text-slate-400">
                            {lic.date_delivrance && (
                              <p>Délivré le {format(new Date(lic.date_delivrance), 'dd MMM yyyy', { locale: fr })}</p>
                            )}
                            {lic.a_vie ? (
                              <p className="text-emerald-400">✓ À vie</p>
                            ) : lic.date_expiration ? (
                              <p>Expire le {format(new Date(lic.date_expiration), 'dd MMM yyyy', { locale: fr })}</p>
                            ) : null}
                            {lic.note && <p className="text-xs mt-1">{lic.note}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(lic)}
                            className="text-sky-400 hover:text-sky-300"
                            disabled={loading}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(lic.id)}
                            className="text-red-400 hover:text-red-300"
                            disabled={loading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {showForm && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-slate-200">
                  {editingId ? 'Modifier la licence' : 'Ajouter une licence'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-slate-400 hover:text-slate-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Type</label>
                  <select
                    className="input"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    required
                  >
                    <option value="">— Choisir —</option>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {needsTypeAvion && (
                  <div>
                    <label className="label">Type d&apos;avion</label>
                    <select
                      className="input"
                      value={formData.type_avion_id}
                      onChange={(e) => setFormData({ ...formData, type_avion_id: e.target.value })}
                      required
                    >
                      <option value="">— Choisir —</option>
                      {typesAvion.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.constructeur} {t.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {needsLangue && (
                  <div>
                    <label className="label">Langue</label>
                    <input
                      type="text"
                      className="input"
                      value={formData.langue}
                      onChange={(e) => setFormData({ ...formData, langue: e.target.value })}
                      placeholder="Ex: Français, Anglais, etc."
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="label">Date de délivrance</label>
                  <input
                    type="date"
                    className="input"
                    value={formData.date_delivrance}
                    onChange={(e) => setFormData({ ...formData, date_delivrance: e.target.value })}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.a_vie}
                      onChange={(e) => setFormData({ ...formData, a_vie: e.target.checked, date_expiration: '' })}
                      className="rounded"
                    />
                    <span className="text-slate-300">À vie</span>
                  </label>
                </div>

                {!formData.a_vie && (
                  <div>
                    <label className="label">Date d&apos;expiration</label>
                    <input
                      type="date"
                      className="input"
                      value={formData.date_expiration}
                      onChange={(e) => setFormData({ ...formData, date_expiration: e.target.value })}
                    />
                  </div>
                )}

                <div>
                  <label className="label">Note (optionnel)</label>
                  <textarea
                    className="input"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Enregistrement…' : editingId ? 'Modifier' : 'Ajouter'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="btn-secondary"
                    disabled={loading}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
