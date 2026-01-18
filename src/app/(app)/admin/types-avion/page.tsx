import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function AdminTypesAvionPage() {
  const supabase = await createClient();
  const { data: types } = await supabase.from('types_avion').select('id, nom, constructeur').order('ordre');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Types d&apos;avion</h1>
      </div>
      <div className="card">
        <p className="text-slate-400 text-sm mb-4">Liste prédéfinie. Modifiable via la base si besoin.</p>
        <ul className="space-y-1">
          {(types || []).map((t) => (
            <li key={t.id} className="text-slate-200">
              {t.nom} {t.constructeur ? <span className="text-slate-500">({t.constructeur})</span> : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
