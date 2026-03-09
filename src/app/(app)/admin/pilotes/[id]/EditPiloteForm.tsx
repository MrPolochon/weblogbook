'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function EditPiloteForm({
  piloteId,
  identifiant: identifiantInitial,
  role: roleInitial,
  armee: armeeInitial,
  atc: atcInitial,
  ifsa: ifsaInitial,
  siavi: siaviInitial,
  heuresInitiales,
  blockedUntil,
  blockReason,
}: {
  piloteId: string;
  identifiant: string;
  role: string;
  armee: boolean;
  atc: boolean;
  ifsa: boolean;
  siavi: boolean;
  heuresInitiales: number;
  blockedUntil: string | null;
  blockReason: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [identifiant, setIdentifiant] = useState(identifiantInitial);
  const [role, setRole] = useState(roleInitial);
  const [armee, setArmee] = useState(armeeInitial);
  const [atc, setAtc] = useState(atcInitial);
  const [ifsa, setIfsa] = useState(ifsaInitial);
  const [siavi, setSiavi] = useState(siaviInitial);
  const [accesPilote, setAccesPilote] = useState(false);
  const [heures, setHeures] = useState(String(heuresInitiales));
  const [blockMinutes, setBlockMinutes] = useState('');
  const [blockReasonVal, setBlockReasonVal] = useState(blockReason ?? '');
  const [loading, setLoading] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [superadminStep, setSuperadminStep] = useState<'password' | 'code' | null>(null);
  const [superadminPassword, setSuperadminPassword] = useState('');
  const [superadminCode, setSuperadminCode] = useState('');
  const [resetPasswordStep, setResetPasswordStep] = useState<'code' | null>(null);
  const [resetPasswordCode, setResetPasswordCode] = useState('');

  
  // Sync initial values
  useEffect(() => { setAtc(atcInitial); }, [atcInitial]);
  useEffect(() => { setIfsa(ifsaInitial); }, [ifsaInitial]);
  useEffect(() => { setSiavi(siaviInitial); }, [siaviInitial]);
  useEffect(() => { setRole(roleInitial); }, [roleInitial]);
  
  // Initialiser accesPilote selon le rôle initial
  useEffect(() => { 
    if (roleInitial === 'atc' || roleInitial === 'siavi') {
      setAccesPilote(false);
    } else if (roleInitial === 'pilote' && (atcInitial || siaviInitial)) {
      setAccesPilote(true);
    }
  }, [roleInitial, atcInitial, siaviInitial]);

  // Quand le rôle change, synchroniser les accès automatiquement
  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    
    // Si on passe en SIAVI uniquement, désactiver ATC et Armée
    if (newRole === 'siavi') {
      setAtc(false);
      setArmee(false);
      setSiavi(true);
    }
    // Si on passe en ATC uniquement, désactiver SIAVI et Armée
    else if (newRole === 'atc') {
      setSiavi(false);
      setArmee(false);
      setAtc(true);
    }
    // Si on passe en pilote, garder les valeurs actuelles
    // Si on passe en admin, garder les valeurs actuelles
  };

  const isBlocked = blockedUntil ? new Date(blockedUntil) > new Date() : false;

  async function handleSaveRoles(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const id = String(identifiant).trim().toLowerCase();
      if (!id || id.length < 2) throw new Error('Identifiant trop court');
      
      const body: { 
        identifiant: string; 
        armee?: boolean; 
        atc?: boolean; 
        ifsa?: boolean;
        siavi?: boolean;
        role?: string;
      } = { 
        identifiant: id,
        ifsa: ifsa,
        siavi: siavi
      };

      // Gestion du rôle principal - logique simplifiée
      if (role === 'admin') {
        body.role = 'admin';
        body.armee = armee;
        body.atc = atc;
      } else if (role === 'atc') {
        // ATC uniquement ou ATC avec accès pilote
        if (accesPilote) {
          body.role = 'pilote';
          body.atc = true;
        } else {
          body.role = 'atc';
          body.atc = true;
        }
        body.armee = false;
        body.siavi = false;
      } else if (role === 'siavi') {
        // SIAVI uniquement ou SIAVI avec accès pilote
        if (accesPilote) {
          body.role = 'pilote';
          body.siavi = true;
        } else {
          body.role = 'siavi';
          body.siavi = true;
        }
        body.armee = false;
        body.atc = false;
      } else {
        // Pilote standard
        body.role = 'pilote';
        body.armee = armee;
        body.atc = atc;
      }

      const res = await fetch(`/api/pilotes/${piloteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(superadminStep === 'code' ? { ...body, superadmin_code: superadminCode.replace(/\s/g, '') } : body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.code === 'SUPERADMIN_REQUIRED') {
        setError(data.error || 'Mot de passe superadmin et code requis.');
        setSuperadminStep('password');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess('Rôles mis à jour');
      setSuperadminStep(null);
      setSuperadminPassword('');
      setSuperadminCode('');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendSuperadminCode() {
    if (!superadminPassword.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/superadmin/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: superadminPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuperadminStep('code');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendResetCode() {
    setError(null);
    setLoadingReset(true);
    try {
      const res = await fetch('/api/admin/send-password-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: piloteId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setResetPasswordStep('code');
      setResetPasswordCode('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingReset(false);
    }
  }

  async function handleConfirmResetPassword() {
    if (!confirm('Réinitialiser le mot de passe à 1234567890 ? L\'utilisateur devra se reconnecter.')) return;
    const code = resetPasswordCode.trim().replace(/\s/g, '');
    if (code.length !== 6) {
      setError('Saisissez le code à 6 chiffres envoyé à l\'email du compte.');
      return;
    }
    setError(null);
    setLoadingReset(true);
    try {
      const res = await fetch(`/api/pilotes/${piloteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_password: true, verification_code: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setResetPasswordStep(null);
      setResetPasswordCode('');
      setSuccess('Mot de passe réinitialisé à 1234567890.');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingReset(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const h = parseInt(heures, 10);
      if (isNaN(h) || h < 0) throw new Error('Heures initiales invalides');

      const res = await fetch(`/api/pilotes/${piloteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heures_initiales_minutes: h }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const m = parseInt(blockMinutes, 10);
    if (isNaN(m) || m < 1) {
      setError('Indiquez une durée en minutes (≥ 1).');
      return;
    }
    setLoading(true);
    try {
      const d = new Date();
      d.setMinutes(d.getMinutes() + m);
      const res = await fetch(`/api/pilotes/${piloteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocked_until: d.toISOString(),
          block_reason: blockReasonVal || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setBlockMinutes('');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnblock() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/pilotes/${piloteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked_until: null, block_reason: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setBlockReasonVal('');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-6">
      <form onSubmit={handleSaveRoles} className="space-y-4">
        <h2 className="text-lg font-medium text-slate-200">Identifiant et rôles</h2>
        
        <div>
          <label className="label">Identifiant de connexion</label>
          <input
            type="text"
            className="input max-w-xs"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            placeholder="ex: jdupont"
          />
        </div>

        {/* Rôle principal */}
        <div>
          <label className="label">Rôle principal</label>
          <select
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
            className="input max-w-xs"
          >
            <option value="pilote">Pilote</option>
            <option value="atc">ATC uniquement</option>
            <option value="siavi">SIAVI/Pompier uniquement</option>
            <option value="admin">Administrateur</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">
            {role === 'admin' && '⚠️ Les administrateurs ont accès à toutes les fonctionnalités du site.'}
            {role === 'atc' && 'Accès uniquement à l\'espace ATC, pas d\'espace pilote.'}
            {role === 'siavi' && 'Accès uniquement à l\'espace SIAVI/Pompier, pas d\'espace pilote.'}
            {role === 'pilote' && 'Accès à l\'espace pilote. Peut aussi avoir accès à l\'ATC ou SIAVI si coché.'}
          </p>
        </div>

        {/* Accès additionnels */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-300">Accès additionnels :</p>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* Armée */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={armee} 
                onChange={(e) => setArmee(e.target.checked)} 
                className="rounded"
                disabled={role === 'atc' || role === 'siavi'}
              />
              <span className={`${role === 'atc' || role === 'siavi' ? 'text-slate-500' : 'text-slate-300'}`}>
                🎖️ Armée (Espace militaire)
              </span>
            </label>

            {/* ATC */}
            {role !== 'atc' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={atc} 
                  onChange={(e) => setAtc(e.target.checked)} 
                  className="rounded"
                  disabled={role === 'siavi'}
                />
                <span className={`${role === 'siavi' ? 'text-slate-500' : 'text-slate-300'}`}>📡 ATC (Espace ATC)</span>
              </label>
            )}

            {/* IFSA */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={ifsa} 
                onChange={(e) => setIfsa(e.target.checked)} 
                className="rounded" 
              />
              <span className="text-slate-300">🛡️ IFSA (Modération aviation)</span>
            </label>

            {/* SIAVI */}
            {role !== 'siavi' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={siavi} 
                  onChange={(e) => setSiavi(e.target.checked)} 
                  className="rounded"
                  disabled={role === 'atc'}
                />
                <span className={`${role === 'atc' ? 'text-slate-500' : 'text-slate-300'}`}>🚒 SIAVI (Espace SIAVI/Pompier)</span>
              </label>
            )}
          </div>

          <p className="text-xs text-slate-500">
            IFSA = International Flight Safety Authority. SIAVI = Service d&apos;Incendie et d&apos;Assistance aux Victimes d&apos;Incidents.
          </p>
        </div>

        {/* Accès pilote pour rôle ATC ou SIAVI */}
        {(role === 'atc' || role === 'siavi') && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={accesPilote} 
              onChange={(e) => setAccesPilote(e.target.checked)} 
              className="rounded" 
            />
            <span className="text-slate-300">
              ✈️ Ajouter accès pilote (permet d&apos;accéder à l&apos;espace pilote en plus)
            </span>
          </label>
        )}

        {role === 'admin' && (superadminStep === 'password' || superadminStep === 'code') && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <p className="text-amber-200 text-sm font-medium">Vérification requise pour le rôle administrateur</p>
            {superadminStep === 'password' && (
              <>
                <input
                  type="password"
                  className="input max-w-xs"
                  value={superadminPassword}
                  onChange={(e) => setSuperadminPassword(e.target.value)}
                  placeholder="Mot de passe superadmin"
                  autoComplete="current-password"
                />
                <button type="button" onClick={handleSendSuperadminCode} disabled={loading} className="btn-secondary text-sm">
                  {loading ? 'Envoi…' : 'Envoyer le code par email'}
                </button>
              </>
            )}
            {superadminStep === 'code' && (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="input max-w-[8rem] text-center font-mono text-lg tracking-widest"
                  value={superadminCode}
                  onChange={(e) => setSuperadminCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                />
                <p className="text-slate-400 text-xs">Puis cliquez sur « Enregistrer identifiant / rôles » ci-dessous.</p>
              </>
            )}
          </div>
        )}

        {success && <p className="text-emerald-400 text-sm">{success}</p>}
        
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Enregistrer identifiant / rôles'}
        </button>
      </form>

      <div>
        <h2 className="text-lg font-medium text-slate-200 mb-2">Mot de passe</h2>
        <p className="text-slate-400 text-sm mb-2">Un code de vérification est envoyé à l&apos;email du compte ; saisissez-le pour confirmer la réinitialisation.</p>
        {resetPasswordStep !== 'code' ? (
          <button
            type="button"
            onClick={handleSendResetCode}
            className="btn-secondary"
            disabled={loadingReset}
          >
            {loadingReset ? 'Envoi…' : 'Envoyer le code par email'}
          </button>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="input max-w-[8rem] text-center font-mono text-lg tracking-widest"
              value={resetPasswordCode}
              onChange={(e) => setResetPasswordCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
            />
            <button
              type="button"
              onClick={handleConfirmResetPassword}
              className="btn-primary"
              disabled={loadingReset || resetPasswordCode.length !== 6}
            >
              {loadingReset ? 'Envoi…' : 'Confirmer et réinitialiser (1234567890)'}
            </button>
            <button
              type="button"
              onClick={() => { setResetPasswordStep(null); setResetPasswordCode(''); setError(null); }}
              className="btn-secondary"
              disabled={loadingReset}
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      <hr className="border-slate-700" />

      <form onSubmit={handleSave} className="space-y-4">
        <h2 className="text-lg font-medium text-slate-200">Heures initiales</h2>
        <div>
          <label className="label">Minutes</label>
          <input
            type="number"
            className="input w-32"
            value={heures}
            onChange={(e) => setHeures(e.target.value)}
            min={0}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      <hr className="border-slate-700" />

      <div>
        <h2 className="text-lg font-medium text-slate-200 mb-2">Blocage</h2>
        {isBlocked ? (
          <div>
            <p className="text-amber-400 text-sm mb-2">Ce pilote est bloqué.</p>
            <div>
              <label className="label">Raison (optionnel)</label>
              <input
                type="text"
                className="input max-w-md"
                value={blockReasonVal}
                onChange={(e) => setBlockReasonVal(e.target.value)}
                placeholder="Raison du blocage"
              />
            </div>
            <button
              type="button"
              onClick={handleUnblock}
              className="btn-secondary mt-3"
              disabled={loading}
            >
              Débloquer maintenant
            </button>
          </div>
        ) : (
          <form onSubmit={handleBlock} className="space-y-2">
            <label className="label">Bloquer pour (minutes)</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input w-32"
                value={blockMinutes}
                onChange={(e) => setBlockMinutes(e.target.value)}
                min={1}
                placeholder="ex: 60"
              />
              <input
                type="text"
                className="input flex-1"
                value={blockReasonVal}
                onChange={(e) => setBlockReasonVal(e.target.value)}
                placeholder="Raison (optionnel)"
              />
              <button type="submit" className="btn-secondary" disabled={loading}>
                Bloquer
              </button>
            </div>
          </form>
        )}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
