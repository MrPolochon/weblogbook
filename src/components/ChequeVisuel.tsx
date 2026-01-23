'use client';

import { useState } from 'react';
import { Loader2, Check, Banknote } from 'lucide-react';

interface ChequeProps {
  id: string;
  montant: number;
  destinataire: string;
  compagnieNom?: string;
  numeroVol?: string;
  libelle?: string;
  date: string;
  encaisse: boolean;
  pourCompagnie?: boolean;
  onEncaisser?: () => Promise<void>;
}

function nombreEnLettres(n: number): string {
  const unites = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const dizaines = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  
  if (n === 0) return 'zero';
  if (n < 20) return unites[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (d === 7 || d === 9) {
      return dizaines[d] + '-' + unites[10 + u];
    }
    return dizaines[d] + (u ? '-' + unites[u] : (d === 8 ? 's' : ''));
  }
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const r = n % 100;
    return (c === 1 ? 'cent' : unites[c] + ' cent') + (r ? ' ' + nombreEnLettres(r) : (c > 1 ? 's' : ''));
  }
  if (n < 1000000) {
    const m = Math.floor(n / 1000);
    const r = n % 1000;
    return (m === 1 ? 'mille' : nombreEnLettres(m) + ' mille') + (r ? ' ' + nombreEnLettres(r) : '');
  }
  const millions = Math.floor(n / 1000000);
  const reste = n % 1000000;
  return nombreEnLettres(millions) + ' million' + (millions > 1 ? 's' : '') + (reste ? ' ' + nombreEnLettres(reste) : '');
}

export default function ChequeVisuel({ 
  id, montant, destinataire, compagnieNom, numeroVol, libelle, date, encaisse, pourCompagnie, onEncaisser 
}: ChequeProps) {
  const [loading, setLoading] = useState(false);
  const [isEncaisse, setIsEncaisse] = useState(encaisse);
  
  const dateObj = new Date(date);
  const dateFormatee = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  
  const montantEnLettres = nombreEnLettres(montant) + ' felitz dollars';

  async function handleEncaisser() {
    if (!onEncaisser || isEncaisse) return;
    setLoading(true);
    try {
      await onEncaisser();
      setIsEncaisse(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      {/* Chèque */}
      <div 
        className={`relative w-full max-w-2xl mx-auto rounded-lg overflow-hidden shadow-xl transition-all ${
          isEncaisse ? 'opacity-60 grayscale' : ''
        }`}
        style={{ 
          background: 'linear-gradient(135deg, #e8f4f8 0%, #d4e8ed 50%, #c5dce3 100%)',
          fontFamily: 'Georgia, serif'
        }}
      >
        {/* Tampon ENCAISSE */}
        {isEncaisse && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="transform rotate-[-15deg] border-4 border-emerald-600 rounded-lg px-6 py-2 bg-emerald-100/80">
              <span className="text-3xl font-bold text-emerald-600 tracking-widest">ENCAISSÉ</span>
            </div>
          </div>
        )}

        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-slate-600 flex items-center justify-center bg-white/50">
                <Banknote className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">FELITZ BANK</h3>
                <p className="text-xs text-slate-600">Banque Virtuelle Internationale</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">DATE</p>
              <p className="font-semibold text-slate-800 border-b border-slate-400 pb-1 min-w-[150px]">
                {dateFormatee}
              </p>
            </div>
          </div>

          {/* Pay to */}
          <div className="flex items-center gap-4 mt-6">
            <div className="text-sm text-slate-600 whitespace-nowrap">
              PAYEZ À<br/>L&apos;ORDRE DE
            </div>
            <div className="flex-1 border-b border-slate-400 pb-1">
              <p className="font-semibold text-slate-800 text-lg">
                {pourCompagnie ? compagnieNom : destinataire}
              </p>
            </div>
            <div className="border-2 border-slate-600 px-4 py-2 bg-white/70 min-w-[140px] text-center">
              <span className="text-slate-600 text-lg">F$</span>
              <span className="font-bold text-2xl text-slate-800 ml-2">
                {montant.toLocaleString('fr-FR')}
              </span>
            </div>
          </div>

          {/* Amount in words */}
          <div className="border-b border-slate-400 pb-1 mt-4">
            <p className="text-slate-700 capitalize">{montantEnLettres}</p>
          </div>
          <div className="text-right text-slate-600 text-sm">FELITZ DOLLARS</div>

          {/* Memo */}
          <div className="flex items-end justify-between mt-6">
            <div className="flex-1">
              <p className="text-sm text-slate-600">MÉMO</p>
              <div className="border-b border-slate-400 pb-1 max-w-[300px]">
                <p className="text-slate-700 text-sm">
                  {libelle || `Vol ${numeroVol || 'N/A'}`}
                  {compagnieNom && !pourCompagnie && ` - ${compagnieNom}`}
                </p>
              </div>
            </div>
            <div className="border-b border-slate-400 pb-1 min-w-[200px] text-center">
              <p className="text-slate-500 italic text-sm">Signature électronique</p>
            </div>
          </div>

          {/* Bottom strip */}
          <div className="bg-slate-700 -mx-6 -mb-6 mt-6 px-6 py-2 flex justify-center gap-8">
            <span className="font-mono text-white text-sm tracking-wider">
              {id.slice(0, 4).toUpperCase()}
            </span>
            <span className="font-mono text-white text-sm tracking-wider">
              {id.slice(4, 8).toUpperCase()}
            </span>
            <span className="font-mono text-white text-sm tracking-wider">
              {Date.now().toString().slice(-8)}
            </span>
            <span className="font-mono text-white text-sm tracking-wider">
              FELITZ
            </span>
          </div>
        </div>
      </div>

      {/* Bouton encaisser */}
      {!isEncaisse && onEncaisser && (
        <div className="mt-4 text-center">
          <button
            onClick={handleEncaisser}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Encaissement en cours...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Encaisser le chèque
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
