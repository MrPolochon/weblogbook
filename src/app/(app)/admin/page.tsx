import Link from 'next/link';
import {
  Users, Clock, Building2, Plane, FileText, Shield, Award, Landmark,
  Receipt, UserPlus, Store, MapPin, AlertTriangle, GraduationCap, Lock,
  Package, KeyRound, Wrench, Handshake, LayoutDashboard, Activity,
  Settings, Route, Flame, ImageIcon, HardDrive, Radar
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface LinkItem {
  href: string;
  label: string;
  desc?: string;
  icon: typeof Users;
  countKey?: string;
}

interface Section {
  title: string;
  icon: typeof Users;
  color: string;
  links: LinkItem[];
}

const sections: Section[] = [
  {
    title: 'Actions requises',
    icon: Activity,
    color: 'amber',
    links: [
      { href: '/admin/plans-vol', label: 'Plans de vol', desc: 'Non clôturés & historique', icon: AlertTriangle, countKey: 'plansNonClotures' },
      { href: '/admin/vols', label: 'Vols en attente', desc: 'Validation des vols', icon: Clock, countKey: 'volsEnAttente' },
      { href: '/admin/password-reset-requests', label: 'Mots de passe', desc: 'Demandes de réinitialisation', icon: KeyRound, countKey: 'passwordResetRequests' },
      { href: '/admin/radar-beta', label: 'Radar BETA', desc: "Demandes d'acces radar", icon: Radar, countKey: 'radarBetaRequests' },
      { href: '/admin/aeroschool', label: 'AeroSchool', desc: 'Questionnaires à corriger', icon: GraduationCap, countKey: 'aeroschoolResponses' },
      { href: '/admin/hangar-market', label: 'Hangar Market', desc: 'Demandes de revente', icon: Store, countKey: 'demandesRevente' },
      { href: '/admin/incidents', label: 'Incidents de vol', desc: 'Crash & urgences a examiner', icon: Flame, countKey: 'incidentsEnAttente' },
    ],
  },
  {
    title: 'Utilisateurs & Organisations',
    icon: Users,
    color: 'sky',
    links: [
      { href: '/admin/pilotes', label: 'Pilotes', desc: 'Gestion des comptes', icon: Users },
      { href: '/admin/compagnies', label: 'Compagnies', desc: 'Créer & gérer', icon: Building2 },
      { href: '/admin/employes', label: 'Employés', desc: 'Affectation aux compagnies', icon: UserPlus },
      { href: '/admin/alliances', label: 'Alliances', desc: 'Créer & superviser', icon: Handshake },
      { href: '/admin/reparation', label: 'Entreprises de réparation', desc: 'Créer & gérer', icon: Wrench },
    ],
  },
  {
    title: 'Flotte & Aviation',
    icon: Plane,
    color: 'violet',
    links: [
      { href: '/admin/types-avion', label: 'Types d\'avion', desc: 'Modèles & prix', icon: Plane },
      { href: '/admin/avions', label: 'Avions', desc: 'Flotte globale', icon: MapPin },
      { href: '/admin/inventaire', label: 'Inventaires', desc: 'Tous les pilotes', icon: Package },
    ],
  },
  {
    title: 'Opérations militaires',
    icon: Shield,
    color: 'emerald',
    links: [
      { href: '/admin/militaire', label: 'Vols militaires', desc: 'Suivi des missions', icon: Shield },
      { href: '/admin/armee', label: 'Configuration armée', desc: 'Grades & paramètres', icon: Shield },
    ],
  },
  {
    title: 'Économie & Finance',
    icon: Landmark,
    color: 'amber',
    links: [
      { href: '/admin/felitz-bank', label: 'Felitz Bank', desc: 'Comptes & transactions', icon: Landmark },
      { href: '/admin/taxes', label: 'Taxes', desc: 'Taxes aéroportuaires', icon: Receipt },
    ],
  },
  {
    title: 'Configuration',
    icon: Settings,
    color: 'slate',
    links: [
      { href: '/admin/documents', label: 'Documents', desc: 'Gestion des documents', icon: FileText },
      { href: '/admin/licences', label: 'Licences', desc: 'Licences & qualifications', icon: Award },
      { href: '/admin/sid-star', label: 'SID / STAR', desc: 'Procédures de départ et d\'arrivée', icon: Route },
      { href: '/admin/cartographie-temporaire', label: 'Cartographie temporaire', desc: 'Edition et validation des cartes', icon: MapPin },
      { href: '/admin/securite', label: 'Sécurité', desc: 'Connexions & IPs', icon: Lock },
      { href: '/admin/storage', label: 'Storage', desc: 'Images & logos stockés', icon: ImageIcon },
      { href: '/admin/storage-overview', label: 'Espace disque', desc: 'Vue d\'ensemble du stockage', icon: HardDrive },
    ],
  },
];

async function getAdminCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    const admin = createAdminClient();
    const results = await Promise.allSettled([
      admin.from('password_reset_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('vols').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      admin.from('plans_vol').select('*', { count: 'exact', head: true }).in('statut', ['depose', 'en_attente']).or('created_by_atc.is.null,created_by_atc.eq.false'),
      admin.from('radar_beta_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('aeroschool_responses').select('*', { count: 'exact', head: true }).neq('status', 'reviewed'),
      admin.from('hangar_market_reventes').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
      admin.from('incidents_vol').select('*', { count: 'exact', head: true }).in('statut', ['en_attente', 'en_examen']),
    ]);
    const keys = ['passwordResetRequests', 'volsEnAttente', 'plansNonClotures', 'radarBetaRequests', 'aeroschoolResponses', 'demandesRevente', 'incidentsEnAttente'];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value && !(r.value as { error?: unknown }).error) {
        counts[keys[i]] = (r.value as { count?: number | null }).count ?? 0;
      } else {
        counts[keys[i]] = 0;
      }
    });
  } catch {}
  return counts;
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
  amber: { bg: 'bg-amber-500/5', text: 'text-amber-400', border: 'border-amber-500/20', iconBg: 'bg-amber-500/10' },
  sky: { bg: 'bg-sky-500/5', text: 'text-sky-400', border: 'border-sky-500/20', iconBg: 'bg-sky-500/10' },
  violet: { bg: 'bg-violet-500/5', text: 'text-violet-400', border: 'border-violet-500/20', iconBg: 'bg-violet-500/10' },
  emerald: { bg: 'bg-emerald-500/5', text: 'text-emerald-400', border: 'border-emerald-500/20', iconBg: 'bg-emerald-500/10' },
  slate: { bg: 'bg-slate-500/5', text: 'text-slate-400', border: 'border-slate-500/20', iconBg: 'bg-slate-500/10' },
};

export default async function AdminPage() {
  const counts = await getAdminCounts();
  const totalPending = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <LayoutDashboard className="h-7 w-7 text-sky-400" />
            Administration
          </h1>
          <p className="text-slate-400 mt-1">Panneau de gestion centralisé</p>
        </div>
        {totalPending > 0 && (
          <div className="flex flex-col gap-1.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-amber-400 shrink-0" />
              <span className="text-amber-300 font-medium">{totalPending} action{totalPending > 1 ? 's' : ''} en attente</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-amber-400/90">
              {(counts.plansNonClotures ?? 0) > 0 && <span>Plans de vol : {counts.plansNonClotures}</span>}
              {(counts.volsEnAttente ?? 0) > 0 && <span>Vols : {counts.volsEnAttente}</span>}
              {(counts.aeroschoolResponses ?? 0) > 0 && <span>AeroSchool : {counts.aeroschoolResponses}</span>}
              {(counts.passwordResetRequests ?? 0) > 0 && <span>Mots de passe : {counts.passwordResetRequests}</span>}
              {(counts.radarBetaRequests ?? 0) > 0 && <span>Radar BETA : {counts.radarBetaRequests}</span>}
              {(counts.demandesRevente ?? 0) > 0 && <span>Hangar Market : {counts.demandesRevente}</span>}
              {(counts.incidentsEnAttente ?? 0) > 0 && <span>Incidents : {counts.incidentsEnAttente}</span>}
            </div>
          </div>
        )}
      </div>

      {sections.map(section => {
        const SectionIcon = section.icon;
        const colors = COLOR_MAP[section.color] || COLOR_MAP.slate;
        const sectionHasPending = section.links.some(l => l.countKey && (counts[l.countKey] ?? 0) > 0);

        return (
          <div key={section.title}>
            <div className="flex items-center gap-2 mb-3">
              <SectionIcon className={`h-5 w-5 ${colors.text}`} />
              <h2 className="text-lg font-semibold text-slate-200">{section.title}</h2>
              {sectionHasPending && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">
                  {section.links.reduce((sum, l) => sum + (l.countKey ? (counts[l.countKey] ?? 0) : 0), 0)}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...section.links]
                .sort((a, b) => {
                  const ca = a.countKey ? (counts[a.countKey] ?? 0) : 0;
                  const cb = b.countKey ? (counts[b.countKey] ?? 0) : 0;
                  return cb - ca;
                })
                .map(link => {
                const Icon = link.icon;
                const count = link.countKey ? (counts[link.countKey] ?? 0) : 0;
                const hasBadge = count > 0;

                return (
                  <Link key={link.href} href={link.href}
                    className={`group relative flex items-center gap-3 p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                      hasBadge
                        ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/60'
                        : `${colors.border} bg-slate-800/20 hover:bg-slate-800/40 hover:border-slate-600/50`
                    }`}>
                    <div className="relative shrink-0">
                      <div className={`p-2 rounded-lg transition-colors ${hasBadge ? 'bg-amber-500/15' : colors.iconBg} group-hover:scale-105`}>
                        <Icon className={`h-5 w-5 ${hasBadge ? 'text-amber-400' : colors.text}`} />
                      </div>
                      {hasBadge && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-lg shadow-red-500/30">
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-200 group-hover:text-white transition-colors">{link.label}</p>
                      {link.desc && <p className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors truncate">{link.desc}</p>}
                      {hasBadge && <p className="text-xs text-amber-400/80 mt-0.5">{count} en attente</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
