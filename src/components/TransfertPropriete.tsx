'use client';

import { useState } from 'react';

export default function TransfertPropriete({ type, id, nom }: { type: 'compagnie' | 'reparation'; id: string; nom: string }) {
  const [step, setStep] = useState(0);
  const [identifiant, setIdentifiant] = useState('');
  const [cible, setCible] = useState<{ id: string; identifiant: string } | null>(null);
  const [oui, setOui] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function envoyer(action: 'verifier' | 'transferer') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/propriete/transfert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, action, identifiant, destinataire: cible?.id,
          confirmation1: true, confirmation2: oui, confirmation3: action === 'transferer' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transfert impossible');
      if (action === 'verifier') { setCible(data); setStep(1); }
      else window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : 'Service indisponible'); }
    finally { setBusy(false); }
  }

  return <section className="card space-y-3 border-amber-500/30">
    <h2 className="text-lg font-semibold text-slate-100">Transférer la propriété</h2>
    <p className="text-sm text-slate-400">Le nouveau PDG reçoit la gestion de {nom}, avec ses comptes et ses biens. Vous perdez vos droits de direction. Votre éventuel poste d’employé est conservé.</p>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {step === 0 && <form onSubmit={e => { e.preventDefault(); void envoyer('verifier'); }} className="space-y-3">
      <label className="block text-sm text-slate-200">Identifiant du nouveau PDG
        <input required value={identifiant} onChange={e => setIdentifiant(e.target.value)} className="input w-full mt-1" disabled={busy} />
      </label>
      <button className="btn-primary" disabled={busy}>{busy ? 'Vérification…' : 'Vérifier le destinataire'}</button>
    </form>}
    {step > 0 && <div className="space-y-3">
      <p className="text-slate-200">Nouveau PDG : <strong>{cible?.identifiant}</strong></p>
      <p className="text-sm text-amber-300">Confirmation {step}/3</p>
      {step === 1 && <><p>Confirmez le transfert de {nom} à cet utilisateur.</p><button className="btn-primary" onClick={() => setStep(2)}>Je confirme le destinataire</button></>}
      {step === 2 && <form onSubmit={e => { e.preventDefault(); if (oui === 'oui') setStep(3); }} className="space-y-3">
        <label className="block">Écrivez « oui » pour confirmer la perte de vos droits de PDG.
          <input className="input w-full mt-1" value={oui} onChange={e => setOui(e.target.value)} autoComplete="off" />
        </label><button className="btn-primary" disabled={oui !== 'oui'}>Confirmer</button>
      </form>}
      {step === 3 && <><p>Dernière confirmation : le transfert sera immédiat. Seul le nouveau PDG pourra vous rendre la propriété.</p>
        <button className="btn-primary" disabled={busy} onClick={() => void envoyer('transferer')}>{busy ? 'Transfert…' : 'Confirmer définitivement le transfert'}</button></>}
      <button className="btn-secondary ml-2" disabled={busy} onClick={() => { setStep(0); setCible(null); setOui(''); setError(''); }}>Annuler</button>
    </div>}
  </section>;
}
