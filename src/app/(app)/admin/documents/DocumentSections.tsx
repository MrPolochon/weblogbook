'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, FileText, Plus, Pencil, Trash2, Upload, X } from 'lucide-react';

type File = { id: string; nom_original: string; created_at: string };
type Section = { id: string; nom: string; ordre: number; document_files?: File[] };

export default function DocumentSections({ sections }: { sections: Section[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadSection, setUploadSection] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/documents/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: newName.trim() }),
      });
      if (!res.ok) throw new Error('Erreur');
      setNewName('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/sections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: editName.trim() }),
      });
      if (!res.ok) throw new Error('Erreur');
      setEditingId(null);
      setEditName('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSection(id: string, nom: string) {
    if (!confirm(`Supprimer la section « ${nom} » et tous ses fichiers ?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/sections/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm('Supprimer ce fichier ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/files/${fileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(sectionId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('section_id', sectionId);
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Erreur');
      setUploadSection(null);
      router.refresh();
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          className="input max-w-xs"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nom de la section"
        />
        <button type="submit" className="btn-primary inline-flex gap-1" disabled={loading}>
          <Plus className="h-4 w-4" /> Ajouter une section
        </button>
      </form>

      {sections.map((s) => (
        <div key={s.id} className="card">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen className="h-5 w-5 text-sky-400" />
            {editingId === s.id ? (
              <div className="flex gap-2 flex-1">
                <input
                  type="text"
                  className="input flex-1 max-w-xs"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <button type="button" className="btn-secondary text-sm" onClick={() => handleRename(s.id)} disabled={loading}>OK</button>
                <button type="button" className="btn-secondary text-sm" onClick={() => { setEditingId(null); setEditName(''); }}>Annuler</button>
              </div>
            ) : (
              <>
                <span className="font-medium text-slate-200">{s.nom}</span>
                <button type="button" onClick={() => { setEditingId(s.id); setEditName(s.nom); }} className="p-1 text-slate-400 hover:text-sky-400"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => handleDeleteSection(s.id, s.nom)} disabled={loading} className="p-1 text-slate-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </div>
          <ul className="space-y-2">
            {(s.document_files || []).map((f) => (
              <li key={f.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-300 flex items-center gap-2"><FileText className="h-4 w-4" /> {f.nom_original}</span>
                <button type="button" onClick={() => handleDeleteFile(f.id)} disabled={loading} className="p-1 text-slate-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            {uploadSection === s.id ? (
              <div className="flex items-center gap-2">
                <input type="file" onChange={(e) => handleUpload(s.id, e)} disabled={loading} className="text-sm text-slate-400" />
                <button type="button" onClick={() => setUploadSection(null)} className="text-slate-500 hover:text-slate-400"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => setUploadSection(s.id)} className="text-sm text-sky-400 hover:underline inline-flex gap-1"><Upload className="h-4 w-4" /> Ajouter un fichier</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
