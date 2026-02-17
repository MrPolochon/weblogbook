'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Send, CreditCard, Mail, MailOpen, Trash2, Loader2, Plus, X, ChevronRight } from 'lucide-react';
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

export default function MessagerieSiaviClient({ messagesRecus, messagesEnvoyes, utilisateurs, currentUserIdentifiant }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'inbox' | 'cheques' | 'sent' | 'compose'>('cheques');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);

  const [composeDestinataire, setComposeDestinataire] = useState('');
  const [composeTitre, setComposeTitre] = useState('');
  const [composeContenu, setComposeContenu] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const cheques = messagesRecus.filter(m => ['cheque_salaire', 'cheque_siavi_intervention', 'cheque_siavi_taxes'].includes(m.type_message));
  const messagesNormaux = messagesRecus.filter(m => !['cheque_salaire', 'cheque_siavi_intervention', 'cheque_siavi_taxes'].includes(m.type_message));

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
    { id: 'cheques', label: 'Chèques', icon: CreditCard, count: cheques.filter(m => !m.cheque_encaisse).length },
    { id: 'inbox', label: 'Boîte de réception', icon: Inbox, count: messagesNormaux.filter(m => !m.lu).length },
    { id: 'sent', label: 'Envoyés', icon: Send, count: 0 },
    { id: 'compose', label: 'Nouveau', icon: Plus, count: 0 },
  ] as const;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedMessage(null); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-white text-red-700 hover:bg-red-100 border border-red-200'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden max-h-[600px] overflow-y-auto">
          {activeTab === 'compose' ? (
            <form onSubmit={handleSendMessage} className="p-4 space-y-4">
              <h3 className="font-semibold text-red-900">Nouveau message</h3>
              <div>
                <label className="block text-sm text-red-700 mb-1">Destinataire</label>
                <select
                  value={composeDestinataire}
                  onChange={e => setComposeDestinataire(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-red-200 text-slate-800 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  required
                >
                  <option value="">-- Sélectionner --</option>
                  {utilisateurs.map(u => (
                    <option key={u.id} value={u.id}>{u.identifiant}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-red-700 mb-1">Sujet</label>
                <input
                  type="text"
                  value={composeTitre}
                  onChange={e => setComposeTitre(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-red-200 text-slate-800 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-red-700 mb-1">Message</label>
                <textarea
                  value={composeContenu}
                  onChange={e => setComposeContenu(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-red-200 text-slate-800 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  required
                />
              </div>
              {composeError && <p className="text-red-700 text-sm">{composeError}</p>}
              <button
                type="submit"
                disabled={composeSending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50"
              >
                {composeSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Envoyer
              </button>
            </form>
          ) : (
            <div className="divide-y divide-red-100">
              {(activeTab === 'inbox' ? messagesNormaux : activeTab === 'cheques' ? cheques : messagesEnvoyes).length === 0 ? (
                <div className="p-8 text-center text-red-400">
                  <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Aucun message</p>
                </div>
              ) : (
                (activeTab === 'inbox' ? messagesNormaux : activeTab === 'cheques' ? cheques : messagesEnvoyes).map(msg => (
                  <button
                    key={msg.id}
                    onClick={() => selectMessage(msg)}
                    className={`w-full text-left p-4 hover:bg-red-50 transition-colors ${
                      selectedMessage?.id === msg.id ? 'bg-red-100' : ''
                    } ${!msg.lu && activeTab !== 'sent' ? 'bg-amber-50' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        {msg.lu || activeTab === 'sent' ? (
                          <MailOpen className="h-5 w-5 text-red-400" />
                        ) : (
                          <Mail className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${!msg.lu && activeTab !== 'sent' ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
                            {activeTab === 'sent' 
                              ? `À: ${getIdentifiant(msg.destinataire)}`
                              : `De: ${getIdentifiant(msg.expediteur)}`
                            }
                          </p>
                          <span className="text-xs text-red-400 shrink-0">
                            {formatDateShortUTC(msg.created_at)}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${!msg.lu && activeTab !== 'sent' ? 'text-slate-700' : 'text-slate-600'}`}>
                          {msg.titre}
                        </p>
                        {msg.type_message === 'cheque_siavi_intervention' && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                            msg.cheque_encaisse ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {msg.cheque_encaisse ? 'Encaissé' : `${msg.cheque_montant?.toLocaleString('fr-FR')} F$ intervention`}
                          </span>
                        )}
                        {msg.type_message === 'cheque_siavi_taxes' && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                            msg.cheque_encaisse ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {msg.cheque_encaisse ? 'Encaissé' : `${msg.cheque_montant?.toLocaleString('fr-FR')} F$ taxes`}
                          </span>
                        )}
                        {msg.type_message === 'cheque_salaire' && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                            msg.cheque_encaisse ? 'bg-slate-200 text-slate-500' : 'bg-sky-100 text-sky-700'
                          }`}>
                            {msg.cheque_encaisse ? 'Encaissé' : `${msg.cheque_montant?.toLocaleString('fr-FR')} F$ salaire`}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-red-300 shrink-0" />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {selectedMessage ? (
          <div className="rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b border-red-100 bg-red-50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-red-900">{selectedMessage.titre}</h2>
                  <p className="text-sm text-red-600 mt-1">
                    {activeTab === 'sent' 
                      ? `À: ${getIdentifiant(selectedMessage.destinataire)}`
                      : `De: ${getIdentifiant(selectedMessage.expediteur)}`
                    } • {formatDateTimeUTC(selectedMessage.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="p-2 rounded-lg hover:bg-red-200 text-red-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  {activeTab !== 'sent' && (
                    <button
                      onClick={() => handleDelete(selectedMessage.id)}
                      disabled={loading}
                      className="p-2 rounded-lg hover:bg-red-100 text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6">
              {['cheque_salaire', 'cheque_siavi_intervention', 'cheque_siavi_taxes'].includes(selectedMessage.type_message) && selectedMessage.cheque_montant ? (
                <div className="space-y-6">
                  <p className="text-slate-700 whitespace-pre-wrap">{selectedMessage.contenu}</p>
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
              ) : (
                <p className="text-slate-700 whitespace-pre-wrap">{selectedMessage.contenu}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-red-200 bg-white shadow-sm p-12 text-center">
            <Mail className="h-16 w-16 text-red-300 mx-auto mb-4" />
            <p className="text-red-500">Sélectionnez un message pour le lire</p>
          </div>
        )}
      </div>
    </div>
  );
}
