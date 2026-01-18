import Link from 'next/link';
import { Users, Clock, Building2, Plane, FileText } from 'lucide-react';

const links = [
  { href: '/admin/vols', label: 'Vols en attente', icon: Clock },
  { href: '/admin/pilotes', label: 'Pilotes', icon: Users },
  { href: '/admin/compagnies', label: 'Compagnies', icon: Building2 },
  { href: '/admin/types-avion', label: 'Types d\'avion', icon: Plane },
  { href: '/admin/documents', label: 'Documents', icon: FileText },
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
