import Link from 'next/link';
import { Users, Clock, Building2, Plane, FileText, Shield, Award, Landmark, Receipt, UserPlus, Store, MapPin, AlertTriangle, GraduationCap } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

const links = [
  { href: '/admin/plans-vol', label: 'Plans de vol non clôturés', icon: AlertTriangle, countKey: 'plansNonClotures' },
  { href: '/admin/vols', label: 'Vols en attente', icon: Clock, countKey: 'volsEnAttente' },
  { href: '/admin/militaire', label: 'Vols militaires', icon: Shield },
  { href: '/admin/armee', label: 'Gestion Armée', icon: Shield },
  { href: '/admin/pilotes', label: 'Pilotes', icon: Users },
  { href: '/admin/compagnies', label: 'Compagnies', icon: Building2 },
  { href: '/admin/employes', label: 'Employés compagnies', icon: UserPlus },
  { href: '/admin/types-avion', label: 'Types d\'avion & Prix', icon: Plane },
  { href: '/admin/avions', label: 'Gestion des avions', icon: MapPin },
  { href: '/admin/taxes', label: 'Taxes aéroportuaires', icon: Receipt },
  { href: '/admin/hangar-market', label: 'Hangar Market', icon: Store },
  { href: '/admin/felitz-bank', label: 'Felitz Bank Admin', icon: Landmark },
  { href: '/admin/documents', label: 'Documents', icon: FileText },
  { href: '/admin/licences', label: 'Licences et qualifications', icon: Award },
  { href: '/admin/aeroschool', label: 'AeroSchool — Questionnaires', icon: GraduationCap, countKey: 'aeroschoolResponses' },
];

async function getAdminCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    const admin = createAdminClient();
    const results = await Promise.allSettled([
      // Vols en attente de validation
      admin.from('vols').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      // Plans de vol non clôturés (exclut les strips manuels ATC)
      admin.from('plans_vol').select('*', { count: 'exact', head: true }).in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']).or('created_by_atc.is.null,created_by_atc.eq.false'),
      // Réponses AeroSchool en attente d'examen
      admin.from('aeroschool_responses').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    ]);
    if (results[0].status === 'fulfilled') counts.volsEnAttente = results[0].value.count ?? 0;
    if (results[1].status === 'fulfilled') counts.plansNonClotures = results[1].value.count ?? 0;
    if (results[2].status === 'fulfilled') counts.aeroschoolResponses = results[2].value.count ?? 0;
  } catch {
    // Tables may not exist yet
  }
  return counts;
}

export default async function AdminPage() {
  const counts = await getAdminCounts();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100">Administration</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-enter">
        {links.map(({ href, label, icon: Icon, countKey }) => {
          const count = countKey ? (counts[countKey] ?? 0) : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`card flex items-center gap-4 transition-all duration-200 relative group ${
                count > 0
                  ? 'border-amber-500/40 hover:border-amber-500/60 bg-amber-500/5 hover:bg-amber-500/10'
                  : 'hover:border-sky-500/40 hover:bg-slate-800/60'
              } hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className="relative">
                <div className={`p-2.5 rounded-xl transition-colors ${count > 0 ? 'bg-amber-500/10 group-hover:bg-amber-500/20' : 'bg-sky-500/10 group-hover:bg-sky-500/20'}`}>
                  <Icon className={`h-6 w-6 ${count > 0 ? 'text-amber-400' : 'text-sky-400'}`} />
                </div>
                {count > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-lg shadow-red-500/40">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-200 group-hover:text-slate-100 transition-colors">{label}</span>
                {count > 0 && (
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    {count} en attente
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
