import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import PasswordResetRequestsClient from './PasswordResetRequestsClient';

export default async function AdminPasswordResetRequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from('password_reset_requests')
    .select('id, identifiant_or_email, user_id, created_at, status, handled_by')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="card">
        <p className="text-red-400">Erreur : {error.message}. Les tables password_reset_requests peuvent ne pas exister (exécutez la migration add_password_reset_tables.sql).</p>
      </div>
    );
  }

  const userIds = [...new Set((rows || []).map((r) => r.user_id).filter(Boolean))] as string[];
  let identifiants: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await admin.from('profiles').select('id, identifiant').in('id', userIds);
    if (profiles) identifiants = Object.fromEntries(profiles.map((p) => [p.id, p.identifiant ?? '']));
  }

  const requests = (rows || []).map((r) => ({
    id: r.id,
    identifiant_or_email: r.identifiant_or_email,
    user_id: r.user_id,
    identifiant: r.user_id ? identifiants[r.user_id] ?? null : null,
    created_at: r.created_at,
    status: r.status,
    handled_by: r.handled_by,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">← Administration</Link>
      </div>
      <h1 className="text-2xl font-semibold text-slate-100">Demandes de réinitialisation de mot de passe</h1>
      <p className="text-slate-400 text-sm">Les utilisateurs qui ont choisi « Demander à un administrateur » sur la page de connexion apparaissent ici. Réinitialisez leur mot de passe depuis la fiche pilote puis marquez la demande comme traitée.</p>
      <PasswordResetRequestsClient initialRequests={requests} />
    </div>
  );
}
