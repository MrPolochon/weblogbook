#!/usr/bin/env node
/**
 * Répare tous les avions en_reparation + compensation Felitz (10 000 F$/avion).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reparer-avions-compensation.mjs
 *
 * Préfère le script SQL supabase/admin_reparer_avions_en_reparation_compensation.sql
 * dans l’éditeur SQL Supabase (transaction atomique).
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://iajcynzzybkomaouxwji.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMPENSATION = 10_000;
const LIBELLE = 'compensation admin réparation forcée';

if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY manquant.');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function rest(path, opts = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function rpc(name, body) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`RPC ${name}: ${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function main() {
  const [compagnie, inventaire, siavi] = await Promise.all([
    rest('compagnie_avions?statut=eq.en_reparation&detruit=eq.false&select=id,compagnie_id,immatriculation,usure_percent'),
    rest('inventaire_avions?statut=eq.en_reparation&select=id,proprietaire_id,immatriculation,usure_percent'),
    rest('siavi_avions?statut=eq.en_reparation&select=id,immatriculation,usure_percent'),
  ]);

  console.log(`À réparer — compagnie: ${compagnie.length}, inventaire: ${inventaire.length}, siavi: ${siavi.length}`);
  if (!compagnie.length && !inventaire.length && !siavi.length) {
    console.log('Aucun avion en réparation.');
    return;
  }

  for (const a of compagnie) {
    await rest(`compagnie_avions?id=eq.${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ usure_percent: 100, statut: 'disponible' }),
    });
    await rest(
      `reparation_demandes?avion_id=eq.${a.id}&statut=in.(demandee,acceptee,en_transit,en_reparation,mini_jeux,terminee,facturee,payee,retour_transit)`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          statut: 'completee',
          usure_apres: 100,
          completee_at: new Date().toISOString(),
          fin_reparation_at: new Date().toISOString(),
          retour_transit_eta_at: null,
          entreprise_transit_eta_at: null,
        }),
      },
    );
  }

  for (const a of inventaire) {
    await rest(`inventaire_avions?id=eq.${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ usure_percent: 100, statut: 'ground' }),
    });
  }

  for (const a of siavi) {
    await rest(`siavi_avions?id=eq.${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ usure_percent: 100, statut: 'ground' }),
    });
  }

  // Agrégation compensations
  const byCompagnie = new Map();
  for (const a of compagnie) {
    byCompagnie.set(a.compagnie_id, (byCompagnie.get(a.compagnie_id) || 0) + 1);
  }
  for (const [compagnieId, n] of byCompagnie) {
    const comptes = await rest(`felitz_comptes?compagnie_id=eq.${compagnieId}&type=eq.entreprise&select=id`);
    if (!comptes[0]) {
      console.warn(`Pas de compte entreprise pour compagnie ${compagnieId}`);
      continue;
    }
    const ok = await rpc('crediter_avec_trace', {
      p_compte_id: comptes[0].id,
      p_montant: n * COMPENSATION,
      p_libelle: LIBELLE,
    });
    console.log(`Crédit entreprise ${comptes[0].id}: ${n * COMPENSATION} F$ (${n} avions) → ${ok}`);
  }

  const byOwner = new Map();
  for (const a of inventaire) {
    byOwner.set(a.proprietaire_id, (byOwner.get(a.proprietaire_id) || 0) + 1);
  }
  for (const [ownerId, n] of byOwner) {
    const comptes = await rest(`felitz_comptes?proprietaire_id=eq.${ownerId}&type=eq.personnel&select=id`);
    if (!comptes[0]) {
      console.warn(`Pas de compte personnel pour ${ownerId}`);
      continue;
    }
    const ok = await rpc('crediter_avec_trace', {
      p_compte_id: comptes[0].id,
      p_montant: n * COMPENSATION,
      p_libelle: LIBELLE,
    });
    console.log(`Crédit personnel ${comptes[0].id}: ${n * COMPENSATION} F$ (${n} avions) → ${ok}`);
  }

  if (siavi.length) {
    const comptes = await rest('felitz_comptes?type=eq.siavi&select=id&limit=1');
    if (comptes[0]) {
      const ok = await rpc('crediter_avec_trace', {
        p_compte_id: comptes[0].id,
        p_montant: siavi.length * COMPENSATION,
        p_libelle: LIBELLE,
      });
      console.log(`Crédit SIAVI ${comptes[0].id}: ${siavi.length * COMPENSATION} F$ → ${ok}`);
    }
  }

  const left = await Promise.all([
    rest('compagnie_avions?statut=eq.en_reparation&detruit=eq.false&select=id'),
    rest('inventaire_avions?statut=eq.en_reparation&select=id'),
    rest('siavi_avions?statut=eq.en_reparation&select=id'),
  ]);
  console.log('Restants en réparation:', {
    compagnie: left[0].length,
    inventaire: left[1].length,
    siavi: left[2].length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
