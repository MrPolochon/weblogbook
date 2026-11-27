'use client';

import { useEffect, useState } from 'react';
import ComBox from '@/components/ComBox';
import { getOfficialFrequency, hasOfficialAirport, normalizeRadioPosition } from '@/lib/official-vhf';
import { isValidVhfFrequency } from '@/lib/vhf-frequencies';

export default function StationComBox({ aeroport, position, isDark = true }: {
  aeroport: string; position: string; isDark?: boolean;
}) {
  const airport = aeroport.trim().toUpperCase();
  const service = normalizeRadioPosition(position);
  const official = getOfficialFrequency(airport, service);
  const [stored, setStored] = useState<{ station: string; frequency: string } | null>(null);
  const station = `${airport}:${service}`;
  useEffect(() => {
    if (official || hasOfficialAirport(airport)) return;
    const controller = new AbortController();
    void fetch(`/api/vhf/frequencies?aeroport=${encodeURIComponent(airport)}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : [])
      .then((rows: { position: string; frequency: string }[]) => {
        if (controller.signal.aborted || !Array.isArray(rows)) return;
        const row = rows.find(item => normalizeRadioPosition(item.position) === service);
        if (row && isValidVhfFrequency(row.frequency)) setStored({ station, frequency: row.frequency });
      }).catch(() => {});
    return () => controller.abort();
  }, [airport, service, official, station]);
  return <ComBox key={station} placement="toolbar" isDark={isDark}
    participantName={`${airport} ${service}`} station={{ aeroport: airport, position: service }}
    defaultFrequency={official ?? (stored?.station === station ? stored.frequency : undefined)} />;
}
