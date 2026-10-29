export default function PilotLoading() {
  return <div className="space-y-6" aria-busy="true" aria-label="Chargement de la salle de préparation du vol">
    <div className="h-24 rounded-lg border border-slate-800 bg-slate-900" />
    <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-24 rounded-lg border border-slate-800 bg-slate-900" />)}</div>
    <p className="text-sm text-slate-400">Chargement de votre situation de vol…</p>
  </div>;
}
