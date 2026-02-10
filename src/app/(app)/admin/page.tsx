import Link from 'next/link';
import { Users, Clock, Building2, Plane, FileText, Shield, Award, Landmark, Receipt, UserPlus, Store, MapPin, AlertTriangle } from 'lucide-react';

const links = [
  { href: '/admin/plans-vol', label: 'Plans de vol non clôturés', icon: AlertTriangle },
  { href: '/admin/vols', label: 'Vols en attente', icon: Clock },
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
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100">Administration</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="card flex items-center gap-4 hover:border-sky-500/50 transition-colors"
          >
            <Icon className="h-8 w-8 text-sky-400" />
            <span className="font-medium text-slate-200">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
