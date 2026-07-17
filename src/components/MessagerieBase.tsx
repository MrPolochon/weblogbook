'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Inbox, Send, CreditCard, Mail, Trash2, Loader2, X,
  CheckCheck, CheckSquare, Search, ArrowLeft, PenLine,
  Megaphone, User, Reply,
} from 'lucide-react';
import ChequeVisuel from '@/components/ChequeVisuel';
import MessageContent from '@/components/MessageContent';
import UserAvatar from '@/components/UserAvatar';
import BroadcastAudienceSelector, { BroadcastAudience, audienceLabel } from '@/components/BroadcastAudienceSelector';
import { formatDateTimeUTC } from '@/lib/date-utils';
import { toast } from 'sonner';

interface Message {
  id: string;
  expediteur_id: string | null;
  destinataire_id: string;
  titre: string;
  contenu: string;
  lu: boolean;
  created_at: string;
  type_message: string;
  cheque_montant: number | null;
  cheque_encaisse: boolean;
  cheque_libelle: string | null;
  cheque_numero_vol: string | null;
  cheque_compagnie_nom: string | null;
  cheque_pour_compagnie: boolean;
  expediteur?: { identifiant: string } | { identifiant: string }[] | null;
  destinataire?: { identifiant: string } | { identifiant: string }[] | null;
}

interface Utilisateur { id: string; identifiant: string; }

export type ColorTheme = 'emerald' | 'blue' | 'orange' | 'violet';

interface ThemeConfig {
  iconBg: string;
  iconColor: string;
  tabActiveBorder: string;
  tabActiveText: string;
  sidebarActiveBorderL: string;
  msgBorderL: string;
  unreadDot: string;
  unreadDate: string;
  tabBadge: string;
  sendBtn: string;
  selBg: string;
  totalUnreadBg: string;
  totalUnreadDot: string;
  totalUnreadText: string;
  replyBtn: string;
}

const THEMES: Record<ColorTheme, ThemeConfig> = {
  emerald: {
    iconBg: 'bg-emerald-500/15 border-emerald-500/20',
    iconColor: 'text-emerald-400',
    tabActiveBorder: 'border-b-emerald-500',
    tabActiveText: 'text-emerald-300',
    sidebarActiveBorderL: 'border-l-emerald-500',
    msgBorderL: 'border-l-emerald-500',
    unreadDot: 'bg-emerald-400',
    unreadDate: 'text-emerald-400',
    tabBadge: 'bg-emerald-500/20 text-emerald-300',
    sendBtn: 'bg-emerald-600 hover:bg-emerald-700',
    selBg: 'bg-emerald-500/10',
    totalUnreadBg: 'bg-emerald-500/10 border-emerald-500/20',
    totalUnreadDot: 'bg-emerald-400',
    totalUnreadText: 'text-emerald-300',
    replyBtn: 'hover:text-emerald-300 hover:bg-emerald-500/10',
  },
  blue: {
    iconBg: 'bg-blue-500/15 border-blue-500/20',
    iconColor: 'text-blue-400',
    tabActiveBorder: 'border-b-blue-500',
    tabActiveText: 'text-blue-300',
    sidebarActiveBorderL: 'border-l-blue-500',
    msgBorderL: 'border-l-blue-500',
    unreadDot: 'bg-blue-400',
    unreadDate: 'text-blue-400',
    tabBadge: 'bg-blue-500/20 text-blue-300',
    sendBtn: 'bg-blue-600 hover:bg-blue-700',
    selBg: 'bg-blue-500/10',
    totalUnreadBg: 'bg-blue-500/10 border-blue-500/20',
    totalUnreadDot: 'bg-blue-400',
    totalUnreadText: 'text-blue-300',
    replyBtn: 'hover:text-blue-300 hover:bg-blue-500/10',
  },
  orange: {
    iconBg: 'bg-orange-500/15 border-orange-500/20',
    iconColor: 'text-orange-400',
    tabActiveBorder: 'border-b-orange-500',
    tabActiveText: 'text-orange-300',
    sidebarActiveBorderL: 'border-l-orange-500',
    msgBorderL: 'border-l-orange-500',
    unreadDot: 'bg-orange-400',
    unreadDate: 'text-orange-400',
    tabBadge: 'bg-orange-500/20 text-orange-300',
    sendBtn: 'bg-orange-600 hover:bg-orange-700',
    selBg: 'bg-orange-500/10',
    totalUnreadBg: 'bg-orange-500/10 border-orange-500/20',
    totalUnreadDot: 'bg-orange-400',
    totalUnreadText: 'text-orange-300',
    replyBtn: 'hover:text-orange-300 hover:bg-orange-500/10',
  },
  violet: {
    iconBg: 'bg-violet-500/15 border-violet-500/20',
    iconColor: 'text-violet-400',
    tabActiveBorder: 'border-b-violet-500',
    tabActiveText: 'text-violet-300',
    sidebarActiveBorderL: 'border-l-violet-500',
    msgBorderL: 'border-l-violet-500',
    unreadDot: 'bg-violet-400',
    unreadDate: 'text-violet-400',
    tabBadge: 'bg-violet-500/20 text-violet-300',
    sendBtn: 'bg-violet-600 hover:bg-violet-700',
    selBg: 'bg-violet-500/10',
    totalUnreadBg: 'bg-violet-500/10 border-violet-500/20',
    totalUnreadDot: 'bg-violet-400',
    totalUnreadText: 'text-violet-300',
    replyBtn: 'hover:text-violet-300 hover:bg-violet-500/10',
  },
};

export interface MessagerieBaseProps {
  messagesRecus: Message[];
  messagesEnvoyes: Message[];
  utilisateurs: Utilisateur[];
  currentUserIdentifiant: string;
  isAdmin?: boolean;
  colorTheme: ColorTheme;
  title: string;
  chequeTypes: string[];
  photoByIdentifiant?: Record<string, string | null>;
}

function getIdentifiant(obj: { identifiant: string } | { identifiant: string }[] | null | undefined): string {
  if (!obj) return 'Système';
  if (Array.isArray(obj)) return obj[0]?.identifiant || 'Système';
  return obj.identifiant || 'Système';
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1) return 'À l\'instant';
  if (diffMin < 60) return `${diffMin} min`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD === 1) return 'Hier';
  if (diffD < 7) return `${diffD}j`;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  if (d.getUTCFullYear() === now.getUTCFullYear()) return `${day} ${months[d.getUTCMonth()]}`;
  return `${day}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\n/g, ' ').trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max) + '…';
}

function sortByUnread(msgs: Message[]): Message[] {
  return [...msgs].sort((a, b) => {
    if (!a.lu && b.lu) return -1;
    if (a.lu && !b.lu) return 1;
    return 0;
  });
}

type TabId = 'inbox' | 'cheques' | 'sent' | 'compose';

export default function MessagerieBase({
  messagesRecus,
  messagesEnvoyes,
  utilisateurs,
  currentUserIdentifiant,
  isAdmin = false,
  colorTheme,
  title,
  chequeTypes,
  photoByIdentifiant = {},
}: MessagerieBaseProps) {
  const th = THEMES[colorTheme];

  const [localRecus, setLocalRecus] = useState<Message[]>(messagesRecus);
  const [localEnvoyes, setLocalEnvoyes] = useState<Message[]>(messagesEnvoyes);
  const [activeTab, setActiveTab] = useState<TabId>('inbox');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const [composeDestinataire, setComposeDestinataire] = useState('');
  const [composeTitre, setComposeTitre] = useState('');
  const [composeContenu, setComposeContenu] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [destSearch, setDestSearch] = useState('');
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<'individuel' | 'diffusion'>('individuel');
  const [broadcastAudience, setBroadcastAudience] = useState<BroadcastAudience | null>(null);
  const destRef = useRef<HTMLDivElement>(null);

  const [encaisserToutLoading, setEncaisserToutLoading] = useState(false);
  const [encaisserToutRecap, setEncaisserToutRecap] = useState<{
    nb_cheques: number; total: number; par_compte: { label: string; nb: number; total: number }[];
  } | null>(null);
  const [markAllLoading, setMarkAllLoading] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (destRef.current && !destRef.current.contains(e.target as Node)) setDestDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cheques = useMemo(() => localRecus.filter(m => chequeTypes.includes(m.type_message)), [localRecus, chequeTypes]);
  const messagesNormaux = useMemo(() => localRecus.filter(m => !chequeTypes.includes(m.type_message)), [localRecus, chequeTypes]);

  const tabMessages = useMemo((): Message[] => {
    switch (activeTab) {
      case 'inbox': return sortByUnread(messagesNormaux);
      case 'cheques': return sortByUnread(cheques);
      case 'sent': return localEnvoyes;
      default: return [];
    }
  }, [activeTab, messagesNormaux, cheques, localEnvoyes]);

  const currentUnreadCount = useMemo(() => {
    if (activeTab === 'sent' || activeTab === 'compose') return 0;
    return tabMessages.filter(m => !m.lu).length;
  }, [activeTab, tabMessages]);

  const filteredUtilisateurs = useMemo(() => {
    if (!destSearch.trim()) return utilisateurs;
    const q = destSearch.toLowerCase();
    return utilisateurs.filter(u => u.identifiant.toLowerCase().includes(q));
  }, [utilisateurs, destSearch]);

  const selectedDestName = useMemo(() => {
    if (!composeDestinataire) return '';
    return utilisateurs.find(u => u.id === composeDestinataire)?.identifiant || '';
  }, [composeDestinataire, utilisateurs]);

  const totalUnread = useMemo(() => localRecus.filter(m => !m.lu).length, [localRecus]);

  const patchLocal = useCallback((id: string, patch: Partial<Message>) => {
    setLocalRecus(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    setLocalEnvoyes(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    setSelectedMessage(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  }, []);

  const removeLocal = useCallback((id: string) => {
    setLocalRecus(prev => prev.filter(m => m.id !== id));
    setLocalEnvoyes(prev => prev.filter(m => m.id !== id));
    setSelectedMessage(prev => prev?.id === id ? null : prev);
  }, []);

  async function handleMarkAsRead(id: string) {
    patchLocal(id, { lu: true });
    await new Promise<void>(r => setTimeout(r, 500));
    const res = await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'marquer_lu' }),
    });
    if (!res.ok) {
      patchLocal(id, { lu: false });
      console.error('[MESSAGERIE] Erreur marquage lu:', await res.text());
    }
  }

  const handleMarkAllAsRead = useCallback(async () => {
    const unread = tabMessages.filter(m => !m.lu);
    if (unread.length === 0) return;
    setMarkAllLoading(true);
    unread.forEach(m => patchLocal(m.id, { lu: true }));
    try {
      const res = await fetch('/api/messages/marquer-tout-lu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unread.map(m => m.id) }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`${unread.length} message${unread.length > 1 ? 's' : ''} marqué${unread.length > 1 ? 's' : ''} comme lu${unread.length > 1 ? 's' : ''}`);
    } catch {
      unread.forEach(m => patchLocal(m.id, { lu: false }));
      toast.error('Erreur marquage lu');
    } finally {
      setMarkAllLoading(false);
    }
  }, [tabMessages, patchLocal]);

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce message ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      removeLocal(id);
      setMobileShowDetail(false);
      toast.success('Supprimé');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleEncaisser(id: string) {
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'encaisser' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      patchLocal(id, { cheque_encaisse: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur encaissement');
    }
  }

  async function handleEncaisserTout() {
    setEncaisserToutLoading(true);
    try {
      const res = await fetch('/api/messages/encaisser-tout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEncaisserToutRecap(data);
      cheques.filter(c => !c.cheque_encaisse).forEach(c => patchLocal(c.id, { cheque_encaisse: true }));
      if (Array.isArray(data.erreurs_partielles) && data.erreurs_partielles.length > 0) {
        toast.warning(`${data.erreurs_partielles.length} chèque(s) non encaissé(s).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setEncaisserToutLoading(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    setComposeError(null);
    if (!composeTitre.trim() || !composeContenu.trim()) { setComposeError('Titre et contenu requis'); return; }
    const isBroadcast = isAdmin && composeMode === 'diffusion';
    if (!isBroadcast && !composeDestinataire) { setComposeError('Destinataire requis'); return; }
    if (isBroadcast && !broadcastAudience) { setComposeError('Sélectionnez une audience'); return; }
    setComposeSending(true);
    try {
      const payload = isBroadcast
        ? { broadcast_audience: broadcastAudience, titre: composeTitre.trim(), contenu: composeContenu.trim() }
        : { destinataire_id: composeDestinataire, titre: composeTitre.trim(), contenu: composeContenu.trim() };
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const destName = isBroadcast ? audienceLabel(broadcastAudience!) : selectedDestName;
      if (data.message) setLocalEnvoyes(prev => [data.message, ...prev]);
      setComposeDestinataire(''); setComposeTitre(''); setComposeContenu(''); setDestSearch('');
      setBroadcastAudience(null); setComposeMode('individuel');
      if (isBroadcast && data.recipients_count != null) {
        toast.success(`Diffusion envoyée à ${data.recipients_count} destinataire${data.recipients_count > 1 ? 's' : ''} (${destName})`);
      } else {
        toast.success(`Envoyé à ${destName}`);
      }
      setActiveTab('sent');
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setComposeSending(false);
    }
  }

  function selectMessage(msg: Message) {
    setSelectedMessage(msg);
    setMobileShowDetail(true);
    if (!msg.lu && msg.destinataire_id) handleMarkAsRead(msg.id);
  }

  function handleReply(msg: Message) {
    if (!msg.expediteur_id) return;
    setComposeDestinataire(msg.expediteur_id);
    setDestSearch(getIdentifiant(msg.expediteur));
    setComposeTitre(msg.titre.startsWith('RE: ') ? msg.titre : `RE: ${msg.titre}`);
    setComposeContenu('');
    setActiveTab('compose');
    setMobileShowDetail(false);
  }

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[] = [
    { id: 'inbox', label: 'Réception', icon: Inbox, count: messagesNormaux.filter(m => !m.lu).length },
    { id: 'cheques', label: 'Chèques', icon: CreditCard, count: cheques.filter(m => !m.cheque_encaisse).length },
    { id: 'sent', label: 'Envoyés', icon: Send, count: 0 },
    { id: 'compose', label: 'Écrire', icon: PenLine, count: 0 },
  ];

  function getMsgBorderColor(msg: Message): string {
    if (chequeTypes.includes(msg.type_message)) return th.msgBorderL;
    if (msg.type_message === 'broadcast') return 'border-l-amber-500';
    return th.msgBorderL;
  }

  function renderBadge(msg: Message) {
    if (chequeTypes.includes(msg.type_message)) {
      return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${msg.cheque_encaisse ? 'bg-slate-700/50 text-slate-500' : th.tabBadge}`}>
          {msg.cheque_encaisse ? 'Encaissé' : `${msg.cheque_montant?.toLocaleString('fr-FR')} F$`}
        </span>
      );
    }
    if (msg.type_message === 'broadcast') {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 inline-flex items-center gap-1">
          <Megaphone className="h-2.5 w-2.5" />Diffusion
        </span>
      );
    }
    return null;
  }

  function renderAvatar(name: string) {
    const photoUrl = photoByIdentifiant[name] ?? null;
    return <UserAvatar identifiant={name} photoUrl={photoUrl} size="md" />;
  }

  function renderMessageRow(msg: Message) {
    const isSent = activeTab === 'sent';
    const unread = !msg.lu && !isSent;
    const sel = selectedMessage?.id === msg.id;
    const name = isSent ? getIdentifiant(msg.destinataire) : getIdentifiant(msg.expediteur);
    return (
      <button key={msg.id} onClick={() => selectMessage(msg)}
        className={`w-full text-left flex items-center gap-2.5 px-3 sm:px-4 py-2.5 transition-colors border-l-2 ${
          sel ? `${th.selBg} ${getMsgBorderColor(msg)}` : unread ? 'border-l-transparent bg-slate-800/30 hover:bg-slate-800/50' : 'border-l-transparent hover:bg-slate-800/30'
        }`}>
        {renderAvatar(name)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {unread && <span className={`w-1.5 h-1.5 rounded-full ${th.unreadDot} shrink-0`} />}
              <span className={`text-sm truncate ${unread ? 'font-semibold text-slate-100' : 'text-slate-400'}`}>{name}</span>
            </div>
            <span className={`text-[11px] shrink-0 ${unread ? `${th.unreadDate} font-medium` : 'text-slate-600'}`}>
              {formatRelativeDate(msg.created_at)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 mt-0.5 min-w-0">
            <span className={`text-xs truncate flex-1 min-w-0 ${unread ? 'text-slate-200' : 'text-slate-400'}`}>{msg.titre}</span>
            <div className="shrink-0">{renderBadge(msg)}</div>
          </div>
          <span className="text-[11px] text-slate-600 truncate block mt-0.5">{truncate(msg.contenu, 80)}</span>
        </div>
      </button>
    );
  }

  function renderDetail() {
    if (!selectedMessage) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-600">
          <Mail className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Sélectionnez un message</p>
        </div>
      );
    }
    const m = selectedMessage;
    const canReply = activeTab !== 'sent' && !!m.expediteur_id;

    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-800/60 shrink-0">
          <button onClick={() => { setMobileShowDetail(false); setSelectedMessage(null); }}
            className="p-2 rounded-lg hover:bg-slate-800/60 text-slate-400 lg:hidden">
            <ArrowLeft className="h-4 w-4" />
          </button>
          {canReply && (
            <button onClick={() => handleReply(m)}
              className={`p-2 rounded-lg ${th.replyBtn} text-slate-400 transition-colors`}
              title="Répondre">
              <Reply className="h-4 w-4" />
            </button>
          )}
          {activeTab !== 'sent' && (
            <button onClick={() => handleDelete(m.id)} disabled={loading}
              className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 disabled:opacity-50"
              title="Supprimer">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => { setSelectedMessage(null); setMobileShowDetail(false); }}
            className="p-2 rounded-lg hover:bg-slate-800/60 text-slate-400 hidden lg:block">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800/40 border-l-4 ${getMsgBorderColor(m)} shrink-0`}>
          <h2 className="text-base sm:text-lg font-semibold text-slate-100 break-words">{m.titre}</h2>
          <div className="flex items-center gap-2 mt-2">
            {renderAvatar(activeTab === 'sent' ? getIdentifiant(m.destinataire) : getIdentifiant(m.expediteur))}
            <div>
              <p className="text-sm text-slate-300">
                {activeTab === 'sent' ? `À : ${getIdentifiant(m.destinataire)}` : getIdentifiant(m.expediteur)}
              </p>
              <p className="text-xs text-slate-500">{formatDateTimeUTC(m.created_at)}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {chequeTypes.includes(m.type_message) && m.cheque_montant ? (
            <div className="space-y-5">
              <MessageContent className="text-slate-300 leading-relaxed" content={m.contenu} />
              <ChequeVisuel
                id={m.id}
                montant={m.cheque_montant}
                destinataire={currentUserIdentifiant}
                compagnieNom={m.cheque_compagnie_nom || undefined}
                numeroVol={m.cheque_numero_vol || undefined}
                libelle={m.cheque_libelle || undefined}
                date={m.created_at}
                encaisse={m.cheque_encaisse}
                pourCompagnie={m.cheque_pour_compagnie}
                onEncaisser={m.cheque_encaisse ? undefined : () => handleEncaisser(m.id)}
              />
            </div>
          ) : (
            <MessageContent className="text-slate-300 leading-relaxed" content={m.contenu} />
          )}
        </div>

        {canReply && (
          <div className="px-4 py-3 border-t border-slate-800/40 flex gap-2 shrink-0">
            <button onClick={() => handleReply(m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 ${th.replyBtn} transition-colors`}>
              <Reply className="h-3.5 w-3.5" />Répondre
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderCompose() {
    const isBroadcast = isAdmin && composeMode === 'diffusion';
    const canSend = composeTitre.trim() && composeContenu.trim() && (isBroadcast ? !!broadcastAudience : !!composeDestinataire);
    return (
      <form onSubmit={handleSendMessage} className="h-full flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800/60 shrink-0 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Nouveau message</h3>
          {isAdmin && (
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-800/60">
              <button type="button" onClick={() => setComposeMode('individuel')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  composeMode === 'individuel' ? `${th.sendBtn} text-white` : 'text-slate-400 hover:text-slate-200'
                }`}>
                <User className="h-3 w-3" />Individuel
              </button>
              <button type="button" onClick={() => setComposeMode('diffusion')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  composeMode === 'diffusion' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}>
                <Megaphone className="h-3 w-3" />Diffusion
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isBroadcast ? (
            <div>
              <label className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
                <Megaphone className="h-3 w-3 text-amber-400" />Diffuser à
              </label>
              <BroadcastAudienceSelector value={broadcastAudience} onChange={setBroadcastAudience} />
              {broadcastAudience && (
                <p className="text-xs text-slate-400 mt-2 pl-1">
                  Le message sera envoyé à <strong className="text-amber-300">{audienceLabel(broadcastAudience)}</strong>.
                </p>
              )}
            </div>
          ) : (
            <div ref={destRef} className="relative">
              <label className="text-xs text-slate-500 mb-1 block">À</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
                <input type="text"
                  value={composeDestinataire ? selectedDestName : destSearch}
                  onChange={e => { setDestSearch(e.target.value); setComposeDestinataire(''); setDestDropdownOpen(true); }}
                  onFocus={() => setDestDropdownOpen(true)}
                  placeholder="Rechercher…"
                  className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none"
                />
                {composeDestinataire && (
                  <button type="button" onClick={() => { setComposeDestinataire(''); setDestSearch(''); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {destDropdownOpen && !composeDestinataire && (
                <div className="absolute z-20 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 shadow-xl">
                  {filteredUtilisateurs.length === 0
                    ? <p className="px-3 py-2 text-xs text-slate-600">Aucun résultat</p>
                    : filteredUtilisateurs.slice(0, 50).map(u => (
                        <button key={u.id} type="button"
                          onClick={() => { setComposeDestinataire(u.id); setDestSearch(u.identifiant); setDestDropdownOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-2">
                          {renderAvatar(u.identifiant)}
                          <span>{u.identifiant}</span>
                        </button>
                      ))
                  }
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Objet</label>
            <input type="text" value={composeTitre} onChange={e => setComposeTitre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none"
              placeholder="Sujet" required maxLength={200} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Message</label>
            <textarea value={composeContenu} onChange={e => setComposeContenu(e.target.value)} rows={8}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none resize-none"
              placeholder="Votre message…" required maxLength={10000} />
          </div>
          {composeError && <p className="text-red-400 text-xs">{composeError}</p>}
        </div>
        <div className="px-4 py-3 border-t border-slate-800/60 shrink-0">
          <button type="submit" disabled={composeSending || !canSend}
            className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-40 ${
              isBroadcast ? 'bg-amber-600 hover:bg-amber-700' : th.sendBtn
            }`}>
            {composeSending ? <Loader2 className="h-4 w-4 animate-spin" /> : (isBroadcast ? <Megaphone className="h-4 w-4" /> : <Send className="h-4 w-4" />)}
            {isBroadcast ? 'Diffuser' : 'Envoyer'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${th.iconBg}`}>
            <Mail className={`h-5 w-5 ${th.iconColor}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{title}</h1>
            <p className="text-xs text-slate-500">Communications internes</p>
          </div>
        </div>
        {totalUnread > 0 && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${th.totalUnreadBg}`}>
            <span className={`w-2 h-2 rounded-full ${th.totalUnreadDot} animate-pulse`} />
            <span className={`text-sm font-medium ${th.totalUnreadText}`}>
              {totalUnread} non lu{totalUnread > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden flex flex-col"
        style={{ height: 'calc(100dvh - 12rem)' }}>

        {!mobileShowDetail && (
          <div className="flex lg:hidden overflow-x-auto border-b border-slate-800/60 shrink-0 scrollbar-none snap-x">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedMessage(null); setMobileShowDetail(false); }}
                className={`flex items-center gap-1 px-3 py-2.5 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 snap-start ${
                  activeTab === tab.id ? `${th.tabActiveBorder} ${th.tabActiveText}` : 'border-b-transparent text-slate-500 hover:text-slate-300'
                }`}>
                <tab.icon className="h-3.5 w-3.5 shrink-0" />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`ml-1 px-1.5 rounded-full text-[10px] font-bold ${th.tabBadge}`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          <div className="hidden lg:flex flex-col border-r border-slate-800/60 shrink-0">
            <div className="flex flex-col w-48 h-full">
              <div className="py-2 space-y-0.5">
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedMessage(null); setMobileShowDetail(false); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                      activeTab === tab.id
                        ? `bg-slate-800/60 text-slate-100 border-l-2 ${th.sidebarActiveBorderL} pl-[14px]`
                        : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-300 border-l-2 border-l-transparent pl-[14px]'
                    }`}>
                    <tab.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tab.label}</span>
                    {tab.count > 0 && (
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${th.tabBadge}`}>{tab.count}</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-auto px-3 py-3 space-y-2 border-t border-slate-800/40">
                {currentUnreadCount > 0 && (
                  <button onClick={handleMarkAllAsRead} disabled={markAllLoading}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-colors disabled:opacity-50">
                    {markAllLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckSquare className="h-3 w-3" />}
                    Tout marquer lu
                  </button>
                )}
                {activeTab === 'cheques' && cheques.filter(c => !c.cheque_encaisse).length >= 2 && (
                  <button onClick={handleEncaisserTout} disabled={encaisserToutLoading}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50">
                    {encaisserToutLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                    Tout encaisser
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className={`${mobileShowDetail ? 'hidden' : 'flex'} lg:flex flex-col flex-1 min-w-0 border-r border-slate-800/60 lg:max-w-md`}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/40 lg:hidden">
              {currentUnreadCount > 0 && (
                <button onClick={handleMarkAllAsRead} disabled={markAllLoading} className="text-[11px] text-slate-500 flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" />Lu
                </button>
              )}
            </div>

            {encaisserToutRecap && (
              <div className="mx-3 mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-300">
                    {encaisserToutRecap.nb_cheques} chèque{encaisserToutRecap.nb_cheques > 1 ? 's' : ''}
                  </span>
                  <button onClick={() => setEncaisserToutRecap(null)} className="text-slate-500 hover:text-slate-300">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {encaisserToutRecap.par_compte.map((c, i) => (
                  <div key={i} className="flex justify-between text-[11px]">
                    <span className="text-slate-400">{c.label}</span>
                    <span className="text-emerald-400 font-medium">+{c.total.toLocaleString('fr-FR')} F$</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-emerald-500/15 flex justify-between text-xs font-semibold">
                  <span className="text-slate-200">Total</span>
                  <span className="text-emerald-300">{encaisserToutRecap.total.toLocaleString('fr-FR')} F$</span>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {activeTab === 'compose' ? renderCompose() : (
                tabMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    <Mail className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-xs">Aucun message</p>
                  </div>
                ) : tabMessages.map(msg => renderMessageRow(msg))
              )}
            </div>
          </div>

          <div className={`${mobileShowDetail ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0`}>
            {activeTab === 'compose' && !mobileShowDetail ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600">
                <PenLine className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-xs">Rédigez votre message</p>
              </div>
            ) : renderDetail()}
          </div>
        </div>
      </div>
    </div>
  );
}
