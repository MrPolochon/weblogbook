import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shield, Landmark, Users } from 'lucide-react';
import ArmeeConfigClient from './ArmeeConfigClient';

export default async function AdminArmeePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();

  // Récupérer le compte militaire (s'il existe)
  const { data: compteMilitaire } = await admin.from('felitz_comptes')
    .select('*, profiles:proprietaire_id(id, identifiant)')
    .eq('type', 'militaire')
    .single();

  // Récupérer tous les pilotes avec le rôle armée
  const { data: pilotesArmee } = await admin.from('profiles')
    .select('id, identifiant, armee')
    .eq('armee', true)
    .order('identifiant');

  // Récupérer tous les pilotes (pour sélection PDG)
  const { data: tousPilotes } = await admin.from('profiles')
    .select('id, identifiant, role')
    .in('role', ['pilote', 'admin'])
    .order('identifiant');

  // Stats militaires
  const { count: totalVolsMilitaires } = await admin.from('vols')
    .select('*', { count: 'exact', head: true })
    .eq('type_vol', 'Vol militaire');

  const { data: tempsMilitaire } = await admin.from('vols')
    .select('duree_minutes')
    .eq('type_vol', 'Vol militaire')
    .eq('statut', 'validé');

  const totalMinutesMilitaires = (tempsMilitaire || []).reduce((acc, v) => acc + (v.duree_minutes || 0), 0);

  // Extraire le PDG actuel
  const pdgActuel = compteMilitaire?.profiles 
    ? (Array.isArray(compteMilitaire.profiles) ? compteMilitaire.profiles[0] : compteMilitaire.profiles) 
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-3">
          <Shield className="h-7 w-7 text-red-400" />
          Gestion de l&apos;Armée
        </h1>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card bg-red-500/10 border-red-500/30">
          <div className="flex items-center gap-2 text-sm text-red-400 mb-1">
            <Users className="h-4 w-4" />
            Pilotes militaires
          </div>
          <p className="text-3xl font-bold text-red-300">{pilotesArmee?.length || 0}</p>
        </div>
        <div className="card bg-amber-500/10 border-amber-500/30">
          <div className="flex items-center gap-2 text-sm text-amber-400 mb-1">
            <Shield className="h-4 w-4" />
            Vols militaires
          </div>
          <p className="text-3xl font-bold text-amber-300">{totalVolsMilitaires || 0}</p>
        </div>
        <div className="card bg-emerald-500/10 border-emerald-500/30">
          <div className="flex items-center gap-2 text-sm text-emerald-400 mb-1">
            <Landmark className="h-4 w-4" />
            Solde Armée
          </div>
          <p className="text-3xl font-bold text-emerald-300">
            {(compteMilitaire?.solde || 0).toLocaleString('fr-FR')} F$
          </p>
        </div>
      </div>

      {/* Configuration */}
      <ArmeeConfigClient 
        compteMilitaire={compteMilitaire}
        pdgActuel={pdgActuel}
        tousPilotes={tousPilotes || []}
        pilotesArmee={pilotesArmee || []}
        totalMinutes={totalMinutesMilitaires}
      />
    </div>
  );
}
