'use client';
export default function PrintRadioSheet() {
  return <button type="button" onClick={()=>window.print()} className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 print:hidden">Imprimer / PDF</button>;
}
