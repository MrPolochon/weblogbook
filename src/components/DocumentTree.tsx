'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FolderOpen, FolderClosed, FileText, File, Image, Download,
  FileSpreadsheet, FileArchive, ChevronRight, ChevronDown,
} from 'lucide-react';

type DocFile = { id: string; nom_original: string; taille_bytes: number | null; created_at: string };
type Section = { id: string; nom: string; ordre: number; parent_id: string | null; document_files?: DocFile[] };
type TreeNode = Section & { children: TreeNode[] };

type ThemeType = 'dark' | 'light' | 'red';

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getFileIcon(name: string, theme: ThemeType) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const isDark = theme === 'dark';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return <Image className={`h-5 w-5 ${isDark ? 'text-pink-400' : 'text-pink-500'}`} />;
  if (['pdf'].includes(ext)) return <FileText className={`h-5 w-5 ${isDark ? 'text-red-400' : 'text-red-500'}`} />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className={`h-5 w-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive className={`h-5 w-5 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />;
  if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return <FileText className={`h-5 w-5 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />;
  return <File className="h-5 w-5 text-slate-400" />;
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

const themeConfig = {
  dark: {
    folderIcon: 'text-sky-400',
    folderText: 'text-slate-200',
    folderCount: 'text-slate-500',
    folderHover: 'hover:bg-slate-700/40',
    chevron: 'text-slate-500',
    fileText: 'text-slate-300 group-hover:text-sky-400',
    fileSize: 'text-slate-500',
    downloadIcon: 'text-slate-600 group-hover:text-sky-400',
    fileHover: 'hover:bg-slate-700/30',
  },
  light: {
    folderIcon: 'text-sky-600',
    folderText: 'text-slate-800',
    folderCount: 'text-slate-400',
    folderHover: 'hover:bg-sky-50',
    chevron: 'text-slate-400',
    fileText: 'text-slate-700 group-hover:text-sky-700',
    fileSize: 'text-slate-400',
    downloadIcon: 'text-slate-300 group-hover:text-sky-600',
    fileHover: 'hover:bg-sky-50',
  },
  red: {
    folderIcon: 'text-red-600',
    folderText: 'text-red-800',
    folderCount: 'text-slate-400',
    folderHover: 'hover:bg-red-50',
    chevron: 'text-slate-400',
    fileText: 'text-slate-700 group-hover:text-red-700',
    fileSize: 'text-slate-400',
    downloadIcon: 'text-slate-300 group-hover:text-red-600',
    fileHover: 'hover:bg-red-50',
  },
};

export default function DocumentTree({ sections, theme = 'dark' }: { sections: Section[]; theme?: ThemeType }) {
  const tree = buildTree(sections);
  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <FolderNodeView key={node.id} node={node} depth={0} theme={theme} />
      ))}
    </div>
  );
}

function FolderNodeView({ node, depth, theme }: { node: TreeNode; depth: number; theme: ThemeType }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const files = node.document_files || [];
  const totalFileCount = countAllFiles(node);
  const tc = themeConfig[theme];
  const indent = depth * 20;

  return (
    <div>
      {/* Folder header */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${tc.folderHover}`}
        style={{ paddingLeft: `${12 + indent}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <button type="button" className={`p-0.5 ${tc.chevron} shrink-0`}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {expanded ? <FolderOpen className={`h-5 w-5 ${tc.folderIcon} shrink-0`} /> : <FolderClosed className={`h-5 w-5 ${tc.folderIcon} shrink-0`} />}
        <span className={`font-semibold text-sm ${tc.folderText}`}>{node.nom}</span>
        <span className={`text-xs ${tc.folderCount}`}>
          {totalFileCount > 0 ? `${totalFileCount} fichier(s)` : 'vide'}
        </span>
      </div>

      {/* Content */}
      {expanded && (
        <div style={{ paddingLeft: `${indent}px` }}>
          {/* Files */}
          {files.length > 0 && (
            <ul className="ml-6">
              {files.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/api/documents/download/${f.id}`}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${tc.fileHover}`}
                    style={{ paddingLeft: `${20 + indent}px` }}
                  >
                    {getFileIcon(f.nom_original, theme)}
                    <span className={`text-sm font-medium flex-1 truncate transition-colors ${tc.fileText}`}>
                      {f.nom_original}
                    </span>
                    {f.taille_bytes ? (
                      <span className={`text-xs shrink-0 ${tc.fileSize}`}>{formatSize(f.taille_bytes)}</span>
                    ) : null}
                    <Download className={`h-4 w-4 transition-colors shrink-0 ${tc.downloadIcon}`} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Sub-folders */}
          {node.children.map((child) => (
            <FolderNodeView key={child.id} node={child} depth={depth + 1} theme={theme} />
          ))}
        </div>
      )}
    </div>
  );
}
