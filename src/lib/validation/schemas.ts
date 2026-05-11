import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas derives des vraies tables (cf. supabase/schema.sql + src/lib/types.ts)
// ---------------------------------------------------------------------------

const Oaci = z.string().length(4).regex(/^[A-Z0-9]{4}$/i).transform((s) => s.toUpperCase());

// --- AUTH ---
export const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

export const VerifyLoginCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code a 6 chiffres'),
});

// --- VOLS (carnet de vol valide par admin) ---
export const VolCreateSchema = z.object({
  pilote_id: z.string().uuid(),
  type_avion_id: z.string().uuid(),
  compagnie_id: z.string().uuid().nullable().optional(),
  compagnie_libelle: z.string().min(1).max(120),
  duree_minutes: z.number().int().min(1).max(24 * 60),
  depart_utc: z.string().datetime(),
  arrivee_utc: z.string().datetime(),
  type_vol: z.enum(['IFR', 'VFR']),
  commandant_bord: z.string().min(1).max(120),
  role_pilote: z.enum(['Pilote', 'Co-pilote']),
});

// --- PLANS DE VOL (depot par pilote) ---
export const PlanVolCreateSchema = z.object({
  pilote_id: z.string().uuid().optional(),
  copilote_id: z.string().uuid().nullable().optional(),
  compagnie_id: z.string().uuid().nullable().optional(),
  compagnie_avion_id: z.string().uuid().nullable().optional(),
  type_vol: z.enum(['IFR', 'VFR']),
  aeroport_depart: Oaci,
  aeroport_arrivee: Oaci,
  altitude_croisiere: z.number().int().min(0).max(60_000).nullable().optional(),
  vitesse_croisiere: z.number().int().min(0).max(900).nullable().optional(),
  route: z.string().max(2000).nullable().optional(),
  duree_estimee_minutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  carburant_minutes: z.number().int().min(0).max(48 * 60).nullable().optional(),
  callsign: z.string().max(20).nullable().optional(),
  vol_commercial: z.boolean().optional(),
  vol_ferry: z.boolean().optional(),
  vol_militaire: z.boolean().optional(),
  nature_transport: z.enum(['passagers', 'cargo', 'mixte']).nullable().optional(),
  type_cargaison: z.enum(['generale', 'dangereuse', 'perissable', 'vivante', 'urgente']).nullable().optional(),
  heure_depart_estimee: z.string().datetime().nullable().optional(),
});

// --- MESSAGES (envoi individuel ou broadcast) ---
export const MessageIndividuelSchema = z.object({
  destinataire_id: z.string().uuid(),
  titre: z.string().min(1).max(200),
  contenu: z.string().min(1).max(10_000),
});

export const BroadcastMessageSchema = z.object({
  broadcast_audience: z.enum(['pilotes', 'atc', 'siavi', 'ifsa', 'admins', 'all']),
  titre: z.string().min(1).max(200),
  contenu: z.string().min(1).max(10_000),
});

// Union : un message envoye est soit individuel soit broadcast
export const MessageEnvoiSchema = z.union([MessageIndividuelSchema, BroadcastMessageSchema]);

// --- NOTAMS ---
export const NotamCreateSchema = z.object({
  code_aeroport: Oaci,
  identifiant: z.string().regex(/^[A-Z]\d{4}\/\d{2}$/i, 'Format A0000/00').optional(),
  titre: z.string().min(3).max(300),
  description: z.string().min(5).max(4000),
  debut_at: z.string().datetime(),
  fin_at: z.string().datetime().nullable().optional(),
  priorite: z.enum(['INFO', 'AVERTISSEMENT', 'URGENT']).optional(),
  actif: z.boolean().optional(),
});

// --- PROFIL (mise a jour self) ---
export const ProfileUpdateSchema = z.object({
  identifiant: z.string().min(2).max(32).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  roblox_username: z.string().min(2).max(32).nullable().optional(),
});
