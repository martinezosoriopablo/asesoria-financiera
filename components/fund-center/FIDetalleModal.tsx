'use client';

import { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';

interface FIDetalleProps {
  rut: string;
  nombre: string;
  administradora: string;
  onClose: () => void;
}

interface FIFichaData {
  tac_serie: number | null;
  nombre_fondo: string | null;
  horizonte_inversion: string | null;
  tolerancia_riesgo: string | null;
  objetivo: string | null;
  rescatable: boolean | null;
  plazo_rescate: string | null;
  rentabilidades: {
    rent_1m: number | null;
    rent_3m: number | null;
    rent_6m: number | null;
    rent_12m: number | null;
  };
}

interface FIPrecio {
  serie: string;
  fecha: string;
  valor_libro: number;
  valor_economico: number | null;
  rent_diaria: number | null;
}

export default function FIDetalleModal({ rut, nombre, administradora, onClose }: FIDetalleProps) {
  const [ficha, setFicha] = useState<FIFichaData | null>(null);
  const [precios, setPrecios] = useState<FIPrecio[]>([]);
  const [loading, setLoading] = useState(true);
  const [fondoId, setFondoId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load ficha and prices in parallel
        const [fichaRes, preciosRes] = await Promise.all([
          fetch(`/api/fondos-inversion/ficha?rut=${rut}`),
          // First get the fondo ID from lookup
          fetch(`/api/fondos-inversion/lookup?q=${rut}`),
        ]);
        const fichaData = await fichaRes.json();
        if (fichaData.extracted) setFicha(fichaData.extracted);

        const lookupData = await preciosRes.json();
        if (lookupData.success && lookupData.results?.length > 0) {
          const fi = lookupData.results[0];
          setFondoId(fi.id);
          // Now load detail with prices
          const detailRes = await fetch(`/api/fondos-inversion/lookup?id=${fi.id}&dias=15`);
          const detailData = await detailRes.json();
          if (detailData.success && detailData.precios) {
            setPrecios(detailData.precios.slice(0, 10));
          }
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    loadData();
  }, [rut]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gb-border">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded shrink-0">FI</span>
              <h2 className="text-base font-semibold text-gb-black truncate">{nombre}</h2>
            </div>
            <p className="text-xs text-gb-gray">{administradora} &middot; RUT {rut}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0 ml-2">
            <X className="w-5 h-5 text-gb-gray" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 text-gb-gray animate-spin" />
            </div>
          ) : (
            <>
              {/* Ficha data */}
              {ficha ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {ficha.tac_serie != null && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="text-[10px] text-blue-600 font-medium uppercase">TAC Serie</div>
                        <div className="text-lg font-bold text-blue-900">{ficha.tac_serie}%</div>
                      </div>
                    )}
                    {ficha.horizonte_inversion && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-[10px] text-gb-gray font-medium uppercase">Horizonte</div>
                        <div className="text-sm font-semibold text-gb-black capitalize">{ficha.horizonte_inversion}</div>
                      </div>
                    )}
                    {ficha.tolerancia_riesgo && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-[10px] text-gb-gray font-medium uppercase">Riesgo</div>
                        <div className="text-sm font-semibold text-gb-black capitalize">{ficha.tolerancia_riesgo}</div>
                      </div>
                    )}
                    {ficha.rescatable != null && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-[10px] text-gb-gray font-medium uppercase">Rescatable</div>
                        <div className="text-sm font-semibold text-gb-black">
                          {ficha.rescatable ? 'Sí' : 'No'}
                        </div>
                      </div>
                    )}
                    {ficha.plazo_rescate && (
                      <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                        <div className="text-[10px] text-gb-gray font-medium uppercase">Plazo Rescate</div>
                        <div className="text-sm font-semibold text-gb-black">{ficha.plazo_rescate}</div>
                      </div>
                    )}
                  </div>

                  {/* Rentabilidades from ficha */}
                  {(ficha.rentabilidades.rent_1m != null || ficha.rentabilidades.rent_12m != null) && (
                    <div className="bg-white rounded-lg border border-gb-border p-4">
                      <div className="text-xs font-semibold text-gb-gray uppercase mb-2">Rentabilidades (Ficha)</div>
                      <div className="grid grid-cols-4 gap-3 text-center">
                        {[
                          { label: '1M', val: ficha.rentabilidades.rent_1m },
                          { label: '3M', val: ficha.rentabilidades.rent_3m },
                          { label: '6M', val: ficha.rentabilidades.rent_6m },
                          { label: '12M', val: ficha.rentabilidades.rent_12m },
                        ].map(r => (
                          <div key={r.label}>
                            <div className="text-[10px] text-gb-gray">{r.label}</div>
                            <div className={`text-sm font-semibold ${r.val != null ? (r.val > 0 ? 'text-emerald-600' : 'text-red-500') : 'text-gb-gray'}`}>
                              {r.val != null ? `${r.val > 0 ? '+' : ''}${r.val.toFixed(2)}%` : '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ficha.objetivo && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs font-semibold text-gb-gray uppercase mb-1">Objetivo</div>
                      <p className="text-xs text-gb-black leading-relaxed">{ficha.objetivo}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 rounded-lg p-4 text-sm text-amber-800">
                  Sin ficha CMF sincronizada para este fondo. Usa &quot;Sync Fichas CMF&quot; para descargarla.
                </div>
              )}

              {/* Recent prices */}
              {precios.length > 0 && (
                <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gb-border">
                    <span className="text-xs font-semibold text-gb-gray">Últimos precios</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gb-gray border-b border-gb-border">
                        <th className="text-left px-4 py-1.5 font-medium">Fecha</th>
                        <th className="text-left px-4 py-1.5 font-medium">Serie</th>
                        <th className="text-right px-4 py-1.5 font-medium">Valor Libro</th>
                        <th className="text-right px-4 py-1.5 font-medium">Var.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gb-border">
                      {precios.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-1.5 text-gb-black">{p.fecha}</td>
                          <td className="px-4 py-1.5 text-gb-gray">{p.serie}</td>
                          <td className="px-4 py-1.5 text-right font-mono">{Number(p.valor_libro).toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                          <td className={`px-4 py-1.5 text-right font-medium ${p.rent_diaria != null ? (Number(p.rent_diaria) > 0 ? 'text-emerald-600' : 'text-red-500') : 'text-gb-gray'}`}>
                            {p.rent_diaria != null ? `${Number(p.rent_diaria) > 0 ? '+' : ''}${Number(p.rent_diaria).toFixed(2)}%` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gb-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-gb-black text-white rounded-lg hover:bg-gb-dark transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
