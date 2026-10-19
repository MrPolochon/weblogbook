export function handoverWarningStage(start: number, now: number): 0|1|2|3 {
  const remaining=start-now;
  if(remaining<=0 || remaining>180000) return 0;
  return remaining>120000 ? 1 : remaining>60000 ? 2 : 3;
}
