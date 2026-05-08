import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Package, ArrowRight, Plane, Users, MapPin, Palmtree, Radio } from 'lucide-react';
import Link from 'next/link';
import MarchePassagersClient from './MarchePassagersClient';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

export default async function MarchePassagersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Régénérer les passagers avant de récupérer les données
  try {
    await admin.rpc('regenerer_passagers_aeroport');
  } catch (e) {
    console.log('RPC regenerer_passagers_aeroport not available');
  }

  // Récupérer les données des passagers pour tous les aéroports
  const { data: passagersData } = await admin.from('aeroport_passagers')
    .select('code_oaci, passagers_disponibles, passagers_max, derniere_regeneration');

  // Combiner avec les infos statiques des aéroports
  const aeroportsData = AEROPORTS_PTFS.map(aeroport => {
    const passagers = passagersData?.find(p => p.code_oaci === aeroport.code);
    return {
      code: aeroport.code,
      nom: aeroport.nom,
      taille: aeroport.taille,
      tourisme: aeroport.tourisme,
      passagersMax: aeroport.passagersMax,
      vor: aeroport.vor,
      freq: aeroport.freq,
      passagers_disponibles: passagers?.passagers_disponibles ?? aeroport.passagersMax,
      passagers_max: passagers?.passagers_max ?? aeroport.passagersMax,
      derniere_regeneration: passagers?.derniere_regeneration ?? null,
    };
  });

  const totalPax = aeroportsData.reduce((s, a) => s + a.passagers_disponibles, 0);
  const nbInternational = aeroportsData.filter(a => a.taille === 'international').length;
  const nbTourisme = aeroportsData.filter(a => a.tourisme).length;

  return (
    <div className="space-y-6 animate-page-reveal">
      {/* ===== HUD Header ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-950/95 shadow-[0_22px_42px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-60" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />
        <Plane
          className="pointer-events-none absolute top-3 -left-10 h-5 w-5 text-emerald-400/40 animate-plane-glide"
          style={{ animationDuration: '7s' }}
          aria-hidden
        />
        <div className="relative z-10 p-5 sm:p-7 space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20">
              <Users className="h-7 w-7 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Marché des passagers</h1>
              <p className="text-sm text-slate-400 mt-0.5">Vue en temps réel de la disponibilité par aéroport</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-300 font-medium">{totalPax.toLocaleString('fr-FR')} pax disponibles</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <MapPin className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-purple-300 font-medium">{nbInternational} hub{nbInternational > 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Palmtree className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-amber-300 font-medium">{nbTourisme} touristique{nbTourisme > 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
              <Radio className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-sky-300 font-medium">{aeroportsData.length} aéroports</span>
            </div>
          </div>
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-2 px-1">
        {[
          { color: 'bg-purple-500', border: 'border-purple-500/40', label: 'International', detail: 'prix -40%' },
          { color: 'bg-sky-500', border: 'border-sky-500/40', label: 'Régional', detail: 'prix -20%' },
          { color: 'bg-emerald-500', border: 'border-emerald-500/40', label: 'Small', detail: 'prix normal' },
          { color: 'bg-red-500', border: 'border-red-500/40', label: 'Militaire', detail: 'peu de civils' },
        ].map(l => (
          <div key={l.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${l.border} bg-slate-800/40 text-xs`}>
            <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
            <span className="text-slate-200 font-medium">{l.label}</span>
            <span className="text-slate-500">{l.detail}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-slate-800/40 text-xs">
          <Palmtree className="h-3 w-3 text-amber-400" />
          <span className="text-slate-200 font-medium">Touristique</span>
          <span className="text-slate-500">+25% remplissage</span>
        </div>
      </div>

      <MarchePassagersClient aeroports={aeroportsData} />

      {/* Lien vers marché cargo */}
      <div className="flex justify-center pt-2">
        <Link
          href="/marche-cargo"
          className="group flex items-center gap-2 px-5 py-2.5 bg-amber-500/10 hover:bg-amber-500/15 text-amber-400 rounded-xl text-sm font-medium transition-all border border-amber-500/25 hover:border-amber-500/40"
        >
          <Package className="h-4 w-4" />
          Voir le marché du fret
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
