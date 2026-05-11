'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Trash2, Loader2, RefreshCw, AlertTriangle, FileWarning, Image as ImageIcon,
  FileText, Download, CheckSquare, Square, Filter, Database,
} from 'lucide-react';
import { toast } from 'sonner';

type OrphanFile = {
  bucket: string;
  path: string;
  name: string;
  size: number;
  mimetype: string | null;
  created_at: string;
  days_old: number;
};

type BucketReport = {
  bucket: string;
  total_files: number;
  total_size: number;
  referenced_count: number;
  orphan_count: number;
  orphan_size: number;
  orphans: OrphanFile[];
};

type Overview = {
  generated_at: string;
  buckets: BucketReport[];
  total_orphan_count: number;
  total_orphan_size: number;
};

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const AGE_FILTERS = [
  { id: 'all', label: 'Tous', minDays: 0 },
  { id: '7', label: '> 7 jours', minDays: 7 },
  { id: '30', label: '> 30 jours', minDays: 30 },
  { id: '90', label: '> 90 jours', minDays: 90 },
] as const;

type AgeFilterId = typeof AGE_FILTERS[number]['id'];

export default function StorageOrphansPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ageFilter, setAgeFilter] = useState<AgeFilterId>('all');

  async function load() {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await fetch('/api/admin/storage/orphans');
      if (!res.ok) {
        toast.error('Erreur de chargement des orphelins');
        return;
      }
      setData(await res.json());
    } catch {
      toast.error('Erreur reseau');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const minDays = useMemo(() => AGE_FILTERS.find((a) => a.id === ageFilter)?.minDays ?? 0, [ageFilter]);

  const filteredBuckets = useMemo(() => {
    if (!data) return [];
    return data.buckets.map((b) => ({
      ...b,
      orphans: b.orphans.filter((o) => o.days_old >= minDays),
    }));
  }, [data, minDays]);

  const filteredTotalCount = filteredBuckets.reduce((s, b) => s + b.orphans.length, 0);
  const filteredTotalSize = filteredBuckets.reduce(
    (s, b) => s + b.orphans.reduce((ss, o) => ss + o.size, 0),
    0
  );

  const fileKey = (o: OrphanFile) => `${o.bucket}::${o.path}`;

  function toggleSelect(o: OrphanFile) {
    const k = fileKey(o);
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
  }

  function toggleSelectAllFiltered() {
    const allKeys = filteredBuckets.flatMap((b) => b.orphans.map(fileKey));
    if (allKeys.every((k) => selected.has(k))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allKeys));
    }
  }

  const selectedSize = useMemo(() => {
    let s = 0;
    for (const b of filteredBuckets) {
      for (const o of b.orphans) {
        if (selected.has(fileKey(o))) s += o.size;
      }
    }
    return s;
  }, [filteredBuckets, selected]);

  async function deleteSelection() {
    if (selected.size === 0) return;
    const confirmation = window.prompt(
      `Vous allez SUPPRIMER DEFINITIVEMENT ${selected.size} fichier(s) (${formatSize(selectedSize)}).\n\nTapez SUPPRIMER pour confirmer :`
    );
    if (confirmation !== 'SUPPRIMER') {
      toast.info('Suppression annulee');
      return;
    }

    setDeleting(true);
    try {
      const items = Array.from(selected).map((k) => {
        const [bucket, ...rest] = k.split('::');
        return { bucket: bucket || '', path: rest.join('::') };
      });

      // Batch par lots de 200 pour eviter les payloads enormes
      const BATCH = 200;
      let totalDeleted = 0;
      let totalSkipped = 0;
      for (let i = 0; i < items.length; i += BATCH) {
        const slice = items.slice(i, i + BATCH);
        const res = await fetch('/api/admin/storage/orphans', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: slice }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Erreur suppression');
        totalDeleted += json.deleted_count ?? 0;
        totalSkipped += json.skipped_count ?? 0;
      }

      toast.success(`${totalDeleted} fichier(s) supprime(s)${totalSkipped ? `, ${totalSkipped} ignore(s)` : ''}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur suppression');
    } finally {
      setDeleting(false);
    }
  }

  function exportCSV() {
    if (!data) return;
    const rows: string[] = ['bucket,path,size_bytes,mimetype,created_at,days_old'];
    for (const b of filteredBuckets) {
      for (const o of b.orphans) {
        const safePath = o.path.replace(/"/g, '""');
        rows.push(
          `"${o.bucket}","${safePath}",${o.size},"${o.mimetype ?? ''}","${o.created_at}",${o.days_old}`
        );
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orphans-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
        <p className="text-slate-400 text-sm">Analyse du stockage en cours...</p>
        <p className="text-slate-500 text-xs">Peut prendre 30-60 secondes selon la taille</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">Erreur de chargement</p>
        <button onClick={load} className="mt-4 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm">
          Reessayer
        </button>
      </div>
    );
  }

  const allFilteredKeys = filteredBuckets.flatMap((b) => b.orphans.map(fileKey));
  const allFilteredSelected = allFilteredKeys.length > 0 && allFilteredKeys.every((k) => selected.has(k));

  return (
    <div className="space-y-6">
      {/* En-tete */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <FileWarning className="h-6 w-6 text-amber-400" />
            Fichiers orphelins
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Fichiers presents dans le Storage mais non references en base de donnees.
          </p>
          <p className="text-slate-500 text-xs mt-0.5">
            Genere le {new Date(data.generated_at).toLocaleString('fr-FR')}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading || deleting}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors disabled:opacity-50"
          aria-label="Actualiser"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-5">
          <p className="text-3xl font-bold text-amber-400">{data.total_orphan_count.toLocaleString('fr-FR')}</p>
          <p className="text-sm text-slate-400 mt-1">Fichiers orphelins (total)</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-500/20 p-5">
          <p className="text-3xl font-bold text-rose-400">{formatSize(data.total_orphan_size)}</p>
          <p className="text-sm text-slate-400 mt-1">Espace recuperable</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-sky-500/10 to-sky-600/5 border border-sky-500/20 p-5">
          <p className="text-3xl font-bold text-sky-400">{data.buckets.length}</p>
          <p className="text-sm text-slate-400 mt-1">Bucket{data.buckets.length > 1 ? 's' : ''} analyse{data.buckets.length > 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filtres + actions */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-slate-700/50 bg-slate-800/30">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-300">Age :</span>
          {AGE_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setAgeFilter(f.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                ageFilter === f.id
                  ? 'bg-sky-500/30 text-sky-200 border border-sky-500/50'
                  : 'bg-slate-700/30 text-slate-400 hover:bg-slate-700/50 border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {filteredTotalCount.toLocaleString('fr-FR')} resultat{filteredTotalCount > 1 ? 's' : ''} ({formatSize(filteredTotalSize)})
          </span>
          <button
            onClick={exportCSV}
            disabled={filteredTotalCount === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-slate-300 border border-slate-600 hover:bg-slate-700/50 disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Barre de selection */}
      {filteredTotalCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-slate-700/50 bg-slate-900/50 sticky top-2 z-10 backdrop-blur-md">
          <button
            onClick={toggleSelectAllFiltered}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-slate-200 border border-slate-600 hover:bg-slate-700/50 transition-colors"
          >
            {allFilteredSelected ? <CheckSquare className="h-4 w-4 text-sky-400" /> : <Square className="h-4 w-4" />}
            {allFilteredSelected ? 'Tout deselectionner' : 'Tout selectionner'}
          </button>
          <span className="text-sm text-slate-400">
            {selected.size} selectionne{selected.size > 1 ? 's' : ''} ({formatSize(selectedSize)})
          </span>
          <button
            onClick={deleteSelection}
            disabled={selected.size === 0 || deleting}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Supprimer la selection
          </button>
        </div>
      )}

      {/* Avertissement */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-100/80 space-y-1">
          <p className="font-medium text-amber-200">Verification croisee Storage / Base de donnees</p>
          <p>
            Un fichier est marque comme orphelin si <strong>aucune ligne</strong> dans les tables suivantes ne le reference :
            <code className="text-xs ml-1">compagnies.logo_url</code>,
            <code className="text-xs ml-1">cartes_identite.(logo_url|photo_url)</code>,
            <code className="text-xs ml-1">alliances.logo_url</code>,
            <code className="text-xs ml-1">entreprises_reparation.logo_url</code>,
            <code className="text-xs ml-1">document_files.storage_path</code>,
            <code className="text-xs ml-1">instruction_notes_archives.storage_path</code>.
          </p>
          <p className="text-amber-200/70 text-xs mt-1">
            Une seconde verification est faite cote serveur avant la suppression effective.
          </p>
        </div>
      </div>

      {/* Liste par bucket */}
      {filteredBuckets.map((bucket) => (
        <div key={bucket.bucket} className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
          <div className="p-4 border-b border-slate-700/50 flex items-center gap-3 flex-wrap">
            <Database className="h-5 w-5 text-sky-400" />
            <h2 className="text-lg font-semibold text-slate-100">{bucket.bucket}</h2>
            <span className="text-xs text-slate-400">
              {bucket.referenced_count} reference{bucket.referenced_count > 1 ? 's' : ''} en DB
            </span>
            <span className="text-xs text-slate-500">|</span>
            <span className="text-xs text-amber-400">
              {bucket.orphans.length} orphelin{bucket.orphans.length > 1 ? 's' : ''} affiche{bucket.orphans.length > 1 ? 's' : ''}
            </span>
            <span className="ml-auto text-sm font-mono text-rose-400">
              {formatSize(bucket.orphans.reduce((s, o) => s + o.size, 0))}
            </span>
          </div>

          {bucket.orphans.length === 0 ? (
            <p className="p-6 text-center text-slate-500 text-sm">Aucun orphelin pour ce filtre.</p>
          ) : (
            <div className="divide-y divide-slate-700/40 max-h-[600px] overflow-y-auto">
              {bucket.orphans.map((o) => {
                const k = fileKey(o);
                const isSel = selected.has(k);
                const isImg = o.mimetype?.startsWith('image/') ?? false;
                return (
                  <div
                    key={k}
                    className={`flex items-center gap-3 px-4 py-2 hover:bg-slate-700/20 transition-colors ${
                      isSel ? 'bg-sky-500/5' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleSelect(o)}
                      className="flex-shrink-0"
                      aria-label={isSel ? 'Deselectionner' : 'Selectionner'}
                    >
                      {isSel ? (
                        <CheckSquare className="h-4 w-4 text-sky-400" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-500" />
                      )}
                    </button>
                    {isImg ? (
                      <ImageIcon className="h-4 w-4 text-violet-400 flex-shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
                    )}
                    <span className="text-sm text-slate-300 flex-1 truncate font-mono" title={o.path}>
                      {o.path}
                    </span>
                    <span className="text-xs text-slate-500 hidden sm:inline">{o.mimetype?.split('/')[1] || '?'}</span>
                    <span className="text-xs text-slate-500 w-20 text-right">
                      {o.days_old}j
                    </span>
                    <span className="text-sm font-mono text-amber-400 w-24 text-right">
                      {formatSize(o.size)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {data.total_orphan_count === 0 && (
        <div className="text-center py-12 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <p className="text-emerald-300 text-lg font-medium">Aucun fichier orphelin detecte</p>
          <p className="text-emerald-200/60 text-sm mt-1">Le stockage est propre.</p>
        </div>
      )}
    </div>
  );
}
