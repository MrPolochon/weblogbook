import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import EditPiloteForm from './EditPiloteForm';
import PiloteCarteSection from './PiloteCarteSection';

export default async function AdminPiloteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: p } = await supabase
    .from('profiles')
    .select('id, identifiant, role, armee, atc, ifsa, siavi, heures_initiales_minutes, blocked_until, block_reason')
    .eq('id', id)
    .single();

  if (!p) notFound();

  // Récupérer la carte d'identité
  const admin = createAdminClient();
  const { data: carte } = await admin
    .from('cartes_identite')
    .select('*')
    .eq('user_id', id)
    .single();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/admin/pilotes" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Modifier {p.identifiant}</h1>
        {p.role !== 'atc' && (
          <Link
            href={`/admin/pilotes/${id}/logbook`}
            className="btn-secondary inline-flex items-center gap-2"
          >
            Voir le logbook
          </Link>
        )}
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Formulaire d'édition - priorité */}
        <div className="flex-1 min-w-0">
          <EditPiloteForm
            piloteId={p.id}
            identifiant={p.identifiant ?? ''}
            role={p.role ?? 'pilote'}
            armee={Boolean(p.armee)}
            atc={Boolean(p.atc)}
            ifsa={Boolean(p.ifsa)}
            siavi={Boolean(p.siavi)}
            heuresInitiales={p.heures_initiales_minutes ?? 0}
            blockedUntil={p.blocked_until}
            blockReason={p.block_reason}
          />
        </div>

        {/* Carte d'identité - sidebar */}
        <div className="w-full xl:w-auto flex-shrink-0">
          <PiloteCarteSection 
            userId={p.id} 
            identifiant={p.identifiant ?? ''} 
            initialCarte={carte} 
          />
        </div>
      </div>
    </div>
  );
}
