import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import AdminReparationClient from './AdminReparationClient';

export default async function AdminReparationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/');

  const admin = createAdminClient();
  const { data: entreprises } = await admin.from('entreprises_reparation')
    .select('id, nom, description, pdg_id, created_at')
    .order('created_at', { ascending: false });

  const pdgIds = Array.from(new Set((entreprises || []).map(e => e.pdg_id).filter(Boolean)));
  let pdgProfiles: { id: string; identifiant: string }[] = [];
  if (pdgIds.length > 0) {
    const { data } = await admin.from('profiles').select('id, identifiant').in('id', pdgIds);
    pdgProfiles = (data || []) as { id: string; identifiant: string }[];
  }

  const { data: allProfiles } = await admin.from('profiles')
    .select('id, identifiant')
    .order('identifiant')
    .limit(500);

  const { data: employes } = await admin.from('reparation_employes').select('entreprise_id');
  const countByEntreprise: Record<string, number> = {};
  (employes || []).forEach(e => { countByEntreprise[e.entreprise_id] = (countByEntreprise[e.entreprise_id] || 0) + 1; });

  const { data: hangars } = await admin.from('reparation_hangars').select('entreprise_id');
  const hangarsByEntreprise: Record<string, number> = {};
  (hangars || []).forEach(h => { hangarsByEntreprise[h.entreprise_id] = (hangarsByEntreprise[h.entreprise_id] || 0) + 1; });

  return (
    <AdminReparationClient
      entreprises={(entreprises || []).map(e => ({
        ...e,
        pdg_callsign: pdgProfiles.find(p => p.id === e.pdg_id)?.identifiant || '?',
        nb_employes: countByEntreprise[e.id] || 0,
        nb_hangars: hangarsByEntreprise[e.id] || 0,
      }))}
      users={(allProfiles || []) as { id: string; identifiant: string }[]}
    />
  );
}
