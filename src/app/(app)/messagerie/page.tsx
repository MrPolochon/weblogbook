import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import Link from 'next/link';
import MessagerieClient from './MessagerieClient';

export default async function MessageriePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const [recusResult, envoyesResult, utilisateursResult, profileResult] = await Promise.all([
    admin.from('messages')
      .select('*, expediteur:profiles!expediteur_id(identifiant)')
      .eq('destinataire_id', user.id)
      .order('created_at', { ascending: false }),
    admin.from('messages')
      .select('*, destinataire:profiles!destinataire_id(identifiant)')
      .eq('expediteur_id', user.id)
      .order('created_at', { ascending: false }),
    admin.from('profiles')
      .select('id, identifiant')
      .neq('id', user.id)
      .order('identifiant'),
    supabase.from('profiles').select('identifiant').eq('id', user.id).single(),
  ]);

  const messagesRecus = recusResult.data || [];
  const messagesEnvoyes = envoyesResult.data || [];
  const utilisateurs = utilisateursResult.data || [];
  const profile = profileResult.data;

  const nonLus = messagesRecus.filter(m => !m.lu).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/logbook" className="p-2 rounded-lg hover:bg-slate-800/60 transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-slate-400" />
          <h1 className="text-xl font-semibold text-slate-100">Messagerie</h1>
          {nonLus > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-xs font-semibold">
              {nonLus} non lu{nonLus > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <MessagerieClient
        messagesRecus={messagesRecus}
        messagesEnvoyes={messagesEnvoyes}
        utilisateurs={utilisateurs}
        currentUserIdentifiant={profile?.identifiant || ''}
      />
    </div>
  );
}
