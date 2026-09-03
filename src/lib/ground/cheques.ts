import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureComptePersonnel, getComptePersonnelCanonique } from '@/lib/felitz/ensure-comptes';
import type { ServiceType } from '@/lib/types';

const SERVICE_LABELS: Record<ServiceType, string> = {
  bagages: 'Chargement bagages',
  catering: 'Service catering',
  fuel: 'Ravitaillement carburant',
  boarding: 'Boarding passagers',
  repoussage: 'Repoussage',
  marshalling: 'Marshalling',
};

function chequeNumero(serviceRequestId: string, userId: string): string {
  return `GC-${serviceRequestId}-${userId.slice(0, 8)}`;
}

async function chequeDejaEmis(
  admin: SupabaseClient,
  userId: string,
  numero: string,
): Promise<boolean> {
  const { data } = await admin
    .from('messages')
    .select('id')
    .eq('destinataire_id', userId)
    .eq('type_message', 'cheque_salaire')
    .eq('cheque_numero_vol', numero)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function emettreChequeGc(
  admin: SupabaseClient,
  params: {
    userId: string;
    montant: number;
    serviceRequestId: string;
    serviceType: ServiceType;
    aeroport: string;
    numeroVol?: string | null;
  },
): Promise<boolean> {
  if (params.montant <= 0) return false;

  const numero = chequeNumero(params.serviceRequestId, params.userId);
  if (await chequeDejaEmis(admin, params.userId, numero)) return false;

  let compte = await getComptePersonnelCanonique(admin, params.userId);
  if (!compte) compte = await ensureComptePersonnel(admin, params.userId);

  const label = SERVICE_LABELS[params.serviceType] ?? params.serviceType;
  const vol = params.numeroVol ? ` · vol ${params.numeroVol}` : '';
  const { error } = await admin.from('messages').insert({
    destinataire_id: params.userId,
    expediteur_id: null,
    titre: `Salaire Ground Crew — ${label}`,
    contenu:
      `Service au sol terminé à ${params.aeroport}${vol}.\n\n` +
      `${label} : ${params.montant.toLocaleString('fr-FR')} F$\n\n` +
      `Veuillez encaisser votre chèque ci-dessous.`,
    type_message: 'cheque_salaire',
    cheque_montant: params.montant,
    cheque_encaisse: false,
    cheque_destinataire_compte_id: compte?.id ?? null,
    cheque_libelle: `Salaire GC — ${label}${vol}`,
    cheque_numero_vol: numero,
    cheque_pour_compagnie: false,
    metadata: {
      ground_service_request_id: params.serviceRequestId,
      service_type: params.serviceType,
    },
  });

  if (error) {
    console.error('[ground/cheques] insertion échouée:', error.message);
    return false;
  }
  return true;
}

/**
 * Émet un chèque Felitz par membre pour un service GC complété.
 * Idempotent via cheque_numero_vol unique par (demande, utilisateur).
 */
export async function emettreChequesServiceGround(
  admin: SupabaseClient,
  params: {
    serviceRequestId: string;
    serviceType: ServiceType;
    aeroport: string;
    acceptedBy: string | null;
    teamId: string | null;
    montantPaye: number;
    numeroVol?: string | null;
  },
): Promise<void> {
  const { data: contributions } = await admin
    .from('ground_crew_service_contributions')
    .select('user_id, montant_percu')
    .eq('service_request_id', params.serviceRequestId);

  const parts = (contributions ?? [])
    .map((c) => ({ userId: String(c.user_id), montant: Math.round(Number(c.montant_percu) || 0) }))
    .filter((c) => c.montant > 0);

  if (parts.length === 0 && params.montantPaye > 0 && params.acceptedBy) {
    parts.push({ userId: params.acceptedBy, montant: Math.round(params.montantPaye) });
  }

  for (const part of parts) {
    await emettreChequeGc(admin, {
      userId: part.userId,
      montant: part.montant,
      serviceRequestId: params.serviceRequestId,
      serviceType: params.serviceType,
      aeroport: params.aeroport,
      numeroVol: params.numeroVol,
    });
  }
}
