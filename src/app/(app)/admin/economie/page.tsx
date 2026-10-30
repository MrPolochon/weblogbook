import Link from 'next/link';
import { ArrowLeft, Landmark } from 'lucide-react';
import EconomyReleaseControl from '@/components/company/EconomyReleaseControl';

export default function EconomyAdminPage() {
  return <div className="mx-auto max-w-4xl space-y-6"><Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-400"><ArrowLeft size={16}/>Administration</Link><header><h1 className="flex items-center gap-3 text-2xl font-semibold text-slate-100"><Landmark className="text-sky-300"/>Économie et développement des compagnies</h1><p className="mt-3 text-sm leading-6 text-slate-400">Contrôle de l’ouverture des nouveaux projets et contrats de vol. Les règlements déjà engagés conservent leur version et restent dus après une suspension.</p></header><EconomyReleaseControl/></div>;
}
