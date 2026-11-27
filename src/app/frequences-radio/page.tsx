import Link from 'next/link';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { OFFICIAL_VHF_ASSIGNMENTS } from '@/lib/official-vhf';
import PrintRadioSheet from './PrintRadioSheet';

export const metadata = { title: 'Fréquences radio officielles · WebLogbook' };
const positions = ['Center', 'APP', 'Tower', 'DEP', 'Ground', 'Delivery', 'AFIS', 'RAMP'];

export default function RadioFrequenciesPage() {
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-slate-100 print:text-black">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm text-sky-300 print:text-slate-600">MIXOU AIRLINES PTFS · 24 novembre 2026</p>
        <h1 className="text-2xl font-bold">Fréquences radio officielles</h1></div>
      <PrintRadioSheet />
    </div>
    <p className="text-sm">À la prise de service, la COM box rejoint la fréquence du poste en écoute, micro coupé. Le réglage manuel et le retour à la fréquence du poste restent disponibles.</p>
    <div className="rounded-xl border border-sky-800 bg-sky-950/40 p-4 text-sm print:border-slate-300 print:bg-transparent">
      <strong>Ground Crew : canaux RAMP 131.000 à 131.625 MHz.</strong> Une fréquence distincte par aéroport, réservée aux opérations de piste. RAMP est distinct du contrôle Ground ATC.
    </div>
    <div className="overflow-x-auto rounded-xl border border-slate-700 print:overflow-visible print:border-slate-300">
      <table className="w-full text-left text-xs sm:text-sm">
        <caption className="sr-only">Attributions ATC, AFIS et RAMP en MHz</caption>
        <thead className="bg-slate-800 print:bg-slate-100"><tr><th scope="col" className="p-3">Aéroport</th>{positions.map(p=><th key={p} scope="col" className="px-2 py-3">{p}</th>)}</tr></thead>
        <tbody>{[...AEROPORTS_PTFS].sort((a,b)=>a.code.localeCompare(b.code)).map(airport=><tr key={airport.code} className="border-t border-slate-800 print:border-slate-300">
          <th scope="row" className="p-3 font-normal"><span className="font-mono font-bold">{airport.code}</span><span className="block text-xs text-slate-400 print:text-slate-600">{airport.nom}</span></th>
          {positions.map(position=>{const frequency=OFFICIAL_VHF_ASSIGNMENTS.find(f=>f.aeroport===airport.code&&f.position===position)?.frequency;
            return <td key={position} className={`whitespace-nowrap px-2 py-3 font-mono ${position==='RAMP'?'font-bold text-sky-300 print:text-black':''}`}>{frequency??'—'}</td>})}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="space-y-2 text-sm text-slate-400 print:text-slate-700">
      <p>APP : approche · DEP : départ · Delivery / Clairance : délivrance des clairances. IZOL Center correspond à Norsom Center.</p>
      <p>« — » : aucune fréquence fournie dans la liste officielle pour ce poste. Les attributions locales complémentaires restent consultables dans l’annuaire VHF.</p>
      <p>Les fréquences ATC / AFIS identiques sont reprises telles que publiées et partagent le même canal vocal. Les canaux RAMP sont tous distincts. Les ATIS conservent leur fonctionnement actuel.</p>
    </div>
    <Link className="inline-block text-sky-300 underline print:hidden" href="/atc">Retour à l’espace ATC</Link>
  </main>;
}
