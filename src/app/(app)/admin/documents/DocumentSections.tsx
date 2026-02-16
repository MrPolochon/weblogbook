'use client';

import { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderOpen, FolderPlus, FileText, Plus, Pencil, Trash2, Upload, X,
  ChevronRight, ChevronDown as ChevronDownIcon, File, Image, FileSpreadsheet,
  FileArchive, Loader2, FolderClosed, Move,
} from 'lucide-react';

type DocFile = { id: string; nom_original: string; taille_bytes: number | null; created_at: string };
type Section = { id: string; nom: string; ordre: number; parent_id: string | null; document_files?: DocFile[] };
type TreeNode = Section & { children: TreeNode[] };

/* ── Pick context ────────────────────────────────────── */
type PickState = {
  pickedId: string | null;
  pickedName: string;
  cursorPos: { x: number; y: number };
  holdingId: string | null;
  holdProgress: number;
};
type PickActions = {
  startHold: (id: string) => void;
  cancelHold: () => void;
  cancelPick: () => void;
  dropInto: (targetId: string | null) => void;
};
const PickCtx = createContext<PickState & PickActions>({
  pickedId: null, pickedName: '', cursorPos: { x: 0, y: 0 },
  holdingId: null, holdProgress: 0,
  startHold: () => {}, cancelHold: () => {}, cancelPick: () => {}, dropInto: () => {},
});

const HOLD_DURATION = 600; // ms to fill the bar

/* ── Helpers ─────────────────────────────────────────── */
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
  try { return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
}

function buildTree(sections: Section[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const s of sections) map.set(s.id, { ...s, children: [] });
  for (const s of sections) {
    const node = map.get(s.id)!;
    if (s.parent_id && map.has(s.parent_id)) {
      map.get(s.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.ordre - b.ordre);
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);
  return roots;
}

function countAllFiles(node: TreeNode): number {
  let count = node.document_files?.length || 0;
  for (const c of node.children) count += countAllFiles(c);
  return count;
}

function getAllDescendantIds(node: TreeNode): Set<string> {
  const ids = new Set<string>();
  ids.add(node.id);
  for (const c of node.children) {
    const childIds = getAllDescendantIds(c);
    childIds.forEach((id) => ids.add(id));
  }
  return ids;
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

/* ── Main component ──────────────────────────────────── */
export default function DocumentSections({ sections }: { sections: Section[] }) {
  const router = useRouter();
  const tree = buildTree(sections);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);

  // Pick state
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState('');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  // Track cursor when picking
  useEffect(() => {
    if (!pickedId) return;
    const handler = (e: MouseEvent) => setCursorPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [pickedId]);

  // Right-click or Escape cancels pick
  useEffect(() => {
    if (!pickedId) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelPick(); };
    const handleRightClick = (e: MouseEvent) => { if (e.button === 2) { e.preventDefault(); cancelPick(); } };
    const handleContext = (e: MouseEvent) => { if (pickedId) e.preventDefault(); };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleRightClick);
    window.addEventListener('contextmenu', handleContext);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleRightClick);
      window.removeEventListener('contextmenu', handleContext);
    };
  }, [pickedId]);

  function startHold(id: string) {
    if (pickedId) return;
    const node = findNode(tree, id);
    if (!node) return;
    setHoldingId(id);
    setHoldProgress(0);
    holdStartRef.current = Date.now();

    const animate = () => {
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(1, elapsed / HOLD_DURATION);
      setHoldProgress(progress);
      if (progress >= 1) {
        setHoldingId(null);
        setPickedId(id);
        setPickedName(node.nom);
        setCursorPos({ x: 0, y: 0 });
        return;
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }

  function cancelHold() {
    setHoldingId(null);
    setHoldProgress(0);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }

  function cancelPick() {
    setPickedId(null);
    setPickedName('');
    cancelHold();
  }

  async function dropInto(targetId: string | null) {
    if (!pickedId) return;
    if (targetId === pickedId) { cancelPick(); return; }

    // Prevent dropping into a descendant
    if (targetId) {
      const pickedNode = findNode(tree, pickedId);
      if (pickedNode) {
        const descendants = getAllDescendantIds(pickedNode);
        if (descendants.has(targetId)) { cancelPick(); return; }
      }
    }

    const movingId = pickedId;
    cancelPick();

    try {
      const res = await fetch(`/api/documents/sections/${movingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ move: true, parent_id: targetId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Erreur de déplacement');
      }
      router.refresh();
    } catch {
      alert('Erreur réseau');
    }
  }

  // Click outside folders = drop to root or cancel
  function handleBackgroundClick() {
    if (pickedId) {
      dropInto(null);
    }
  }

  async function handleCreateRoot(e: React.FormEvent) {
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

  const totalFiles = sections.reduce((sum, s) => sum + (s.document_files?.length || 0), 0);

  return (
    <PickCtx.Provider value={{ pickedId, pickedName, cursorPos, holdingId, holdProgress, startHold, cancelHold, cancelPick, dropInto }}>
      <div className="space-y-6" onClick={handleBackgroundClick}>
        {/* Stats */}
        <div className="flex items-center gap-6 text-sm text-slate-400" onClick={(e) => e.stopPropagation()}>
          <span className="flex items-center gap-1.5"><FolderOpen className="h-4 w-4 text-sky-400" /> {sections.length} dossier(s)</span>
          <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-sky-400" /> {totalFiles} fichier(s)</span>
        </div>

        {/* Pick banner */}
        {pickedId && (
          <div className="flex items-center gap-3 px-4 py-3 bg-sky-600 text-white rounded-lg shadow-lg animate-in" onClick={(e) => e.stopPropagation()}>
            <Move className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">
              Dossier <strong className="font-bold">{pickedName}</strong> sélectionné — cliquez sur un dossier pour l&apos;y déplacer, ou cliquez ailleurs pour le mettre à la racine. Clic droit / Échap pour annuler.
            </span>
            <button type="button" onClick={cancelPick} className="ml-auto p-1.5 hover:bg-white/20 rounded"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Create root folder */}
        <form onSubmit={handleCreateRoot} className="flex gap-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            className="flex-1 max-w-sm bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-sky-500 transition-colors"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nouveau dossier racine…"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            disabled={loading || !newName.trim()}
          >
            <FolderPlus className="h-4 w-4" /> Créer
          </button>
        </form>

        {/* Tree */}
        {tree.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-700/50 rounded-xl">
            <FolderOpen className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Aucun dossier</p>
            <p className="text-slate-500 text-sm mt-1">Créez un dossier pour organiser vos documents.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {tree.map((node) => (
              <FolderNode key={node.id} node={node} depth={0} />
            ))}
          </div>
        )}
      </div>

      {/* Floating folder that follows cursor */}
      {pickedId && cursorPos.x > 0 && (
        <div
          className="fixed pointer-events-none z-[100]"
          style={{ left: cursorPos.x + 16, top: cursorPos.y - 12 }}
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-sky-600 text-white rounded-lg shadow-2xl text-sm font-semibold opacity-90">
            <FolderOpen className="h-4 w-4" />
            {pickedName}
          </div>
        </div>
      )}
    </PickCtx.Provider>
  );
}

/* ── Recursive folder node ───────────────────────────── */
function FolderNode({ node, depth }: { node: TreeNode; depth: number }) {
  const router = useRouter();
  const pick = useContext(PickCtx);
  const [expanded, setExpanded] = useState(depth < 1);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(node.nom);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showNewSub, setShowNewSub] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const files = node.document_files || [];
  const hasChildren = node.children.length > 0;
  const hasContent = files.length > 0 || hasChildren;
  const totalFileCount = countAllFiles(node);
  const isHolding = pick.holdingId === node.id;
  const isPicked = pick.pickedId === node.id;
  const isDropTarget = pick.pickedId && pick.pickedId !== node.id;

  const refresh = useCallback(() => router.refresh(), [router]);

  async function handleRename() {
    if (!editName.trim()) return;
    setLoading(true);
    try {
      await fetch(`/api/documents/sections/${node.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: editName.trim() }),
      });
      setEditingName(false);
      refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const msg = hasContent
      ? `Supprimer le dossier « ${node.nom} » et tout son contenu (${totalFileCount} fichier(s), ${node.children.length} sous-dossier(s)) ?`
      : `Supprimer le dossier vide « ${node.nom} » ?`;
    if (!confirm(msg)) return;
    setLoading(true);
    try {
      await fetch(`/api/documents/sections/${node.id}`, { method: 'DELETE' });
      refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm('Supprimer ce fichier ?')) return;
    setLoading(true);
    try {
      await fetch(`/api/documents/files/${fileId}`, { method: 'DELETE' });
      refresh();
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(file: globalThis.File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('section_id', node.id);
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Erreur upload');
        return;
      }
      setShowUpload(false);
      refresh();
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateSub(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubName.trim()) return;
    setLoading(true);
    try {
      await fetch('/api/documents/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: newSubName.trim(), parent_id: node.id }),
      });
      setNewSubName('');
      setShowNewSub(false);
      setExpanded(true);
      refresh();
    } finally {
      setLoading(false);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  function handleFolderClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (pick.pickedId) {
      pick.dropInto(node.id);
      return;
    }
    setExpanded(!expanded);
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if (pick.pickedId) return;
    if (editingName) return;
    pick.startHold(node.id);
  }

  function handleMouseUp() {
    if (pick.holdingId === node.id) {
      pick.cancelHold();
    }
  }

  function handleMouseLeave() {
    if (pick.holdingId === node.id) {
      pick.cancelHold();
    }
  }

  const indent = depth * 20;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={(e) => { e.stopPropagation(); setDragOver(false); }}
      onDrop={handleFileDrop}
    >
      {/* Folder header */}
      <div
        className={`relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all group select-none overflow-hidden
          ${isPicked ? 'opacity-40 scale-95' : ''}
          ${isDropTarget ? 'hover:ring-2 hover:ring-sky-400 hover:bg-sky-500/15' : 'hover:bg-slate-700/40'}
          ${dragOver ? 'bg-sky-500/10 ring-1 ring-sky-500/40' : ''}
        `}
        style={{ paddingLeft: `${12 + indent}px` }}
        onClick={handleFolderClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Hold progress bar */}
        {isHolding && (
          <div
            className="absolute inset-y-0 left-0 bg-sky-500/25 transition-none"
            style={{ width: `${pick.holdProgress * 100}%` }}
          />
        )}

        {/* Expand/collapse */}
        <button
          type="button"
          className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors shrink-0 relative z-10"
          onClick={(e) => { e.stopPropagation(); if (!pick.pickedId) setExpanded(!expanded); }}
        >
          {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Icon */}
        {expanded ? <FolderOpen className="h-5 w-5 text-sky-400 shrink-0 relative z-10" /> : <FolderClosed className="h-5 w-5 text-sky-400 shrink-0 relative z-10" />}

        {/* Name */}
        {editingName ? (
          <div className="flex items-center gap-2 flex-1 relative z-10" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              className="flex-1 max-w-xs bg-slate-900 border border-sky-500 rounded px-2 py-1 text-sm text-slate-200 outline-none"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingName(false); }}
              autoFocus
            />
            <button type="button" className="px-2 py-1 bg-sky-600 text-white text-xs rounded hover:bg-sky-700" onClick={handleRename} disabled={loading}>OK</button>
            <button type="button" className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setEditingName(false)}>Annuler</button>
          </div>
        ) : (
          <>
            <span className="font-semibold text-slate-200 text-sm truncate relative z-10">{node.nom}</span>
            <span className="text-xs text-slate-500 shrink-0 relative z-10">
              {totalFileCount > 0 ? `${totalFileCount} fichier(s)` : 'vide'}
            </span>
          </>
        )}

        {/* Actions */}
        {!editingName && !pick.pickedId && (
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity relative z-10" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { setShowNewSub(true); setExpanded(true); }} className="p-1.5 text-slate-500 hover:text-sky-400 rounded hover:bg-slate-700/50" title="Créer un sous-dossier">
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => { setShowUpload(true); setExpanded(true); }} className="p-1.5 text-slate-500 hover:text-sky-400 rounded hover:bg-slate-700/50" title="Ajouter un fichier">
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => { setEditingName(true); setEditName(node.nom); }} className="p-1.5 text-slate-500 hover:text-sky-400 rounded hover:bg-slate-700/50" title="Renommer">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={handleDelete} disabled={loading} className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-slate-700/50" title="Supprimer">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Drop target indicator */}
        {isDropTarget && (
          <span className="ml-auto text-xs text-sky-400 font-medium relative z-10 shrink-0">Déplacer ici</span>
        )}
      </div>

      {/* Expanded content */}
      {expanded && !isPicked && (
        <div className="ml-3" style={{ paddingLeft: `${indent}px` }}>
          {/* New subfolder form */}
          {showNewSub && (
            <form onSubmit={handleCreateSub} className="flex items-center gap-2 px-3 py-2 ml-6" onClick={(e) => e.stopPropagation()}>
              <FolderPlus className="h-4 w-4 text-sky-400 shrink-0" />
              <input
                type="text"
                className="flex-1 max-w-xs bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-sky-500"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                placeholder="Nom du sous-dossier…"
                autoFocus
              />
              <button type="submit" className="px-3 py-1.5 bg-sky-600 text-white text-xs font-medium rounded hover:bg-sky-700" disabled={loading || !newSubName.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => { setShowNewSub(false); setNewSubName(''); }} className="text-slate-500 hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* Upload zone */}
          {showUpload && (
            <div className="flex items-center gap-3 px-3 py-2 ml-6" onClick={(e) => e.stopPropagation()}>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }}
                disabled={uploading}
                className="text-sm text-slate-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sky-600 file:text-white hover:file:bg-sky-700 file:cursor-pointer"
              />
              {uploading && <Loader2 className="h-4 w-4 text-sky-400 animate-spin" />}
              <button type="button" onClick={() => setShowUpload(false)} className="text-slate-500 hover:text-slate-300"><X className="h-4 w-4" /></button>
            </div>
          )}

          {/* Files */}
          {files.length > 0 && (
            <ul className="ml-6">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-1.5 group rounded hover:bg-slate-700/20" onClick={(e) => e.stopPropagation()}>
                  {getFileIcon(f.nom_original)}
                  <span className="text-sm text-slate-300 font-medium truncate flex-1">{f.nom_original}</span>
                  <span className="text-xs text-slate-500 shrink-0">{formatSize(f.taille_bytes)}</span>
                  <span className="text-xs text-slate-600 shrink-0">{formatDate(f.created_at)}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteFile(f.id)}
                    disabled={loading}
                    className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Sub-folders (recursive) */}
          {node.children.map((child) => (
            <FolderNode key={child.id} node={child} depth={depth + 1} />
          ))}

          {/* Drag indicator */}
          {dragOver && (
            <div className="mx-6 my-1 text-center py-3 border-2 border-dashed border-sky-500/50 rounded-lg bg-sky-500/5">
              <p className="text-sky-400 text-xs font-medium">Déposer le fichier ici</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
