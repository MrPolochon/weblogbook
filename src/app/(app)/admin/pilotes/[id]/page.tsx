import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import EditPiloteForm from './EditPiloteForm';

export default async function AdminPiloteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: p } = await supabase
    .from('profiles')
    .select('id, identifiant, role, armee, heures_initiales_minutes, blocked_until, block_reason')
    .eq('id', id)
    .single();

  if (!p) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/admin/pilotes" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Modifier {p.identifiant}</h1>
        <Link
          href={`/admin/pilotes/${id}/logbook`}
          className="btn-secondary inline-flex items-center gap-2"
        >
          Voir le logbook
        </Link>
      </div>
      <EditPiloteForm
        piloteId={p.id}
        identifiant={p.identifiant ?? ''}
        armee={Boolean(p.armee)}
        heuresInitiales={p.heures_initiales_minutes ?? 0}
        blockedUntil={p.blocked_until}
        blockReason={p.block_reason}
      />
    </div>
  );
}
