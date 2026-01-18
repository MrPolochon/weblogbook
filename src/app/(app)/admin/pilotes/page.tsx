import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import CreatePiloteForm from './CreatePiloteForm';
import PilotesActions from './PilotesActions';

export default async function AdminPilotesPage() {
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, identifiant, role, heures_initiales_minutes, blocked_until, created_at')
    .order('identifiant');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Pilotes</h1>
      </div>

      <CreatePiloteForm />

      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Liste</h2>
        {!profiles || profiles.length === 0 ? (
          <p className="text-slate-500">Aucun pilote.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Identifiant</th>
                  <th className="pb-2 pr-4">Rôle</th>
                  <th className="pb-2 pr-4">Heures initiales</th>
                  <th className="pb-2 pr-4">Blocage</th>
                  <th className="pb-2 pr-4">Créé le</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => {
                  const blocked = p.blocked_until ? new Date(p.blocked_until) > new Date() : false;
                  return (
                    <tr key={p.id} className="border-b border-slate-700/50">
                      <td className="py-3 pr-4 font-medium text-slate-200">{p.identifiant}</td>
                      <td className="py-3 pr-4 text-slate-300">{p.role}</td>
                      <td className="py-3 pr-4 text-slate-300">{formatDuree(p.heures_initiales_minutes ?? 0)}</td>
                      <td className="py-3 pr-4">
                        {blocked ? (
                          <span className="text-amber-400">
                            Jusqu&apos;au {format(new Date(p.blocked_until!), 'dd/MM/yyyy HH:mm', { locale: fr })}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-400 text-xs">
                        {format(new Date(p.created_at), 'dd MMM yyyy', { locale: fr })}
                      </td>
                      <td className="py-3">
                        <PilotesActions
                          piloteId={p.id}
                          identifiant={p.identifiant}
                          isAdmin={p.role === 'admin'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
