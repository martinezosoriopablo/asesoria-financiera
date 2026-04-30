'use client';

import { useState, useEffect } from 'react';
import { X, RefreshCw, Download } from 'lucide-react';

interface AdminInfo {
  nombre: string;
  count: number;
  synced: number;
}

interface SyncResultDetail {
  fo_run?: number;
  fi_rut?: string;
  nombre?: string;
  serie: string;
  status: string;
}

type FundType = 'fm' | 'fi';

export default function SyncFichasModal({ onClose }: { onClose: () => void }) {
  const [fundType, setFundType] = useState<FundType>('fm');
  const [adminList, setAdminList] = useState<AdminInfo[]>([]);
  const [fichasSynced, setFichasSynced] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingAdmin, setSyncingAdmin] = useState<string | null>(null);
  const [results, setResults] = useState<{ admin: string; synced: number; errors: number; skipped: number; details: SyncResultDetail[] }[]>([]);

  useEffect(() => {
    setResults([]);
    fetchStatus();
  }, [fundType]);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const endpoint = fundType === 'fm' ? '/api/fondos/sync-fichas' : '/api/fondos-inversion/sync-fichas';
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success) {
        if (fundType === 'fm') {
          setAdminList((data.agf_list || []).map((a: { nombre: string; count: number; synced?: number }) => ({
            nombre: a.nombre,
            count: a.count,
            synced: a.synced || 0,
          })));
        } else {
          setAdminList((data.admin_list || []).map((a: { nombre: string; count: number; synced?: number }) => ({
            ...a,
            synced: a.synced || 0,
          })));
        }
        setFichasSynced(data.fichas_synced || 0);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const syncAdmin = async (nombre: string) => {
    setSyncing(true);
    setSyncingAdmin(nombre);
    try {
      const endpoint = fundType === 'fm' ? '/api/fondos/sync-fichas' : '/api/fondos-inversion/sync-fichas';
      const body = fundType === 'fm'
        ? { nombre_agf: nombre, limit: 100 }
        : { administradora: nombre, limit: 100 };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setResults(prev => [{
          admin: nombre,
          synced: data.synced,
          errors: data.errors,
          skipped: data.skipped || 0,
          details: data.results || [],
        }, ...prev]);
        fetchStatus();
      }
    } catch { /* ignore */ }
    finally {
      setSyncing(false);
      setSyncingAdmin(null);
    }
  };

  const typeLabel = fundType === 'fm' ? 'Fondos Mutuos' : 'Fondos de Inversión';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gb-border">
          <div>
            <h2 className="text-lg font-semibold text-gb-black">Sincronizar Fichas CMF</h2>
            <p className="text-xs text-gb-gray mt-0.5">
              Descarga automática de folletos informativos desde CMF
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gb-gray" />
          </button>
        </div>

        {/* Type toggle */}
        <div className="px-6 pt-4 flex gap-1 bg-gray-50 border-b border-gb-border">
          {(['fm', 'fi'] as FundType[]).map(t => (
            <button
              key={t}
              onClick={() => setFundType(t)}
              className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                fundType === t
                  ? 'bg-white text-gb-black border border-gb-border border-b-white -mb-px'
                  : 'text-gb-gray hover:text-gb-black'
              }`}
            >
              {t === 'fm' ? 'Fondos Mutuos' : 'Fondos de Inversión'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Stats */}
          <div className="bg-blue-50 rounded-lg px-4 py-3 flex items-center gap-3">
            <Download className="w-5 h-5 text-blue-600" />
            <div>
              <div className="text-sm font-medium text-blue-900">
                {fichasSynced} fichas {typeLabel} con datos extraidos
              </div>
              <div className="text-xs text-blue-700">
                Datos: TAC, horizonte, tolerancia riesgo, objetivo
              </div>
            </div>
          </div>

          {/* Admin List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 text-gb-gray animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gb-black">
                Administradoras ({adminList.length})
              </div>
              <div className="border border-gb-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gb-gray">
                        {fundType === 'fm' ? 'AGF' : 'Administradora'}
                      </th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gb-gray">Fondos</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gb-gray">Fichas</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gb-gray">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gb-border">
                    {adminList.slice(0, 25).map((admin) => (
                      <tr key={admin.nombre} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gb-black text-xs truncate max-w-[280px]">{admin.nombre}</td>
                        <td className="px-4 py-2 text-right text-gb-gray text-xs">{admin.count}</td>
                        <td className="px-4 py-2 text-right text-xs">
                          {admin.synced > 0 ? (
                            <span className={admin.synced >= admin.count ? 'text-green-600 font-medium' : 'text-amber-600'}>
                              {admin.synced}/{admin.count}
                            </span>
                          ) : (
                            <span className="text-gb-gray">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => syncAdmin(admin.nombre)}
                            disabled={syncing}
                            className="px-2.5 py-1 text-[11px] font-medium rounded border border-gb-border hover:bg-gb-light transition-colors disabled:opacity-40"
                          >
                            {syncingAdmin === admin.nombre ? (
                              <span className="flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Sincronizando...
                              </span>
                            ) : 'Sincronizar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {adminList.length > 25 && (
                <p className="text-xs text-gb-gray text-center">y {adminList.length - 25} administradoras mas...</p>
              )}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gb-black">Resultados</div>
              {results.map((r, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gb-black">{r.admin}</span>
                    <span className="text-xs text-gb-gray">
                      <span className="text-green-600 font-medium">{r.synced} OK</span>
                      {r.skipped > 0 && <span className="text-blue-500 ml-2">{r.skipped} ya sincronizados</span>}
                      {r.errors > 0 && <span className="text-red-500 ml-2">{r.errors} errores</span>}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {r.details.map((d, j) => (
                      <div key={j} className="flex items-center justify-between text-[11px]">
                        <span className="text-gb-gray">
                          {d.fi_rut ? `RUT ${d.fi_rut}` : `RUN ${d.fo_run}`}
                          {d.nombre ? ` - ${d.nombre.substring(0, 40)}` : ''}
                          {' '}({d.serie})
                        </span>
                        <span className={d.status === 'ok' ? 'text-green-600' : 'text-amber-600'}>
                          {d.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
