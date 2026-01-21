type Session = { aeroport: string; position: string; started_at: string; identifiant: string };

function formatDepuis(startedAt: string): string {
  const d = new Date(startedAt);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminAtcSessionsEnLigne({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-medium text-slate-800 mb-2">Positions et aéroports en ligne</h2>
        <p className="text-slate-600 text-sm">Aucun contrôleur en service.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-800 mb-4">Positions et aéroports en ligne</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="pb-2 pr-4">Aéroport</th>
              <th className="pb-2 pr-4">Position</th>
              <th className="pb-2 pr-4">Contrôleur en service</th>
              <th className="pb-2">Depuis</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={`${s.aeroport}-${s.position}`} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pr-4 font-medium text-slate-800">{s.aeroport}</td>
                <td className="py-2.5 pr-4 text-slate-700">{s.position}</td>
                <td className="py-2.5 pr-4 text-slate-700">{s.identifiant}</td>
                <td className="py-2.5 text-slate-600 tabular-nums">{formatDepuis(s.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
