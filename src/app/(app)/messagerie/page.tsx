import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import Link from 'next/link';
import { getUserPhotosMap } from '@/lib/user-photos';
import MessagerieClient from './MessagerieClient';

export default async function MessageriePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Nettoyage auto : supprimer les messages système de plus d'1 mois (protège les chèques non encaissés)
  const unMoisAgo = new Date();
  unMoisAgo.setMonth(unMoisAgo.getMonth() - 1);
  admin.from('messages')
    .delete()
    .neq('type_message', 'normal')
    .lt('created_at', unMoisAgo.toISOString())
    .or('cheque_encaisse.is.null,cheque_encaisse.eq.true')
    .then(() => {});

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
    supabase.from('profiles').select('identifiant, role').eq('id', user.id).single(),
  ]);

  const messagesRecus = recusResult.data || [];
  const messagesEnvoyes = envoyesResult.data || [];
  const utilisateurs = utilisateursResult.data || [];
  const profile = profileResult.data;
  const isAdmin = profile?.role === 'admin';

  const nonLus = messagesRecus.filter(m => !m.lu).length;

  // Charge les photos officielles (carte d'identite) pour tous les contacts +
  // expediteurs/destinataires apparaissant dans les messages, indexees par
  // identifiant pour faciliter le rendu (on n'a pas toujours l'UUID cote UI).
  const allUserIds = new Set<string>();
  for (const u of utilisateurs) allUserIds.add(u.id);
  for (const m of messagesRecus) { if (m.expediteur_id) allUserIds.add(m.expediteur_id); }
  for (const m of messagesEnvoyes) { allUserIds.add(m.destinataire_id); }
  const photosByUser = await getUserPhotosMap(admin, Array.from(allUserIds));
  const identByUser = new Map<string, string>();
  for (const u of utilisateurs) identByUser.set(u.id, u.identifiant);
  const pickIdent = (rel: unknown): string | null => {
    if (!rel) return null;
    if (Array.isArray(rel)) return (rel[0] as { identifiant?: string } | undefined)?.identifiant ?? null;
    return (rel as { identifiant?: string }).identifiant ?? null;
  };
  for (const m of messagesRecus) {
    const ident = pickIdent(m.expediteur);
    if (m.expediteur_id && ident) identByUser.set(m.expediteur_id, ident);
  }
  for (const m of messagesEnvoyes) {
    const ident = pickIdent(m.destinataire);
    if (ident) identByUser.set(m.destinataire_id, ident);
  }
  const photoByIdentifiant: Record<string, string | null> = {};
  photosByUser.forEach((url, uid) => {
    const ident = identByUser.get(uid);
    if (ident) photoByIdentifiant[ident] = url;
  });

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
        isAdmin={isAdmin}
        photoByIdentifiant={photoByIdentifiant}
      />
    </div>
  );
}
