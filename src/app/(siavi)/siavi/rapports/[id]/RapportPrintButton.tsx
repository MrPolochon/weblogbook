'use client';

import { Printer } from 'lucide-react';

export default function RapportPrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
    >
      <Printer className="h-4 w-4" />
      Imprimer / PDF
    </button>
  );
}
