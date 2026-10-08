import { z } from 'zod';

const member = z.uuid().nullable().optional();
const text = (max: number) => z.string().trim().max(max);
const common = {
  aeroport_depart: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/),
  aeroport_arrivee: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/),
  duree_minutes: z.number().int().min(1).max(1440),
  depart_utc: z.string().max(40).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/),
  commandant_bord: text(100).min(1),
  callsign: text(30).nullable().optional(),
  copilote_id: member,
  equipage_ids: z.array(z.uuid()).max(50).nullable().optional(),
  nature_vol_militaire: z.enum(['entrainement', 'escorte', 'sauvetage', 'reconnaissance', 'autre']).nullable().optional(),
  nature_vol_militaire_autre: text(200).nullable().optional(),
};
export const createMilitaryFlightSchema = z.object({
  ...common,
  armee_avion_id: z.uuid(),
  mission_id: text(100).nullable().optional(),
  escadrille_ou_escadron: z.enum(['escadrille', 'escadron', 'autre']),
  role_pilote: z.enum(['Pilote', 'Co-pilote']).nullable().optional(),
  pilote_id: member,
});
export const updateMilitaryFlightSchema = z.object({
  ...common,
  armee_avion_id: member,
  escadrille_ou_escadron: z.enum(['escadrille', 'escadron', 'autre']).optional(),
  chef_escadron_id: member,
});

export function militaryRpcError(error: { code?: string; message: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return { ok: false as const, status: 503, error: 'La mise à jour de la base Armée doit être appliquée avant cette opération.' };
  }
  if (error.code === '23505') {
    return { ok: false as const, status: 409, error: 'Un dossier pour cette mission est déjà ouvert. Consultez votre carnet.' };
  }
  return { ok: false as const, status: error.code === '42501' ? 403 : 400, error: error.message };
}
