import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import CompteForm from './CompteForm';
import LicencesSection from '@/components/LicencesSection';
import CarteIdentite from '@/components/CarteIdentite';

export default async function ComptePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('identifiant, role, armee')
    .eq('id', user.id)
    .single();

  // Récupérer la carte d'identité
  const admin = createAdminClient();
  const { data: carte } = await admin
    .from('cartes_identite')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-100">Mon compte</h1>
      
      <div className="flex flex-col md:flex-row gap-6">
        {/* Carte d'identité */}
        <div className="flex-shrink-0">
          <CarteIdentite 
            carte={carte} 
            identifiant={profile?.identifiant ?? '—'} 
            size="md" 
          />
        </div>

        {/* Informations compte */}
        <div className="flex-1 space-y-6">
          <div className="card">
            <p className="text-slate-400 text-sm">Identifiant</p>
            <p className="text-slate-100 font-medium">{profile?.identifiant ?? '—'}</p>
          </div>
          <CompteForm armee={Boolean(profile?.armee)} isAdmin={profile?.role === 'admin'} />
        </div>
      </div>

      <LicencesSection userId={user.id} variant="default" />
    </div>
  );
}
