'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Send, CreditCard, Mail, MailOpen, Trash2, Loader2, Plus, X, ChevronRight, UserPlus, Check, XCircle, AlertTriangle, Banknote } from 'lucide-react';
import ChequeVisuel from '@/components/ChequeVisuel';
import { formatDateShortUTC, formatDateTimeUTC } from '@/lib/date-utils';

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

interface Utilisateur {
  id: string;
  identifiant: string;
}

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

export default function MessagerieClient({ messagesRecus, messagesEnvoyes, utilisateurs, currentUserIdentifiant }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'inbox' | 'recrutement' | 'cheques' | 'sanctions' | 'sent' | 'compose'>('inbox');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);

  // Compose form
  const [composeDestinataire, setComposeDestinataire] = useState('');
  const [composeTitre, setComposeTitre] = useState('');
  const [composeContenu, setComposeContenu] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const cheques = messagesRecus.filter(m => ['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc'].includes(m.type_message));
  const invitations = messagesRecus.filter(m => m.type_message === 'recrutement');
  const sanctions = messagesRecus.filter(m => ['amende_ifsa', 'relance_amende'].includes(m.type_message));
  const messagesNormaux = messagesRecus.filter(m => !['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc', 'recrutement', 'amende_ifsa', 'relance_amende'].includes(m.type_message));
  
  // État pour suivre les invitations en cours de traitement
  const [processingInvitation, setProcessingInvitation] = useState<string | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  
  // État pour le paiement des amendes
  const [processingAmende, setProcessingAmende] = useState<string | null>(null);
  const [amendeError, setAmendeError] = useState<string | null>(null);

  async function handlePayerAmende(messageId: string, sanctionId: string) {
    if (!confirm('Confirmer le paiement de cette amende ?')) return;
    
    setProcessingAmende(messageId);
    setAmendeError(null);
    
    try {
      const res = await fetch('/api/ifsa/amendes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sanction_id: sanctionId })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      
      // Marquer le message comme traité
      await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'marquer_amende_payee' })
      });
      
      // Mettre à jour le message sélectionné
      if (selectedMessage?.id === messageId) {
        setSelectedMessage({
          ...selectedMessage,
          metadata: { ...selectedMessage.metadata, amende_payee: true }
        });
      }
      
      startTransition(() => router.refresh());
    } catch (e) {
      setAmendeError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setProcessingAmende(null);
    }
  }

  async function handleRepondreInvitation(messageId: string, invitationId: string, action: 'accepter' | 'refuser') {
    if (action === 'refuser' && !confirm('Êtes-vous sûr de vouloir refuser cette offre d\'emploi ?')) {
      return;
    }
    
    setProcessingInvitation(messageId);
    setInvitationError(null);
    
    try {
      const res = await fetch('/api/recrutement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: invitationId, action })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      
      // Marquer le message comme traité
      await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'marquer_invitation_repondue' })
      });
      
      // Mettre à jour le message sélectionné
      if (selectedMessage?.id === messageId) {
        setSelectedMessage({
          ...selectedMessage,
          metadata: { ...selectedMessage.metadata, invitation_repondue: true }
        });
      }
      
      startTransition(() => router.refresh());
    } catch (e) {
      setInvitationError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setProcessingInvitation(null);
    }
  }

  async function handleMarkAsRead(id: string) {
    await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'marquer_lu' })
    });
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce message ?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedMessage(null);
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleEncaisser(id: string) {
    const res = await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'encaisser' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    // Mettre à jour le selectedMessage immédiatement pour refléter l'encaissement
    if (selectedMessage && selectedMessage.id === id) {
      setSelectedMessage({ ...selectedMessage, cheque_encaisse: true });
    }
    
    startTransition(() => router.refresh());
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    setComposeError(null);
    if (!composeDestinataire || !composeTitre.trim() || !composeContenu.trim()) {
      setComposeError('Tous les champs sont requis');
      return;
    }

    setComposeSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinataire_id: composeDestinataire,
          titre: composeTitre.trim(),
          contenu: composeContenu.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setComposeDestinataire('');
      setComposeTitre('');
      setComposeContenu('');
      setActiveTab('sent');
      startTransition(() => router.refresh());
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setComposeSending(false);
    }
  }

  function selectMessage(msg: Message) {
    setSelectedMessage(msg);
    if (!msg.lu && msg.destinataire_id) {
      handleMarkAsRead(msg.id);
    }
  }

  const tabs = [
    { id: 'inbox', label: 'Boîte de réception', icon: Inbox, count: messagesNormaux.filter(m => !m.lu).length },
    { id: 'recrutement', label: 'Recrutement', icon: UserPlus, count: invitations.filter(m => !m.lu).length },
    { id: 'cheques', label: 'Chèques', icon: CreditCard, count: cheques.filter(m => !m.lu).length },
    { id: 'sanctions', label: 'Sanctions', icon: AlertTriangle, count: sanctions.filter(m => !m.lu).length },
    { id: 'sent', label: 'Envoyés', icon: Send, count: 0 },
    { id: 'compose', label: 'Nouveau', icon: Plus, count: 0 },
  ] as const;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Sidebar - Liste des messages */}
      <div className="lg:col-span-1 space-y-4">
        {/* Onglets */}
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedMessage(null); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Liste des messages */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden max-h-[600px] overflow-y-auto">
          {activeTab === 'compose' ? (
            <form onSubmit={handleSendMessage} className="p-4 space-y-4">
              <h3 className="font-semibold text-slate-200">Nouveau message</h3>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Destinataire</label>
                <select
                  value={composeDestinataire}
                  onChange={e => setComposeDestinataire(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-200"
                  required
                >
                  <option value="">-- Sélectionner --</option>
                  {utilisateurs.map(u => (
                    <option key={u.id} value={u.id}>{u.identifiant}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Sujet</label>
                <input
                  type="text"
                  value={composeTitre}
                  onChange={e => setComposeTitre(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Message</label>
                <textarea
                  value={composeContenu}
                  onChange={e => setComposeContenu(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-200"
                  required
                />
              </div>
              {composeError && <p className="text-red-400 text-sm">{composeError}</p>}
              <button
                type="submit"
                disabled={composeSending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-50"
              >
                {composeSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Envoyer
              </button>
            </form>
          ) : (
            <div className="divide-y divide-slate-700/30">
              {(activeTab === 'inbox' ? messagesNormaux : activeTab === 'recrutement' ? invitations : activeTab === 'cheques' ? cheques : activeTab === 'sanctions' ? sanctions : messagesEnvoyes).length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Aucun message</p>
                </div>
              ) : (
                (activeTab === 'inbox' ? messagesNormaux : activeTab === 'recrutement' ? invitations : activeTab === 'cheques' ? cheques : activeTab === 'sanctions' ? sanctions : messagesEnvoyes).map(msg => (
                  <button
                    key={msg.id}
                    onClick={() => selectMessage(msg)}
                    className={`w-full text-left p-4 hover:bg-slate-700/30 transition-colors ${
                      selectedMessage?.id === msg.id ? 'bg-slate-700/40' : ''
                    } ${!msg.lu && activeTab !== 'sent' ? 'bg-violet-500/5' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        {msg.lu || activeTab === 'sent' ? (
                          <MailOpen className="h-5 w-5 text-slate-500" />
                        ) : (
                          <Mail className="h-5 w-5 text-violet-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${!msg.lu && activeTab !== 'sent' ? 'font-semibold text-slate-200' : 'text-slate-400'}`}>
                            {activeTab === 'sent' 
                              ? `À: ${getIdentifiant(msg.destinataire)}`
                              : `De: ${getIdentifiant(msg.expediteur)}`
                            }
                          </p>
                          <span className="text-xs text-slate-500 shrink-0">
                            {formatDateShortUTC(msg.created_at)}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${!msg.lu && activeTab !== 'sent' ? 'text-slate-100' : 'text-slate-300'}`}>
                          {msg.titre}
                        </p>
                        {msg.type_message === 'cheque_salaire' && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${
                            msg.cheque_encaisse ? 'bg-slate-600/50 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {msg.cheque_encaisse ? 'Encaissé' : `${msg.cheque_montant?.toLocaleString('fr-FR')} F$ à encaisser`}
                          </span>
                        )}
                        {msg.type_message === 'cheque_revenu_compagnie' && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${
                            msg.cheque_encaisse ? 'bg-slate-600/50 text-slate-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {msg.cheque_encaisse ? 'Encaissé' : `${msg.cheque_montant?.toLocaleString('fr-FR')} F$ (compagnie)`}
                          </span>
                        )}
                        {msg.type_message === 'recrutement' && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${
                            msg.metadata?.invitation_repondue ? 'bg-slate-600/50 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {msg.metadata?.invitation_repondue ? 'Répondu' : '🎉 Offre d\'emploi'}
                          </span>
                        )}
                        {['amende_ifsa', 'relance_amende'].includes(msg.type_message) && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${
                            msg.metadata?.amende_payee ? 'bg-slate-600/50 text-slate-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {msg.metadata?.amende_payee ? '✅ Payée' : `💰 ${msg.metadata?.montant_amende?.toLocaleString('fr-FR') || ''} F$ à payer`}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contenu du message */}
      <div className="lg:col-span-2">
        {selectedMessage ? (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
            {/* Header du message */}
            <div className="p-4 border-b border-slate-700/50 bg-slate-800/50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">{selectedMessage.titre}</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    {activeTab === 'sent' 
                      ? `À: ${getIdentifiant(selectedMessage.destinataire)}`
                      : `De: ${getIdentifiant(selectedMessage.expediteur)}`
                    } • {formatDateTimeUTC(selectedMessage.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  {activeTab !== 'sent' && (
                    <button
                      onClick={() => handleDelete(selectedMessage.id)}
                      disabled={loading}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 disabled:opacity-50"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-6">
              {/* Si c'est un chèque, afficher le chèque visuel */}
              {['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc'].includes(selectedMessage.type_message) && selectedMessage.cheque_montant ? (
                <div className="space-y-6">
                  <p className="text-slate-300 whitespace-pre-wrap">{selectedMessage.contenu}</p>
                  <ChequeVisuel
                    id={selectedMessage.id}
                    montant={selectedMessage.cheque_montant}
                    destinataire={currentUserIdentifiant}
                    compagnieNom={selectedMessage.cheque_compagnie_nom || undefined}
                    numeroVol={selectedMessage.cheque_numero_vol || undefined}
                    libelle={selectedMessage.cheque_libelle || undefined}
                    date={selectedMessage.created_at}
                    encaisse={selectedMessage.cheque_encaisse}
                    pourCompagnie={selectedMessage.cheque_pour_compagnie}
                    onEncaisser={selectedMessage.cheque_encaisse ? undefined : () => handleEncaisser(selectedMessage.id)}
                  />
                </div>
              ) : selectedMessage.type_message === 'recrutement' ? (
                <div className="space-y-6">
                  <p className="text-slate-300 whitespace-pre-wrap">{selectedMessage.contenu}</p>
                  
                  {/* Carte d'invitation */}
                  <div className="p-6 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-emerald-500/20">
                        <UserPlus className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">Offre d&apos;emploi</h3>
                        <p className="text-sm text-emerald-400">{selectedMessage.metadata?.compagnie_nom || 'Compagnie'}</p>
                      </div>
                    </div>
                    
                    {invitationError && (
                      <p className="text-red-400 text-sm mb-4">{invitationError}</p>
                    )}
                    
                    {selectedMessage.metadata?.invitation_repondue ? (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Check className="h-5 w-5" />
                        <span>Vous avez déjà répondu à cette invitation.</span>
                      </div>
                    ) : selectedMessage.metadata?.invitation_id ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => handleRepondreInvitation(
                            selectedMessage.id, 
                            selectedMessage.metadata!.invitation_id!, 
                            'accepter'
                          )}
                          disabled={processingInvitation === selectedMessage.id}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          {processingInvitation === selectedMessage.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Accepter l&apos;offre
                        </button>
                        <button
                          onClick={() => handleRepondreInvitation(
                            selectedMessage.id, 
                            selectedMessage.metadata!.invitation_id!, 
                            'refuser'
                          )}
                          disabled={processingInvitation === selectedMessage.id}
                          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Refuser
                        </button>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-sm">Cette invitation n&apos;est plus valide.</p>
                    )}
                  </div>
                </div>
              ) : ['amende_ifsa', 'relance_amende'].includes(selectedMessage.type_message) ? (
                <div className="space-y-6">
                  <p className="text-slate-300 whitespace-pre-wrap">{selectedMessage.contenu}</p>
                  
                  {/* Carte d'amende */}
                  <div className="p-6 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/30">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-red-500/20">
                        <Banknote className="h-6 w-6 text-red-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">Amende IFSA</h3>
                        <p className="text-2xl font-bold text-red-400">
                          {selectedMessage.metadata?.montant_amende?.toLocaleString('fr-FR') || '???'} F$
                        </p>
                      </div>
                    </div>
                    
                    {amendeError && (
                      <p className="text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">{amendeError}</p>
                    )}
                    
                    {selectedMessage.metadata?.amende_payee ? (
                      <div className="flex items-center gap-2 text-emerald-400 p-3 bg-emerald-500/10 rounded-lg">
                        <Check className="h-5 w-5" />
                        <span>Cette amende a été payée.</span>
                      </div>
                    ) : selectedMessage.metadata?.sanction_id ? (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-400">
                          Cliquez sur le bouton ci-dessous pour payer cette amende. Le montant sera débité de votre compte.
                        </p>
                        <button
                          onClick={() => handlePayerAmende(
                            selectedMessage.id, 
                            selectedMessage.metadata!.sanction_id!
                          )}
                          disabled={processingAmende === selectedMessage.id}
                          className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          {processingAmende === selectedMessage.id ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Banknote className="h-5 w-5" />
                          )}
                          Payer {selectedMessage.metadata?.montant_amende?.toLocaleString('fr-FR')} F$
                        </button>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-sm">Aucune information de paiement disponible.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-slate-300 whitespace-pre-wrap">{selectedMessage.contenu}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-12 text-center">
            <Mail className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">Sélectionnez un message pour le lire</p>
          </div>
        )}
      </div>
    </div>
  );
}
