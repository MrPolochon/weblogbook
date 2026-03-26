'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Folder, Image as ImageIcon, Trash2, Loader2, RefreshCw,
  FolderOpen, Download, Copy, Check,
} from 'lucide-react';
import Image from 'next/image';

interface StorageItem {
  name: string;
  path: string;
  isFolder: boolean;
  size: number | null;
  mimetype: string | null;
  created_at: string;
  publicUrl: string | null;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminStoragePage() {
  const [folder, setFolder] = useState('');
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [preview, setPreview] = useState<StorageItem | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/storage?folder=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(folder); }, [folder, load]);

  async function handleDelete(item: StorageItem) {
    if (!confirm(`Supprimer "${item.name}" ?\nSi c'est un logo/photo utilisé sur des cartes, il sera retiré automatiquement.`)) return;
    setDeleting(item.path);
    try {
      const res = await fetch(`/api/admin/storage?path=${encodeURIComponent(item.path)}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.path !== item.path));
        if (preview?.path === item.path) setPreview(null);
      }
    } catch { /* ignore */ }
    setDeleting(null);
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  }

  function navigateUp() {
    const parts = folder.split('/').filter(Boolean);
    parts.pop();
    setFolder(parts.join('/'));
  }

  const breadcrumbs = folder ? folder.split('/').filter(Boolean) : [];
  const folders = items.filter(i => i.isFolder);
  const files = items.filter(i => !i.isFolder);
  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-sky-400" />
            Storage — Images
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Bucket <code className="text-sky-400">cartes-identite</code>
            {files.length > 0 && (
              <span className="ml-2">— {files.length} fichier{files.length > 1 ? 's' : ''} ({formatSize(totalSize)})</span>
            )}
          </p>
        </div>
        <button
          onClick={() => load(folder)}
          disabled={loading}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm flex-wrap">
        <button
          onClick={() => setFolder('')}
          className={`px-2 py-1 rounded transition-colors ${!folder ? 'text-sky-400 font-medium' : 'text-slate-400 hover:text-white'}`}
        >
          /
        </button>
        {breadcrumbs.map((part, i) => {
          const path = breadcrumbs.slice(0, i + 1).join('/');
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={path} className="flex items-center gap-1">
              <span className="text-slate-600">/</span>
              <button
                onClick={() => setFolder(path)}
                className={`px-2 py-1 rounded transition-colors ${isLast ? 'text-sky-400 font-medium' : 'text-slate-400 hover:text-white'}`}
              >
                {part}
              </button>
            </span>
          );
        })}
      </nav>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Bouton remonter */}
          {folder && (
            <button
              onClick={navigateUp}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/30 transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Remonter
            </button>
          )}

          {/* Dossiers */}
          {folders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {folders.map(item => (
                <button
                  key={item.path}
                  onClick={() => setFolder(item.path)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/40 hover:border-sky-500/30 transition-all group"
                >
                  <FolderOpen className="h-8 w-8 text-amber-400 group-hover:text-amber-300" />
                  <span className="text-sm text-slate-300 text-center truncate w-full">{item.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Fichiers (grille d'images) */}
          {files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {files.map(item => (
                <div
                  key={item.path}
                  className={`relative group rounded-xl border overflow-hidden transition-all cursor-pointer ${
                    preview?.path === item.path
                      ? 'border-sky-500 ring-2 ring-sky-500/30'
                      : 'border-slate-700/50 hover:border-slate-600'
                  }`}
                  onClick={() => setPreview(preview?.path === item.path ? null : item)}
                >
                  <div className="aspect-square bg-slate-800/50 flex items-center justify-center overflow-hidden">
                    {item.publicUrl && item.mimetype?.startsWith('image/') ? (
                      <Image
                        src={item.publicUrl}
                        alt={item.name}
                        width={200}
                        height={200}
                        className="w-full h-full object-contain p-1"
                        unoptimized
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-slate-600" />
                    )}
                  </div>
                  <div className="p-2 bg-slate-800/80">
                    <p className="text-xs text-slate-300 truncate" title={item.name}>{item.name}</p>
                    <p className="text-[10px] text-slate-500">{formatSize(item.size)}</p>
                  </div>
                  {/* Actions au hover */}
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                      disabled={deleting === item.path}
                      className="p-1.5 rounded-lg bg-red-600/80 text-white hover:bg-red-500 transition-colors"
                      title="Supprimer"
                    >
                      {deleting === item.path ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {folders.length === 0 && files.length === 0 && (
            <div className="text-center py-20">
              <Folder className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Ce dossier est vide</p>
            </div>
          )}
        </div>
      )}

      {/* Panneau de prévisualisation */}
      {preview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-slate-800 rounded-2xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-slate-200">{preview.name}</h3>
                <p className="text-xs text-slate-500">{preview.path} — {formatSize(preview.size)} — {preview.mimetype}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-white p-1" aria-label="Fermer l'aperçu">✕</button>
            </div>
            <div className="p-4 flex justify-center bg-[repeating-conic-gradient(#1e293b_0%_25%,#0f172a_0%_50%)] bg-[length:20px_20px]">
              {preview.publicUrl && (
                <Image
                  src={preview.publicUrl}
                  alt={preview.name}
                  width={500}
                  height={500}
                  className="max-w-full max-h-[60vh] object-contain"
                  unoptimized
                />
              )}
            </div>
            <div className="p-4 border-t border-slate-700 flex items-center gap-2 flex-wrap">
              {preview.publicUrl && (
                <>
                  <button
                    onClick={() => copyUrl(preview.publicUrl!)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm transition-colors"
                  >
                    {copied === preview.publicUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === preview.publicUrl ? 'Copié' : 'Copier l\'URL'}
                  </button>
                  <a
                    href={preview.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-600/20 text-sky-400 hover:bg-sky-600/30 text-sm transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" /> Ouvrir
                  </a>
                </>
              )}
              <button
                onClick={() => handleDelete(preview)}
                disabled={deleting === preview.path}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm transition-colors ml-auto"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
