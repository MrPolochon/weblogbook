export type TimelineEntrySuggest = { heure: string; description: string };

type LegBrief = {
  aeroport_depart: string;
  aeroport_arrivee: string;
  temps_prev_min: number | null | undefined;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatUtcHHMM(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function addMinutesUtc(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

function randomIntInclusive(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Propose une chronologie MEDEVAC en UTC : alerte entre 30 et 60 min avant le 1er départ,
 * puis enchaînement des départs / arrivées à partir de temps_prev_min par segment.
 */
export function buildSuggestedMedevacChronologieUtc(
  legs: LegBrief[],
  firstDepartureUtc: Date
): TimelineEntrySuggest[] {
  if (!legs.length) {
    return [
      { heure: '', description: 'MEDEVAC alert activation' },
      { heure: '', description: 'Departure' },
      { heure: '', description: 'Arrival' },
    ];
  }

  const alertMinutesBefore = randomIntInclusive(30, 60);
  const alertAt = addMinutesUtc(firstDepartureUtc, -alertMinutesBefore);

  const entries: TimelineEntrySuggest[] = [
    { heure: formatUtcHHMM(alertAt), description: 'MEDEVAC alert activation' },
  ];

  let t = new Date(firstDepartureUtc.getTime());
  for (const leg of legs) {
    entries.push({
      heure: formatUtcHHMM(t),
      description: `Departure ${leg.aeroport_depart}`,
    });
    const legMin = Math.max(1, leg.temps_prev_min ?? 45);
    const arr = addMinutesUtc(t, legMin);
    entries.push({
      heure: formatUtcHHMM(arr),
      description: `Arrival ${leg.aeroport_arrivee}`,
    });
    t = arr;
  }

  return entries;
}
