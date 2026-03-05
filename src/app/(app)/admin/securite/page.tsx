import { createAdminClient } from '@/lib/supabase/admin';
import SecuriteClient from './SecuriteClient';

export default async function AdminSecuritePage() {
  let loginAdminOnly = false;
  try {
    const admin = createAdminClient();
    const { data: config } = await admin
      .from('site_config')
      .select('login_admin_only')
      .eq('id', 1)
      .single();
    loginAdminOnly = Boolean(config?.login_admin_only);
  } catch {
    // Table site_config peut ne pas exister (exécuter supabase/add_site_config.sql)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100">Sécurité</h1>
      <SecuriteClient initialLoginAdminOnly={loginAdminOnly} />
    </div>
  );
}
