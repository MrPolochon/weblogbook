import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Mail, Send, Inbox, CreditCard, ArrowLeft, UserPlus } from 'lucide-react';
import Link from 'next/link';
import MessagerieClient from './MessagerieClient';

export default async function MessageriePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Récupérer les messages reçus
  const { data: messagesRecus } = await admin.from('messages')
    .select('*, expediteur:profiles!expediteur_id(identifiant)')
    .eq('destinataire_id', user.id)
    .order('created_at', { ascending: false });

  // Récupérer les messages envoyés
  const { data: messagesEnvoyes } = await admin.from('messages')
    .select('*, destinataire:profiles!destinataire_id(identifiant)')
    .eq('expediteur_id', user.id)
    .order('created_at', { ascending: false });

  // Récupérer tous les utilisateurs pour le compose
  const { data: utilisateurs } = await admin.from('profiles')
    .select('id, identifiant')
    .neq('id', user.id)
    .order('identifiant');

  // Récupérer le profil pour savoir si c'est un pilote
  const { data: profile } = await supabase.from('profiles').select('identifiant').eq('id', user.id).single();

  // Compter les chèques non encaissés
  const chequesNonEncaisses = (messagesRecus || []).filter(
    m => ['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc'].includes(m.type_message) && !m.cheque_encaisse
  );

  // Compter les invitations non répondues
  const invitationsEnAttente = (messagesRecus || []).filter(
    m => m.type_message === 'recrutement' && !(m.metadata as { invitation_repondue?: boolean } | null)?.invitation_repondue
  );

  // Compter les messages non lus
  const messagesNonLus = (messagesRecus || []).filter(m => !m.lu);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-violet-700 to-purple-800 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="relative flex items-center gap-4">
          <Link href="/logbook" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <Mail className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Messagerie</h1>
            <p className="text-violet-100/80 text-sm">Vos messages et chèques à encaisser</p>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-400/80 text-sm">Messages non lus</p>
              <p className="text-2xl font-bold text-blue-400">{messagesNonLus.length}</p>
            </div>
            <Inbox className="h-8 w-8 text-blue-400/30" />
          </div>
        </div>
        {invitationsEnAttente.length > 0 && (
          <div className="rounded-xl bg-gradient-to-br from-teal-500/10 to-teal-600/5 border border-teal-500/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-teal-400/80 text-sm">Recrutement</p>
                <p className="text-2xl font-bold text-teal-400">{invitationsEnAttente.length}</p>
              </div>
              <UserPlus className="h-8 w-8 text-teal-400/30" />
            </div>
          </div>
        )}
        <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-400/80 text-sm">Chèques à encaisser</p>
              <p className="text-2xl font-bold text-emerald-400">{chequesNonEncaisses.length}</p>
            </div>
            <CreditCard className="h-8 w-8 text-emerald-400/30" />
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-violet-400/80 text-sm">Messages envoyés</p>
              <p className="text-2xl font-bold text-violet-400">{(messagesEnvoyes || []).length}</p>
            </div>
            <Send className="h-8 w-8 text-violet-400/30" />
          </div>
        </div>
      </div>

      {/* Client component pour gérer les onglets et interactions */}
      <MessagerieClient 
        messagesRecus={messagesRecus || []}
        messagesEnvoyes={messagesEnvoyes || []}
        utilisateurs={utilisateurs || []}
        currentUserIdentifiant={profile?.identifiant || ''}
      />
    </div>
  );
}
