export default function GroundLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <p className="text-sm text-slate-300">Chargement de votre espace Ground Crew…</p>
      <div aria-hidden="true" className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />
      <div aria-hidden="true" className="h-48 rounded-xl bg-slate-800/30 animate-pulse" />
    </div>
  );
}
