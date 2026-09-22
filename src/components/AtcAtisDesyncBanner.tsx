'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Square } from 'lucide-react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

const POLL_MS = 12_000;

type DesyncInstance = {
  instance_id: number;
  aeroport: string | null;
  airport: string | null;
  position: string | null;
  bot_broadcasting: boolean;
  db_broadcasting: boolean;
  desync: boolean;
};

export default function AtcAtisDesyncBanner() {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [rows, setRows] = useState<DesyncInstance[]>([]);
  const [stoppingId, setStoppingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/atc/atis/overview', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.instances)) {
        setRows([]);
        return;
      }
      setRows(
        (data.instances as DesyncInstance[]).filter((i) => i.desync),
      );
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function stopInstance(instanceId: number) {
    setStoppingId(instanceId);
    try {
      await fetch('/api/atc/atis/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instanceId }),
      });
      await load();
    } finally {
      setStoppingId(null);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div
      role="status"
      className={`shrink-0 border-b px-4 py-2 ${
        isDark
          ? 'border-amber-500/40 bg-amber-950/70 text-amber-100'
          : 'border-amber-400/50 bg-amber-100 text-amber-950'
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">
            ATIS désynchronisé ({rows.length} instance{rows.length > 1 ? 's' : ''})
          </p>
          <ul className="text-xs space-y-1">
            {rows.map((inst) => {
              const code = inst.aeroport || inst.airport || '—';
              const detail = inst.bot_broadcasting && !inst.db_broadcasting
                ? 'bot en diffusion, base vide'
                : 'base active, bot inactif';
              return (
                <li key={inst.instance_id} className="flex flex-wrap items-center gap-2">
                  <span>
                    #{inst.instance_id} · {code}
                    {inst.position ? ` ${inst.position}` : ''} — {detail}
                  </span>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                      isDark
                        ? 'border-amber-400/50 hover:bg-amber-500/20'
                        : 'border-amber-700/40 hover:bg-amber-200'
                    }`}
                    disabled={stoppingId === inst.instance_id}
                    onClick={() => void stopInstance(inst.instance_id)}
                  >
                    <Square className="h-3 w-3" />
                    {stoppingId === inst.instance_id ? 'Stop…' : 'Stop'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
