'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FolderOpen, FileText, Plus, Pencil, Trash2, Upload, X, ChevronUp, ChevronDown, File, Image, FileSpreadsheet, FileArchive, Loader2, GripVertical } from 'lucide-react';

type DocFile = { id: string; nom_original: string; taille_bytes: number | null; created_at: string };
type Section = { id: string; nom: string; ordre: number; document_files?: DocFile[] };

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return <Image className="h-4 w-4 text-pink-400" />;
  if (['pdf'].includes(ext)) return <FileText className="h-4 w-4 text-red-400" />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className="h-4 w-4 text-emerald-400" />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive className="h-4 w-4 text-amber-400" />;
  if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return <FileText className="h-4 w-4 text-sky-400" />;
  return <File className="h-4 w-4 text-slate-400" />;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function DocumentSections({ sections }: { sections: Section[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadSectionId, setUploadSectionId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function uploadFile(sectionId: string, file: globalThis.File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('section_id', sectionId);
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Erreur upload');
        return;
      }
      setUploadSectionId(null);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(sectionId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile(sectionId, file);
    e.target.value = '';
  }

  function handleDrop(sectionId: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(sectionId, file);
  }

  async function moveSection(id: string, direction: 'up' | 'down') {
    const idx = sections.findIndex(s => s.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;

    setLoading(true);
    try {
      const ordreA = sections[idx].ordre;
      const ordreB = sections[swapIdx].ordre;
      await Promise.all([
        fetch(`/api/documents/sections/${sections[idx].id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: sections[idx].nom, ordre: ordreB }),
        }),
        fetch(`/api/documents/sections/${sections[swapIdx].id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: sections[swapIdx].nom, ordre: ordreA }),
        }),
      ]);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const totalFiles = sections.reduce((sum, s) => sum + (s.document_files?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex items-center gap-6 text-sm text-slate-400">
        <span className="flex items-center gap-1.5"><FolderOpen className="h-4 w-4 text-sky-400" /> {sections.length} section(s)</span>
        <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-sky-400" /> {totalFiles} fichier(s)</span>
      </div>

      {/* Create section */}
      <form onSubmit={handleCreate} className="flex gap-3">
        <input
          type="text"
          className="flex-1 max-w-sm bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-sky-500 transition-colors"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nom de la nouvelle section…"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          disabled={loading || !newName.trim()}
        >
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </form>

      {/* Sections */}
      {sections.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-700/50 rounded-xl">
          <FolderOpen className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Aucune section</p>
          <p className="text-slate-500 text-sm mt-1">Créez une section pour commencer à organiser vos documents.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((s, idx) => {
            const files = s.document_files || [];
            const totalSize = files.reduce((sum, f) => sum + (f.taille_bytes || 0), 0);
            const isDragTarget = dragOver === s.id;

            return (
              <div
                key={s.id}
                className={`rounded-xl border transition-all ${isDragTarget ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/30' : 'border-slate-700/50 bg-slate-800/50'}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(s.id, e)}
              >
                {/* Section header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/30">
                  <GripVertical className="h-4 w-4 text-slate-600 shrink-0" />
                  <FolderOpen className="h-5 w-5 text-sky-400 shrink-0" />

                  {editingId === s.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        className="flex-1 max-w-xs bg-slate-900 border border-sky-500 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(s.id); if (e.key === 'Escape') { setEditingId(null); setEditName(''); } }}
                        autoFocus
                      />
                      <button type="button" className="px-3 py-1.5 bg-sky-600 text-white text-xs font-medium rounded-lg hover:bg-sky-700" onClick={() => handleRename(s.id)} disabled={loading}>OK</button>
                      <button type="button" className="px-3 py-1.5 text-slate-400 text-xs hover:text-slate-200" onClick={() => { setEditingId(null); setEditName(''); }}>Annuler</button>
                    </div>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-200 text-base">{s.nom}</span>
                      <span className="text-xs text-slate-500 ml-1">{files.length} fichier(s){totalSize > 0 ? ` • ${formatSize(totalSize)}` : ''}</span>
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => moveSection(s.id, 'up')} disabled={idx === 0 || loading} className="p-1.5 text-slate-500 hover:text-slate-300 disabled:opacity-30 rounded hover:bg-slate-700/50 transition-colors" title="Monter"><ChevronUp className="h-4 w-4" /></button>
                        <button type="button" onClick={() => moveSection(s.id, 'down')} disabled={idx === sections.length - 1 || loading} className="p-1.5 text-slate-500 hover:text-slate-300 disabled:opacity-30 rounded hover:bg-slate-700/50 transition-colors" title="Descendre"><ChevronDown className="h-4 w-4" /></button>
                        <button type="button" onClick={() => { setEditingId(s.id); setEditName(s.nom); }} className="p-1.5 text-slate-500 hover:text-sky-400 rounded hover:bg-slate-700/50 transition-colors" title="Renommer"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => handleDeleteSection(s.id, s.nom)} disabled={loading} className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-slate-700/50 transition-colors" title="Supprimer"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </>
                  )}
                </div>

                {/* Files list */}
                <div className="px-4 py-2">
                  {files.length === 0 ? (
                    <p className="text-slate-500 text-sm py-2 italic">Aucun fichier dans cette section.</p>
                  ) : (
                    <ul className="divide-y divide-slate-700/30">
                      {files.map((f) => (
                        <li key={f.id} className="flex items-center gap-3 py-2.5 group">
                          {getFileIcon(f.nom_original)}
                          <span className="text-sm text-slate-300 font-medium truncate flex-1">{f.nom_original}</span>
                          <span className="text-xs text-slate-500 shrink-0">{formatSize(f.taille_bytes)}</span>
                          <span className="text-xs text-slate-600 shrink-0">{formatDate(f.created_at)}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteFile(f.id)}
                            disabled={loading}
                            className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-red-500/10"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Upload area */}
                <div className="px-4 pb-3">
                  {uploadSectionId === s.id ? (
                    <div className="flex items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={(e) => handleFileInput(s.id, e)}
                        disabled={uploading}
                        className="text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sky-600 file:text-white hover:file:bg-sky-700 file:cursor-pointer file:transition-colors"
                      />
                      {uploading && <Loader2 className="h-4 w-4 text-sky-400 animate-spin" />}
                      <button type="button" onClick={() => setUploadSectionId(null)} className="text-slate-500 hover:text-slate-300"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setUploadSectionId(s.id)}
                      className="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300 font-medium transition-colors"
                    >
                      <Upload className="h-4 w-4" /> Ajouter un fichier
                    </button>
                  )}
                  {isDragTarget && (
                    <div className="mt-2 text-center py-4 border-2 border-dashed border-sky-500/50 rounded-lg bg-sky-500/5">
                      <p className="text-sky-400 text-sm font-medium">Déposer le fichier ici</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
