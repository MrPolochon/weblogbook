'use client';

import { useCallback, useEffect, useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint, Trash2 } from 'lucide-react';

type PasskeyRow = {
  id: string;
  device_name: string | null;
  created_at: string;
};

function defaultDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Mon appareil';
  const ua = navigator.userAgent;
  if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
  if (/Android/i.test(ua)) return 'Appareil Android';
  if (/Mac/i.test(ua)) return 'Mac (Touch ID)';
  if (/Windows/i.test(ua)) return 'Windows Hello';
  return 'Mon appareil';
}

export async function registerPasskeyOnDevice(deviceName?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const optRes = await fetch('/api/auth/passkeys/register/options', {
      method: 'POST',
      credentials: 'include',
    });
    const optData = await optRes.json().catch(() => ({}));
    if (!optRes.ok) {
      return { ok: false, error: optData.error || 'Impossible de préparer l’enregistrement.' };
    }

    const attestation = await startRegistration({ optionsJSON: optData });

    const verifyRes = await fetch('/api/auth/passkeys/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        response: attestation,
        deviceName: deviceName ?? defaultDeviceLabel(),
      }),
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok) {
      return { ok: false, error: verifyData.error || 'Enregistrement biométrique échoué.' };
    }

    return { ok: true };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError') {
      return { ok: false, error: 'Opération annulée ou refusée par l’appareil.' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur lors de l’enregistrement biométrique.',
    };
  }
}

export async function authenticateWithPasskey(): Promise<{ ok: true } | { ok: false; error: string; forceEmail?: boolean }> {
  try {
    const optRes = await fetch('/api/auth/passkeys/authenticate/options', {
      method: 'POST',
      credentials: 'include',
    });
    const optData = await optRes.json().catch(() => ({}));
    if (!optRes.ok) {
      return {
        ok: false,
        error: optData.error || 'Impossible de préparer la vérification biométrique.',
        forceEmail: Boolean(optData.forceEmail),
      };
    }

    // Ceremony modale obligatoire (pas d'autofill silencieux) + UV required côté serveur.
    const assertion = await startAuthentication({
      optionsJSON: optData,
      useBrowserAutofill: false,
    });

    const verifyRes = await fetch('/api/auth/passkeys/authenticate/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ response: assertion }),
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok) {
      return {
        ok: false,
        error: verifyData.error || 'Vérification biométrique échouée.',
        forceEmail: Boolean(verifyData.forceEmail),
      };
    }

    return { ok: true };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError') {
      return { ok: false, error: 'Opération annulée ou refusée par l’appareil.' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erreur lors de la vérification biométrique.',
    };
  }
}

export default function PasskeysSection({
  variant = 'default',
}: {
  variant?: 'default' | 'atc' | 'siavi';
}) {
  const isSiavi = variant === 'siavi';
  const isAtcOrSiavi = variant === 'atc' || isSiavi;
  const textTitle = isAtcOrSiavi ? 'text-slate-800' : 'text-slate-200';
  const textMuted = isAtcOrSiavi ? 'text-slate-600' : 'text-slate-400';
  const cardClass = isSiavi ? '' : 'card';

  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadPasskeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/passkeys', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPasskeys(data.passkeys ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPasskeys();
  }, [loadPasskeys]);

  async function handleRegister() {
    setMessage(null);
    setRegistering(true);
    const result = await registerPasskeyOnDevice();
    if (result.ok) {
      setMessage({
        type: 'ok',
        text: 'Passkey enregistrée. Vous pourrez vous vérifier par biométrie lors des prochaines connexions (sauf reconnexion mensuelle par email).',
      });
      await loadPasskeys();
    } else {
      setMessage({ type: 'err', text: result.error });
    }
    setRegistering(false);
  }

  async function handleDelete(id: string) {
    setMessage(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/auth/passkeys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setMessage({ type: 'ok', text: 'Passkey supprimée.' });
      await loadPasskeys();
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Impossible de supprimer la passkey.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className={`text-lg font-bold mb-2 flex items-center gap-2 ${isSiavi ? 'text-slate-800' : textTitle}`}>
        <Fingerprint className="h-5 w-5 text-sky-400" />
        Vérification biométrique (passkey)
      </h2>
      <p className={`${textMuted} text-sm mb-4`}>
        Enregistrez une passkey pour valider la connexion sans code email (sauf une fois par mois).
        Sur PC/Mac : biométrie locale si disponible, sinon QR à scanner avec le téléphone.
        Astuce : ajoutez aussi une passkey depuis votre téléphone pour que le QR fonctionne partout.
        Seules des clés publiques sont stockées — jamais vos données biométriques.
      </p>

      {loading ? (
        <p className={`${textMuted} text-sm`}>Chargement…</p>
      ) : passkeys.length === 0 ? (
        <p className={`${textMuted} text-sm mb-3`}>Aucune passkey enregistrée sur ce compte.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {passkeys.map((pk) => (
            <li
              key={pk.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {pk.device_name || 'Appareil'}
                </p>
                <p className="text-xs text-slate-500">
                  Ajoutée le{' '}
                  {new Date(pk.created_at).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(pk.id)}
                disabled={deletingId === pk.id}
                className="shrink-0 p-2 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                title="Supprimer cette passkey"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p
          className={
            message.type === 'ok'
              ? isSiavi
                ? 'text-emerald-600 text-sm font-medium mb-3'
                : 'text-emerald-400 text-sm mb-3'
              : isSiavi
                ? 'text-red-600 text-sm font-medium mb-3'
                : 'text-red-400 text-sm mb-3'
          }
        >
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={handleRegister}
        disabled={registering}
        className={
          isSiavi
            ? 'px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors disabled:opacity-50'
            : 'btn-primary'
        }
      >
        {registering ? 'Enregistrement…' : 'Ajouter une passkey sur cet appareil'}
      </button>
    </div>
  );
}
