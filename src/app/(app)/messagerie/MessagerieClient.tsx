'use client';

import { useState, useMemo, useTransition, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox, Send, CreditCard, Mail, Trash2, Loader2, Plus, X,
  UserPlus, Check, XCircle, AlertTriangle, Banknote, CheckCheck,
  Reply, Forward, CheckSquare, Search, ArrowLeft, PenLine,
} from 'lucide-react';
import ChequeVisuel from '@/components/ChequeVisuel';
import MessageContent from '@/components/MessageContent';
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
  metadata?: {
    invitation_id?: string;
    compagnie_id?: string;
    compagnie_nom?: string;
    invitation_repondue?: boolean;
    sanction_id?: string;
    montant_amende?: number;
    amende_payee?: boolean;
  } | null;
  expediteur?: { identifiant: string } | { identifiant: string }[] | null;
  destinataire?: { identifiant: string } | { identifiant: string }[] | null;
}

interface Utilisateur { id: string; identifiant: string; }

interface Props {
  messagesRecus: Message[];
  messagesEnvoyes: Message[];
  utilisateurs: Utilisateur[];
  currentUserIdentifiant: string;
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

function avatar(name: string) {
  const letter = (name || '?')[0].toUpperCase();
  const colors = ['bg-violet-500/20 text-violet-300', 'bg-emerald-500/20 text-emerald-300', 'bg-sky-500/20 text-sky-300', 'bg-amber-500/20 text-amber-300', 'bg-rose-500/20 text-rose-300', 'bg-teal-500/20 text-teal-300'];
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${colors[idx]}`}>{letter}</div>;
}

type TabId = 'inbox' | 'recrutement' | 'cheques' | 'sanctions' | 'sent' | 'compose';

export default function MessagerieClient({ messagesRecus, messagesEnvoyes, utilisateurs, currentUserIdentifiant }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabId>('inbox');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);
  const [composeDestinataire, setComposeDestinataire] = useState('');
  const [composeTitre, setComposeTitre] = useState('');
  const [composeContenu, setComposeContenu] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [destSearch, setDestSearch] = useState('');
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);
  const destRef = useRef<HTMLDivElement>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const CHEQUE_TYPES = useMemo(() => ['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc', 'cheque_siavi_intervention', 'cheque_siavi_taxes'], []);
  const cheques = useMemo(() => messagesRecus.filter(m => CHEQUE_TYPES.includes(m.type_message)), [messagesRecus, CHEQUE_TYPES]);
  const invitations = useMemo(() => messagesRecus.filter(m => m.type_message === 'recrutement'), [messagesRecus]);
  const sanctions = useMemo(() => messagesRecus.filter(m => ['amende_ifsa', 'relance_amende'].includes(m.type_message)), [messagesRecus]);
  const messagesNormaux = useMemo(() => messagesRecus.filter(m => ![...CHEQUE_TYPES, 'recrutement', 'amende_ifsa', 'relance_amende'].includes(m.type_message)), [messagesRecus, CHEQUE_TYPES]);
  const [processingInvitation, setProcessingInvitation] = useState<string | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [processingAmende, setProcessingAmende] = useState<string | null>(null);
  const [amendeError, setAmendeError] = useState<string | null>(null);
  const [encaisserToutLoading, setEncaisserToutLoading] = useState(false);
  const [encaisserToutRecap, setEncaisserToutRecap] = useState<{ nb_cheques: number; total: number; par_compte: { label: string; nb: number; total: number }[] } | null>(null);
  const [markAllLoading, setMarkAllLoading] = useState(false);
  const filteredUtilisateurs = useMemo(() => { if (!destSearch.trim()) return utilisateurs; const q = destSearch.toLowerCase(); return utilisateurs.filter(u => u.identifiant.toLowerCase().includes(q)); }, [utilisateurs, destSearch]);
  const selectedDestName = useMemo(() => { if (!composeDestinataire) return ''; return utilisateurs.find(u => u.id === composeDestinataire)?.identifiant || ''; }, [composeDestinataire, utilisateurs]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) { if (destRef.current && !destRef.current.contains(e.target as Node)) setDestDropdownOpen(false); }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function currentTabMessages(): Message[] {
    switch (activeTab) {
      case 'inbox': return messagesNormaux;
      case 'recrutement': return invitations;
      case 'cheques': return cheques;
      case 'sanctions': return sanctions;
      case 'sent': return messagesEnvoyes;
      default: return [];
    }
  }

  const currentUnreadCount = useMemo(() => {
    if (activeTab === 'sent' || activeTab === 'compose') return 0;
    return currentTabMessages().filter(m => !m.lu).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, messagesNormaux, invitations, cheques, sanctions]);

  // ── Handlers ──

  async function handlePayerAmende(messageId: string, sanctionId: string) {
    if (!confirm('Confirmer le paiement de cette amende ?')) return;
    setProcessingAmende(messageId); setAmendeError(null);
    try {
      const res = await fetch('/api/ifsa/amendes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sanction_id: sanctionId }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Erreur');
      await fetch(`/api/messages/${messageId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'marquer_amende_payee' }) });
      if (selectedMessage?.id === messageId) setSelectedMessage({ ...selectedMessage, metadata: { ...selectedMessage.metadata, amende_payee: true } });
      startTransition(() => router.refresh());
    } catch (e) { setAmendeError(e instanceof Error ? e.message : 'Erreur'); } finally { setProcessingAmende(null); }
  }

  async function handleRepondreInvitation(messageId: string, invitationId: string, action: 'accepter' | 'refuser') {
    if (action === 'refuser' && !confirm('Refuser cette offre d\'emploi ?')) return;
    setProcessingInvitation(messageId); setInvitationError(null);
    try {
      const res = await fetch('/api/recrutement', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitation_id: invitationId, action }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Erreur');
      await fetch(`/api/messages/${messageId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'marquer_invitation_repondue' }) });
      if (selectedMessage?.id === messageId) setSelectedMessage({ ...selectedMessage, metadata: { ...selectedMessage.metadata, invitation_repondue: true } });
      startTransition(() => router.refresh());
    } catch (e) { setInvitationError(e instanceof Error ? e.message : 'Erreur'); } finally { setProcessingInvitation(null); }
  }

  async function handleMarkAsRead(id: string) {
    await fetch(`/api/messages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'marquer_lu' }) });
    startTransition(() => router.refresh());
  }

  const handleMarkAllAsRead = useCallback(async () => {
    const unread = currentTabMessages().filter(m => !m.lu);
    if (unread.length === 0) return;
    setMarkAllLoading(true);
    try {
      await Promise.all(unread.map(m => fetch(`/api/messages/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'marquer_lu' }) })));
      toast.success(`${unread.length} message${unread.length > 1 ? 's' : ''} marqué${unread.length > 1 ? 's' : ''} comme lu${unread.length > 1 ? 's' : ''}`);
      startTransition(() => router.refresh());
    } catch { toast.error('Erreur'); } finally { setMarkAllLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, messagesNormaux, invitations, cheques, sanctions, router, startTransition]);

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce message ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' }); const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setSelectedMessage(null); setMobileShowDetail(false); toast.success('Supprimé'); startTransition(() => router.refresh());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); } finally { setLoading(false); }
  }

  async function handleEncaisser(id: string) {
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'encaisser' }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (selectedMessage?.id === id) setSelectedMessage({ ...selectedMessage, cheque_encaisse: true });
      startTransition(() => router.refresh());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); }
  }

  async function handleEncaisserTout() {
    setEncaisserToutLoading(true);
    try {
      const res = await fetch('/api/messages/encaisser-tout', { method: 'POST' }); const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setEncaisserToutRecap(data);
      if (Array.isArray(data.erreurs_partielles) && data.erreurs_partielles.length > 0) toast.warning(`${data.erreurs_partielles.length} chèque(s) non encaissé(s).`);
      startTransition(() => router.refresh());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); } finally { setEncaisserToutLoading(false); }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault(); setComposeError(null);
    if (!composeDestinataire || !composeTitre.trim() || !composeContenu.trim()) { setComposeError('Tous les champs sont requis'); return; }
    setComposeSending(true);
    try {
      const res = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinataire_id: composeDestinataire, titre: composeTitre.trim(), contenu: composeContenu.trim() }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      const n = selectedDestName; setComposeDestinataire(''); setComposeTitre(''); setComposeContenu(''); setDestSearch('');
      toast.success(`Envoyé à ${n}`); setActiveTab('sent'); startTransition(() => router.refresh());
    } catch (e) { setComposeError(e instanceof Error ? e.message : 'Erreur'); } finally { setComposeSending(false); }
  }

  function selectMessage(msg: Message) { setSelectedMessage(msg); setMobileShowDetail(true); if (!msg.lu && msg.destinataire_id) handleMarkAsRead(msg.id); }
  function handleReply(msg: Message) { if (!msg.expediteur_id) return; setComposeDestinataire(msg.expediteur_id); setDestSearch(getIdentifiant(msg.expediteur)); setComposeTitre(msg.titre.startsWith('RE: ') ? msg.titre : `RE: ${msg.titre}`); setComposeContenu(''); setActiveTab('compose'); setMobileShowDetail(false); }
  function handleForward(msg: Message) { setComposeDestinataire(''); setDestSearch(''); setComposeTitre(msg.titre.startsWith('TR: ') ? msg.titre : `TR: ${msg.titre}`); setComposeContenu(`── Message transféré ──\nDe: ${getIdentifiant(msg.expediteur)}\n\n${msg.contenu}`); setActiveTab('compose'); setMobileShowDetail(false); }

  const tabs = [
    { id: 'inbox' as TabId, label: 'Réception', icon: Inbox, count: messagesNormaux.filter(m => !m.lu).length },
    { id: 'recrutement' as TabId, label: 'Recrutement', icon: UserPlus, count: invitations.filter(m => !m.lu).length },
    { id: 'cheques' as TabId, label: 'Chèques', icon: CreditCard, count: cheques.filter(m => !m.lu).length },
    { id: 'sanctions' as TabId, label: 'Sanctions', icon: AlertTriangle, count: sanctions.filter(m => !m.lu).length },
    { id: 'sent' as TabId, label: 'Envoyés', icon: Send, count: 0 },
    { id: 'compose' as TabId, label: 'Écrire', icon: PenLine, count: 0 },
  ];

  function typeBorderColor(msg: Message): string {
    if (CHEQUE_TYPES.includes(msg.type_message)) return 'border-l-emerald-500';
    if (msg.type_message === 'recrutement') return 'border-l-teal-500';
    if (['amende_ifsa', 'relance_amende'].includes(msg.type_message)) return 'border-l-red-500';
    return 'border-l-violet-500';
  }

  function badge(msg: Message) {
    if (CHEQUE_TYPES.includes(msg.type_message)) {
      return <span className={`text-[10px] px-1.5 py-0.5 rounded ${msg.cheque_encaisse ? 'bg-slate-700/50 text-slate-500' : 'bg-emerald-500/15 text-emerald-400'}`}>{msg.cheque_encaisse ? 'Encaissé' : `${msg.cheque_montant?.toLocaleString('fr-FR')} F$`}</span>;
    }
    if (msg.type_message === 'recrutement') return <span className={`text-[10px] px-1.5 py-0.5 rounded ${msg.metadata?.invitation_repondue ? 'bg-slate-700/50 text-slate-500' : 'bg-teal-500/15 text-teal-400'}`}>{msg.metadata?.invitation_repondue ? 'Répondu' : 'Offre'}</span>;
    if (['amende_ifsa', 'relance_amende'].includes(msg.type_message)) return <span className={`text-[10px] px-1.5 py-0.5 rounded ${msg.metadata?.amende_payee ? 'bg-slate-700/50 text-slate-500' : 'bg-red-500/15 text-red-400'}`}>{msg.metadata?.amende_payee ? 'Payée' : `${msg.metadata?.montant_amende?.toLocaleString('fr-FR')} F$`}</span>;
    return null;
  }

  // ── Render ──

  function renderMessageRow(msg: Message) {
    const isSent = activeTab === 'sent';
    const unread = !msg.lu && !isSent;
    const sel = selectedMessage?.id === msg.id;
    const name = isSent ? getIdentifiant(msg.destinataire) : getIdentifiant(msg.expediteur);
    return (
      <button key={msg.id} onClick={() => selectMessage(msg)}
        className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors border-l-2 ${
          sel ? `bg-violet-500/8 ${typeBorderColor(msg)}` : unread ? 'border-l-transparent bg-slate-800/30 hover:bg-slate-800/50' : 'border-l-transparent hover:bg-slate-800/30'
        }`}>
        {avatar(name)}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {unread && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />}
              <span className={`text-sm truncate ${unread ? 'font-semibold text-slate-100' : 'text-slate-400'}`}>{name}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-sm truncate ${unread ? 'text-slate-200' : 'text-slate-400'}`}>{msg.titre}</span>
              <span className="text-slate-600 shrink-0">—</span>
              <span className="text-xs text-slate-600 truncate">{truncate(msg.contenu, 50)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
            <span className={`text-[11px] ${unread ? 'text-violet-400 font-medium' : 'text-slate-600'}`}>{formatRelativeDate(msg.created_at)}</span>
            {badge(msg)}
          </div>
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
    const canReply = activeTab !== 'sent' && m.expediteur_id;
    const isNormal = m.type_message === 'normal';

    return (
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-800/60 shrink-0">
          <button onClick={() => { setMobileShowDetail(false); setSelectedMessage(null); }} className="p-2 rounded-lg hover:bg-slate-800/60 text-slate-400 lg:hidden"><ArrowLeft className="h-4 w-4" /></button>
          {canReply && <button onClick={() => handleReply(m)} className="p-2 rounded-lg hover:bg-slate-800/60 text-slate-400" title="Répondre"><Reply className="h-4 w-4" /></button>}
          {isNormal && <button onClick={() => handleForward(m)} className="p-2 rounded-lg hover:bg-slate-800/60 text-slate-400" title="Transférer"><Forward className="h-4 w-4" /></button>}
          {activeTab !== 'sent' && <button onClick={() => handleDelete(m.id)} disabled={loading} className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 disabled:opacity-50" title="Supprimer"><Trash2 className="h-4 w-4" /></button>}
          <div className="flex-1" />
          <button onClick={() => { setSelectedMessage(null); setMobileShowDetail(false); }} className="p-2 rounded-lg hover:bg-slate-800/60 text-slate-400 hidden lg:block"><X className="h-4 w-4" /></button>
        </div>

        {/* Header */}
        <div className={`px-6 py-4 border-b border-slate-800/40 border-l-4 ${typeBorderColor(m)} shrink-0`}>
          <h2 className="text-lg font-semibold text-slate-100 break-words">{m.titre}</h2>
          <div className="flex items-center gap-2 mt-2">
            {avatar(activeTab === 'sent' ? getIdentifiant(m.destinataire) : getIdentifiant(m.expediteur))}
            <div>
              <p className="text-sm text-slate-300">{activeTab === 'sent' ? `À : ${getIdentifiant(m.destinataire)}` : getIdentifiant(m.expediteur)}</p>
              <p className="text-xs text-slate-500">{formatDateTimeUTC(m.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {CHEQUE_TYPES.includes(m.type_message) && m.cheque_montant ? (
            <div className="space-y-5">
              <MessageContent className="text-slate-300 leading-relaxed" content={m.contenu} />
              <ChequeVisuel id={m.id} montant={m.cheque_montant} destinataire={currentUserIdentifiant}
                compagnieNom={m.cheque_compagnie_nom || undefined} numeroVol={m.cheque_numero_vol || undefined}
                libelle={m.cheque_libelle || undefined} date={m.created_at} encaisse={m.cheque_encaisse}
                pourCompagnie={m.cheque_pour_compagnie}
                onEncaisser={m.cheque_encaisse ? undefined : () => handleEncaisser(m.id)} />
            </div>
          ) : m.type_message === 'recrutement' ? (
            <div className="space-y-5">
              <MessageContent className="text-slate-300 leading-relaxed" content={m.contenu} />
              <div className="p-5 rounded-lg bg-teal-500/5 border border-teal-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-teal-500/15"><UserPlus className="h-5 w-5 text-teal-400" /></div>
                  <div><p className="font-semibold text-slate-100 text-sm">Offre d&apos;emploi</p><p className="text-xs text-teal-400">{m.metadata?.compagnie_nom || 'Compagnie'}</p></div>
                </div>
                {invitationError && <p className="text-red-400 text-xs mb-3">{invitationError}</p>}
                {m.metadata?.invitation_repondue ? (
                  <p className="text-sm text-slate-500 flex items-center gap-1.5"><Check className="h-4 w-4" />Répondu</p>
                ) : m.metadata?.invitation_id ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleRepondreInvitation(m.id, m.metadata!.invitation_id!, 'accepter')} disabled={processingInvitation === m.id} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5">{processingInvitation === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accepter</button>
                    <button onClick={() => handleRepondreInvitation(m.id, m.metadata!.invitation_id!, 'refuser')} disabled={processingInvitation === m.id} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5" />Refuser</button>
                  </div>
                ) : <p className="text-xs text-slate-500">Invitation expirée.</p>}
              </div>
            </div>
          ) : ['amende_ifsa', 'relance_amende'].includes(m.type_message) ? (
            <div className="space-y-5">
              <MessageContent className="text-slate-300 leading-relaxed" content={m.contenu} />
              <div className="p-5 rounded-lg bg-red-500/5 border border-red-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-red-500/15"><Banknote className="h-5 w-5 text-red-400" /></div>
                  <div><p className="font-semibold text-slate-100 text-sm">Amende IFSA</p><p className="text-xl font-bold text-red-400">{m.metadata?.montant_amende?.toLocaleString('fr-FR') || '?'} F$</p></div>
                </div>
                {amendeError && <p className="text-red-400 text-xs mb-3 p-2 bg-red-500/10 rounded">{amendeError}</p>}
                {m.metadata?.amende_payee ? (
                  <p className="text-sm text-emerald-400 flex items-center gap-1.5"><Check className="h-4 w-4" />Payée</p>
                ) : m.metadata?.sanction_id ? (
                  <button onClick={() => handlePayerAmende(m.id, m.metadata!.sanction_id!)} disabled={processingAmende === m.id} className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2">{processingAmende === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}Payer {m.metadata?.montant_amende?.toLocaleString('fr-FR')} F$</button>
                ) : <p className="text-xs text-slate-500">Infos de paiement indisponibles.</p>}
              </div>
            </div>
          ) : (
            <MessageContent className="text-slate-300 leading-relaxed" content={m.contenu} />
          )}
        </div>

        {/* Quick reply bar */}
        {isNormal && activeTab !== 'sent' && m.expediteur_id && (
          <div className="px-4 py-3 border-t border-slate-800/40 flex gap-2 shrink-0">
            <button onClick={() => handleReply(m)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-violet-300 hover:bg-violet-500/10 transition-colors"><Reply className="h-3.5 w-3.5" />Répondre</button>
            <button onClick={() => handleForward(m)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"><Forward className="h-3.5 w-3.5" />Transférer</button>
          </div>
        )}
      </div>
    );
  }

  function renderCompose() {
    return (
      <form onSubmit={handleSendMessage} className="h-full flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800/60 shrink-0">
          <h3 className="text-sm font-semibold text-slate-200">Nouveau message</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div ref={destRef} className="relative">
            <label className="text-xs text-slate-500 mb-1 block">À</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
              <input type="text" value={composeDestinataire ? selectedDestName : destSearch}
                onChange={e => { setDestSearch(e.target.value); setComposeDestinataire(''); setDestDropdownOpen(true); }}
                onFocus={() => setDestDropdownOpen(true)}
                placeholder="Rechercher…"
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 text-sm placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none" />
              {composeDestinataire && (
                <button type="button" onClick={() => { setComposeDestinataire(''); setDestSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"><X className="h-3 w-3" /></button>
              )}
            </div>
            {destDropdownOpen && !composeDestinataire && (
              <div className="absolute z-20 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 shadow-xl">
                {filteredUtilisateurs.length === 0 ? <p className="px-3 py-2 text-xs text-slate-600">Aucun résultat</p> : filteredUtilisateurs.slice(0, 50).map(u => (
                  <button key={u.id} type="button" onClick={() => { setComposeDestinataire(u.id); setDestSearch(u.identifiant); setDestDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-2">
                    {avatar(u.identifiant)}<span>{u.identifiant}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Objet</label>
            <input type="text" value={composeTitre} onChange={e => setComposeTitre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 text-sm placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none"
              placeholder="Sujet" required maxLength={200} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Message</label>
            <textarea value={composeContenu} onChange={e => setComposeContenu(e.target.value)} rows={8}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 text-sm placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none resize-none"
              placeholder="Votre message…" required maxLength={10000} />
          </div>
          {composeError && <p className="text-red-400 text-xs">{composeError}</p>}
        </div>
        <div className="px-4 py-3 border-t border-slate-800/60 shrink-0">
          <button type="submit" disabled={composeSending || !composeDestinataire}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-40">
            {composeSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Envoyer
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden" style={{ height: 'calc(100vh - 10rem)' }}>
      <div className="h-full flex">
        {/* Sidebar (desktop) / Tab bar (mobile) */}
        <div className={`${mobileShowDetail ? 'hidden lg:flex' : 'flex'} flex-col border-r border-slate-800/60 shrink-0`}>
          {/* Desktop sidebar */}
          <div className="hidden lg:flex flex-col w-48 h-full">
            <div className="py-2 space-y-0.5">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedMessage(null); setMobileShowDetail(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                    activeTab === tab.id ? 'bg-slate-800/60 text-slate-100 border-l-2 border-l-violet-500 pl-[14px]' : 'text-slate-400 hover:bg-slate-800/30 hover:text-slate-300 border-l-2 border-l-transparent pl-[14px]'
                  }`}>
                  <tab.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {tab.count > 0 && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-semibold">{tab.count}</span>}
                </button>
              ))}
            </div>
            {/* Actions */}
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
          {/* Mobile tab bar */}
          <div className="flex lg:hidden overflow-x-auto border-b border-slate-800/60">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSelectedMessage(null); setMobileShowDetail(false); }}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id ? 'border-b-violet-500 text-violet-300' : 'border-b-transparent text-slate-500 hover:text-slate-300'
                }`}>
                <tab.icon className="h-3.5 w-3.5" />
                {tab.count > 0 && <span className="px-1 rounded-full bg-violet-500/20 text-violet-300 text-[10px]">{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Message list */}
        <div className={`${mobileShowDetail ? 'hidden lg:flex' : 'flex'} flex-col flex-1 min-w-0 border-r border-slate-800/60 lg:max-w-md`}>
          {/* Mobile actions bar */}
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
                <span className="text-xs font-semibold text-emerald-300">{encaisserToutRecap.nb_cheques} chèque{encaisserToutRecap.nb_cheques > 1 ? 's' : ''}</span>
                <button onClick={() => setEncaisserToutRecap(null)} className="text-slate-500 hover:text-slate-300"><X className="h-3 w-3" /></button>
              </div>
              {encaisserToutRecap.par_compte.map((c, i) => (
                <div key={i} className="flex justify-between text-[11px]"><span className="text-slate-400">{c.label}</span><span className="text-emerald-400 font-medium">+{c.total.toLocaleString('fr-FR')} F$</span></div>
              ))}
              <div className="pt-1 border-t border-emerald-500/15 flex justify-between text-xs font-semibold"><span className="text-slate-200">Total</span><span className="text-emerald-300">{encaisserToutRecap.total.toLocaleString('fr-FR')} F$</span></div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'compose' ? renderCompose() : (
              currentTabMessages().length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600">
                  <Mail className="h-10 w-10 mb-2 opacity-20" />
                  <p className="text-xs">Aucun message</p>
                </div>
              ) : currentTabMessages().map(msg => renderMessageRow(msg))
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className={`${mobileShowDetail ? 'flex' : 'hidden lg:flex'} flex-col flex-1 min-w-0`}>
          {activeTab === 'compose' && !mobileShowDetail ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600">
              <PenLine className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-xs">Rédigez votre message</p>
            </div>
          ) : renderDetail()}
        </div>
      </div>
    </div>
  );
}
