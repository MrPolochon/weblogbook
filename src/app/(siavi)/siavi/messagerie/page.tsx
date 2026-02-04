import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Mail, Send, Inbox, CreditCard, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import MessagerieSiaviClient from './MessagerieSiaviClient';

export default async function MessagerieSiaviPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, siavi, identifiant').eq('id', user.id).single();
  const canSiavi = profile?.role === 'admin' || profile?.role === 'siavi' || profile?.siavi;
  if (!canSiavi) redirect('/logbook');

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

  // Compter les chèques non encaissés (salaires SIAVI)
  const chequesNonEncaisses = (messagesRecus || []).filter(
    m => ['cheque_salaire', 'cheque_siavi_intervention', 'cheque_siavi_taxes'].includes(m.type_message) && !m.cheque_encaisse
  );

  // Compter les messages non lus
  const messagesNonLus = (messagesRecus || []).filter(m => !m.lu);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-700 to-rose-800 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="relative flex items-center gap-4">
          <Link href="/siavi" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <Mail className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Messagerie SIAVI</h1>
            <p className="text-red-100/80 text-sm">Vos messages et chèques de service</p>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white/90 border border-red-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-700 text-sm font-medium">Messages non lus</p>
              <p className="text-2xl font-bold text-red-600">{messagesNonLus.length}</p>
            </div>
            <div className="p-2 rounded-lg bg-red-100">
              <Inbox className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white/90 border border-emerald-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-700 text-sm font-medium">Chèques à encaisser</p>
              <p className="text-2xl font-bold text-emerald-600">{chequesNonEncaisses.length}</p>
            </div>
            <div className="p-2 rounded-lg bg-emerald-100">
              <CreditCard className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white/90 border border-violet-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-violet-700 text-sm font-medium">Messages envoyés</p>
              <p className="text-2xl font-bold text-violet-600">{(messagesEnvoyes || []).length}</p>
            </div>
            <div className="p-2 rounded-lg bg-violet-100">
              <Send className="h-6 w-6 text-violet-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Client component */}
      <MessagerieSiaviClient 
        messagesRecus={messagesRecus || []}
        messagesEnvoyes={messagesEnvoyes || []}
        utilisateurs={utilisateurs || []}
        currentUserIdentifiant={profile?.identifiant || ''}
      />
    </div>
  );
}
