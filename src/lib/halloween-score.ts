export const HALLOWEEN_BAR_COUNT = 64;
export const HALLOWEEN_DURATION_SECONDS = 180;
export const HALLOWEEN_BEAT = HALLOWEEN_DURATION_SECONDS / (HALLOWEEN_BAR_COUNT * 4);

export function halloweenSection(barIndex: number) {
  const bar = barIndex % HALLOWEEN_BAR_COUNT;
  const drop = (bar >= 16 && bar < 32) || (bar >= 48 && bar < 56);
  const build = (bar >= 8 && bar < 16) || (bar >= 40 && bar < 48);
  const outro = bar >= 56;
  const breakDown = bar >= 32 && bar < 40;
  const intensity = drop ? 1 : build ? ((bar % 8) + 1) / 8 : outro ? (64 - bar) / 8 : 0;
  return { bar, drop, build, outro, quiet: breakDown || outro, intensity,
    volume: drop ? 0.95 : build ? 0.38 + intensity * 0.37 : outro ? 0.38 - (bar - 56) * 0.015 : 0.38 };
}
