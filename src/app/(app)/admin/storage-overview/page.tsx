'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  HardDrive, Loader2, Database, FolderOpen, File, ArrowRight,
  Lock, Globe, RefreshCw,
} from 'lucide-react';

interface FolderStats {
  name: string;
  fileCount: number;
  totalSize: number;
}

interface BigFile {
  name: string;
  path: string;
  size: number;
  mimetype: string | null;
  created_at: string;
}

interface BucketStats {
  id: string;
  name: string;
  public: boolean;
  fileCount: number;
  totalSize: number;
  folders: FolderStats[];
  biggestFiles: BigFile[];
}

interface Overview {
  buckets: BucketStats[];
  totalFiles: number;
  totalSize: number;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function SizeBar({ size, maxSize, color }: { size: number; maxSize: number; color: string }) {
  const pct = maxSize > 0 ? Math.max(1, (size / maxSize) * 100) : 0;
  return (
    <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden flex-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const FOLDER_COLORS = [
  'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-pink-500',
  'bg-teal-500', 'bg-indigo-500',
];

export default function StorageOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/storage/overview');
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
        <p className="text-slate-400 text-sm">Analyse du stockage en cours...</p>
      </div>
    );
  }

  if (!data) {
    return <p className="text-red-400 text-center py-20">Erreur de chargement</p>;
  }

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <HardDrive className="h-6 w-6 text-sky-400" />
            Stockage du site
          </h1>
          <p className="text-slate-400 text-sm mt-1">Vue d&apos;ensemble de tout le stockage Supabase</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-sky-500/10 to-sky-600/5 border border-sky-500/20 p-5">
          <p className="text-3xl font-bold text-sky-400">{formatSize(data.totalSize)}</p>
          <p className="text-sm text-slate-400 mt-1">Espace total utilisé</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 p-5">
          <p className="text-3xl font-bold text-violet-400">{data.totalFiles.toLocaleString('fr-FR')}</p>
          <p className="text-sm text-slate-400 mt-1">Fichiers au total</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-5">
          <p className="text-3xl font-bold text-amber-400">{data.buckets.length}</p>
          <p className="text-sm text-slate-400 mt-1">Bucket{data.buckets.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Détail par bucket */}
      {data.buckets.map(bucket => {
        const maxFolderSize = Math.max(...bucket.folders.map(f => f.totalSize), 1);
        return (
          <div key={bucket.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            {/* Header bucket */}
            <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-sky-400" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                    {bucket.name}
                    {bucket.public ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                        <Globe className="h-2.5 w-2.5" /> public
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" /> privé
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {bucket.fileCount} fichier{bucket.fileCount > 1 ? 's' : ''} — {formatSize(bucket.totalSize)}
                  </p>
                </div>
              </div>
              {bucket.id === 'cartes-identite' && (
                <Link
                  href="/admin/storage"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-sky-400 hover:bg-sky-500/10 transition-colors"
                >
                  Parcourir <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Répartition par dossier */}
            {bucket.folders.length > 0 && (
              <div className="p-5 space-y-4">
                <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Répartition par dossier</h3>

                {/* Barre empilée */}
                <div className="flex h-6 rounded-full overflow-hidden bg-slate-700/30">
                  {bucket.folders.map((folder, i) => {
                    const pct = bucket.totalSize > 0 ? (folder.totalSize / bucket.totalSize) * 100 : 0;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={folder.name}
                        className={`${FOLDER_COLORS[i % FOLDER_COLORS.length]} transition-all relative group`}
                        style={{ width: `${pct}%` }}
                        title={`${folder.name}: ${formatSize(folder.totalSize)} (${pct.toFixed(1)}%)`}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          {pct > 8 && (
                            <span className="text-[10px] font-bold text-white/90 truncate px-1">
                              {folder.name}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Liste détaillée */}
                <div className="space-y-2">
                  {bucket.folders.map((folder, i) => {
                    const pct = bucket.totalSize > 0 ? (folder.totalSize / bucket.totalSize) * 100 : 0;
                    return (
                      <div key={folder.name} className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-sm ${FOLDER_COLORS[i % FOLDER_COLORS.length]} flex-shrink-0`} />
                        <FolderOpen className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        <span className="text-sm text-slate-300 w-40 truncate" title={folder.name}>{folder.name}</span>
                        <SizeBar size={folder.totalSize} maxSize={maxFolderSize} color={FOLDER_COLORS[i % FOLDER_COLORS.length]} />
                        <span className="text-xs text-slate-400 w-20 text-right font-mono">{formatSize(folder.totalSize)}</span>
                        <span className="text-xs text-slate-500 w-16 text-right">{pct.toFixed(1)}%</span>
                        <span className="text-xs text-slate-600 w-20 text-right">{folder.fileCount} fichier{folder.fileCount > 1 ? 's' : ''}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Plus gros fichiers */}
            {bucket.biggestFiles.length > 0 && (
              <div className="p-5 border-t border-slate-700/50 space-y-3">
                <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">10 plus gros fichiers</h3>
                <div className="space-y-1">
                  {bucket.biggestFiles.map((f, i) => (
                    <div key={f.path} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-700/20 transition-colors">
                      <span className="text-xs text-slate-600 w-5 text-right font-mono">{i + 1}.</span>
                      <File className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                      <span className="text-sm text-slate-300 flex-1 truncate" title={f.path}>{f.path}</span>
                      <span className="text-xs text-slate-500">{f.mimetype?.split('/')[1] || '?'}</span>
                      <span className="text-sm font-mono text-amber-400 w-24 text-right">{formatSize(f.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {data.buckets.length === 0 && (
        <p className="text-center text-slate-500 py-10">Aucun bucket trouvé</p>
      )}
    </div>
  );
}
