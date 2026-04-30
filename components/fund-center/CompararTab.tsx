'use client';

import { useState } from 'react';
import CompareMode from '@/app/fund-center/components/CompareMode';

type CompareSubTab = 'etf' | 'chileno';

export default function CompararTab() {
  const [subTab, setSubTab] = useState<CompareSubTab>('etf');

  return (
    <div className="space-y-4">
      {/* Sub-tab selector */}
      <div className="flex gap-1 bg-white p-1 rounded-xl border border-gb-border max-w-md">
        <button
          onClick={() => setSubTab('etf')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            subTab === 'etf' ? 'bg-gb-black text-white' : 'text-gb-gray hover:text-gb-black'
          }`}
        >
          ETFs Internacionales
        </button>
        <button
          onClick={() => setSubTab('chileno')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            subTab === 'chileno' ? 'bg-gb-black text-white' : 'text-gb-gray hover:text-gb-black'
          }`}
        >
          Fondos Chilenos
        </button>
      </div>

      {/* Content */}
      {subTab === 'etf' && <CompareMode />}
      {subTab === 'chileno' && (
        <div className="bg-white rounded-xl border border-gb-border p-8 text-center">
          <p className="text-sm text-gb-gray mb-2">
            Para comparar fondos chilenos, busca un fondo en la pestaña &ldquo;Buscar&rdquo; y usa el comparador dentro del detalle del fondo.
          </p>
          <p className="text-xs text-gb-gray">
            (Abre un fondo mutuo con datos cargados y encontrarás el comparador en la pestaña &ldquo;Comparar&rdquo; del modal de detalle)
          </p>
        </div>
      )}
    </div>
  );
}
