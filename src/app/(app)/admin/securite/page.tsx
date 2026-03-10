import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SecuriteClient from './SecuriteClient';
import IpsClient from '../ips/IpsClient';

export default async function AdminSecuritePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/');

  let loginAdminOnly = false;
  try {
    const { data: config } = await adminClient
      .from('site_config')
      .select('login_admin_only')
      .eq('id', 1)
      .single();
    loginAdminOnly = Boolean(config?.login_admin_only);
  } catch {
    // Table site_config peut ne pas exister
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-100">Sécurité</h1>
      <SecuriteClient initialLoginAdminOnly={loginAdminOnly} />

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-200">Consultation des IP</h2>
        <p className="text-slate-400 text-sm">
          Pour consulter la liste des adresses IP et la dernière IP utilisée par chaque compte, entrez le mot de passe superadmin,
          validez par code envoyé à votre email, puis obtenez l&apos;approbation d&apos;un autre administrateur.
        </p>
        <IpsClient />
      </section>
    </div>
  );
}
