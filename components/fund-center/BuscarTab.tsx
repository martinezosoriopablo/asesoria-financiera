'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, TrendingUp, TrendingDown, Minus, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import FondoDetalleModal from '@/components/market/FondoDetalleModal';
import SearchMode from '@/app/fund-center/components/SearchMode';

// ─── Types ───
interface FondoResult {
  id: string;
  fo_run: number;
  fm_serie: string;
  nombre_fondo: string;
  nombre_agf: string;
  moneda: string;
  precio_actual: number | null;
  fecha_precio: string | null;
  variacion_diaria: number | null;
  dias_desactualizado: number | null;
}

interface FIResult {
  id: string;
  rut: string;
  nombre: string;
  administradora: string | null;
  tipo: 'FIRES' | 'FINRE';
  moneda: string;
  series_disponibles: string[];
  serie_mostrada: string | null;
  precio_actual: number | null;
  fecha_precio: string | null;
  variacion_diaria: number | null;
  dias_desactualizado: number | null;
}

interface FIDetail {
  id: string;
  rut: string;
  nombre: string;
  administradora: string | null;
  tipo: 'FIRES' | 'FINRE';
  moneda: string;
  series_detectadas: string[] | null;
  ultimo_sync: string | null;
  ultimo_sync_ok: boolean | null;
  series_precios: Record<string, { fecha: string; valor_libro: number; rent_diaria: number | null }>;
}

interface FIPrecio {
  serie: string;
  fecha: string;
  valor_libro: number;
  valor_economico: number | null;
  patrimonio_neto: number | null;
  activo_total: number | null;
  n_aportantes: number | null;
  rent_diaria: number | null;
  moneda: string | null;
}

interface SyncStatus {
  latestDate: string | null;
  todayPrices: number;
  yesterdayPrices: number;
  totalFondos: number;
  autoSyncAvailable: boolean;
}

type SubTab = 'FM' | 'FI' | 'ETF';

export default function BuscarTab() {
  const [subTab, setSubTab] = useState<SubTab>('FM');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FondoResult[]>([]);
  const [fiResults, setFiResults] = useState<FIResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  // FM modal
  const [selectedFondoModal, setSelectedFondoModal] = useState<{
    fo_run: number; fm_serie: string; nombre_fondo: string; nombre_agf: string;
  } | null>(null);

  // FI detail
  const [selectedFI, setSelectedFI] = useState<FIDetail | null>(null);
  const [fiPrecios, setFiPrecios] = useState<FIPrecio[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Sync
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    fetch('/api/cmf/auto-sync')
      .then(r => r.json())
      .then(d => { if (d.success) setSyncStatus(d); })
      .catch(() => {});
  }, []);

  const doSearch = useCallback(async (q: string, t: SubTab) => {
    if (t === 'ETF' || q.length < 2) {
      setResults([]); setFiResults([]); setSearchDone(false);
      return;
    }
    setSearching(true);
    try {
      const url = t === 'FM'
        ? `/api/fondos/lookup?q=${encodeURIComponent(q)}`
        : `/api/fondos-inversion/lookup?q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        if (t === 'FM') { setResults(data.results || []); setFiResults([]); }
        else { setFiResults(data.results || []); setResults([]); }
      }
    } catch {
      setResults([]); setFiResults([]);
    } finally {
      setSearching(false); setSearchDone(true);
    }
  }, []);

  useEffect(() => {
    if (subTab === 'ETF') return;
    const timer = setTimeout(() => doSearch(query, subTab), 300);
    return () => clearTimeout(timer);
  }, [query, subTab, doSearch]);

  const loadFIDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/fondos-inversion/lookup?id=${id}&dias=30`);
      const data = await res.json();
      if (data.success) {
        setSelectedFI(data.fondo);
        setFiPrecios(data.precios || []);
      }
    } catch { /* ignore */ }
    finally { setLoadingDetail(false); }
  };

  const backToSearch = () => {
    setSelectedFI(null); setFiPrecios([]);
  };

  const switchSubTab = (t: SubTab) => {
    setSubTab(t);
    backToSearch();
    setQuery(''); setResults([]); setFiResults([]); setSearchDone(false);
  };

  // If ETF tab, render the existing SearchMode component
  if (subTab === 'ETF') {
    return (
      <div className="space-y-4">
        <SubTabNav active={subTab} onChange={switchSubTab} />
        <SearchMode />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SubTabNav active={subTab} onChange={switchSubTab} />

      {/* Sync Status */}
      {syncStatus && (
        <div className="bg-white rounded-xl border border-gb-border p-4 flex flex-wrap gap-4 items-center text-sm">
          <div className="flex items-center gap-2">
            {syncStatus.yesterdayPrices > 0 ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            )}
            <span className="text-gb-gray">CMF:</span>
            <span className="font-medium">{syncStatus.latestDate || '—'}</span>
          </div>
          <div className="text-gb-gray">
            <span className="font-medium text-gb-black">{syncStatus.totalFondos.toLocaleString()}</span> fondos
          </div>
          <div className="text-gb-gray">
            Ayer: <span className="font-medium text-gb-black">{syncStatus.yesterdayPrices.toLocaleString()}</span>
          </div>
          {syncStatus.autoSyncAvailable && (
            <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Auto-sync activo</span>
          )}
        </div>
      )}

      {/* FI Detail View */}
      {selectedFI ? (
        <FIDetailView fondo={selectedFI} precios={fiPrecios} loading={loadingDetail} onBack={backToSearch} />
      ) : (
        <>
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gb-gray" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={subTab === 'FM'
                ? 'Buscar fondo mutuo por nombre, administradora o RUN...'
                : 'Buscar fondo de inversión por nombre, RUT o administradora...'}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gb-border bg-white text-sm focus:ring-2 focus:ring-gb-primary/20 focus:border-gb-primary transition-all"
              autoFocus
            />
            {searching && <RefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray animate-spin" />}
          </div>

          {/* FM Results */}
          {subTab === 'FM' && results.length > 0 && (
            <div className="bg-white rounded-xl border border-gb-border overflow-hidden">
              <div className="px-4 py-3 border-b border-gb-border bg-gray-50">
                <span className="text-sm text-gb-gray">{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gb-border">
                {results.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFondoModal({
                      fo_run: f.fo_run, fm_serie: f.fm_serie,
                      nombre_fondo: f.nombre_fondo, nombre_agf: f.nombre_agf
                    })}
                    className="w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gb-black truncate">{f.nombre_fondo}</div>
                      <div className="text-xs text-gb-gray truncate">
                        {f.nombre_agf} &middot; RUN {f.fo_run} &middot; {f.fm_serie} &middot; {f.moneda}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {f.precio_actual ? (
                        <>
                          <div className="text-sm font-semibold text-gb-black">{formatPrice(f.precio_actual)}</div>
                          <VariacionBadge value={f.variacion_diaria} />
                        </>
                      ) : (
                        <span className="text-xs text-gb-gray">Sin precio</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* FI Results */}
          {subTab === 'FI' && fiResults.length > 0 && (
            <div className="bg-white rounded-xl border border-gb-border overflow-hidden">
              <div className="px-4 py-3 border-b border-gb-border bg-gray-50">
                <span className="text-sm text-gb-gray">{fiResults.length} resultado{fiResults.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gb-border">
                {fiResults.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => loadFIDetail(f.id)}
                    className="w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">{f.tipo}</span>
                        <div className="text-sm font-medium text-gb-black truncate">{f.nombre}</div>
                      </div>
                      <div className="text-xs text-gb-gray truncate mt-0.5">
                        {f.administradora} &middot; RUT {f.rut}
                        {f.series_disponibles.length > 0 && <> &middot; Series: {f.series_disponibles.join(', ')}</>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {f.precio_actual ? (
                        <>
                          <div className="text-sm font-semibold text-gb-black">
                            {formatPrice(f.precio_actual)}
                            {f.serie_mostrada && <span className="ml-1 text-[10px] text-gb-gray">({f.serie_mostrada})</span>}
                          </div>
                          <VariacionBadge value={f.variacion_diaria} />
                        </>
                      ) : (
                        <span className="text-xs text-gb-gray">Sin precio</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty states */}
          {searchDone && query.length >= 2 && results.length === 0 && fiResults.length === 0 && (
            <div className="text-center py-12 text-gb-gray">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No se encontraron resultados para &ldquo;{query}&rdquo;</p>
            </div>
          )}
          {!searchDone && query.length < 2 && (
            <div className="text-center py-12 text-gb-gray">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Escribe para buscar un {subTab === 'FM' ? 'fondo mutuo' : 'fondo de inversión'}</p>
            </div>
          )}
        </>
      )}

      {/* FM Detail Modal */}
      {selectedFondoModal && (
        <FondoDetalleModal fondo={selectedFondoModal} onClose={() => setSelectedFondoModal(null)} />
      )}
    </div>
  );
}

// ─── Sub-tab navigation ───
function SubTabNav({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  const tabs: { id: SubTab; label: string }[] = [
    { id: 'FM', label: 'Fondos Mutuos' },
    { id: 'FI', label: 'Fondos de Inversión' },
    { id: 'ETF', label: 'ETFs Internacionales' },
  ];
  return (
    <div className="flex gap-1 bg-white p-1 rounded-xl border border-gb-border max-w-lg">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            active === t.id ? 'bg-gb-black text-white' : 'text-gb-gray hover:text-gb-black'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── FI Detail View (inline) ───
function FIDetailView({ fondo, precios, loading, onBack }: {
  fondo: FIDetail; precios: FIPrecio[]; loading: boolean; onBack: () => void;
}) {
  const series = Object.keys(fondo.series_precios).sort();
  const [selectedSerie, setSelectedSerie] = useState<string>(series[0] || '');
  const [fichaData, setFichaData] = useState<{
    tac_serie: number | null;
    horizonte_inversion: string | null;
    tolerancia_riesgo: string | null;
    objetivo: string | null;
    rescatable: boolean | null;
    plazo_rescate: string | null;
  } | null>(null);

  useEffect(() => {
    if (!selectedSerie && series.length > 0) setSelectedSerie(series[0]);
  }, [series, selectedSerie]);

  // Load ficha data
  useEffect(() => {
    if (!fondo.rut) return;
    fetch(`/api/fondos-inversion/ficha?rut=${fondo.rut}`)
      .then(r => r.json())
      .then(d => { if (d.extracted) setFichaData(d.extracted); })
      .catch(() => {});
  }, [fondo.rut]);

  const preciosSerie = precios.filter(p => p.serie === selectedSerie).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const latestSerie = preciosSerie.length > 0 ? preciosSerie[preciosSerie.length - 1] : null;
  const firstValor = preciosSerie[0]?.valor_libro;
  const lastValor = latestSerie?.valor_libro;
  const rentPeriodo = firstValor && lastValor ? ((Number(lastValor) - Number(firstValor)) / Number(firstValor)) * 100 : null;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gb-gray hover:text-gb-black mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Volver a búsqueda
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-gb-gray animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gb-border p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">{fondo.tipo}</span>
                  <h2 className="text-lg font-bold text-gb-black">{fondo.nombre}</h2>
                </div>
                <p className="text-sm text-gb-gray">{fondo.administradora}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-xs bg-gray-100 text-gb-gray px-2 py-0.5 rounded">RUT {fondo.rut}</span>
                  <span className="text-xs bg-gray-100 text-gb-gray px-2 py-0.5 rounded">{fondo.moneda || 'CLP'}</span>
                </div>
              </div>
              <div className="text-right">
                {latestSerie ? (
                  <>
                    <div className="text-2xl font-bold text-gb-black">{formatPrice(Number(latestSerie.valor_libro))}</div>
                    <VariacionBadge value={latestSerie.rent_diaria != null ? Number(latestSerie.rent_diaria) : null} />
                    <div className="text-xs text-gb-gray mt-1 flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" /> {latestSerie.fecha}
                    </div>
                  </>
                ) : (
                  <span className="text-gb-gray text-sm">Sin precio disponible</span>
                )}
              </div>
            </div>
          </div>

          {/* Series selector */}
          {series.length > 1 && (
            <div className="bg-white rounded-xl border border-gb-border p-4">
              <div className="text-xs font-semibold text-gb-gray uppercase tracking-wider mb-2">Series</div>
              <div className="flex flex-wrap gap-2">
                {series.map(s => (
                  <button
                    key={s}
                    onClick={() => setSelectedSerie(s)}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      s === selectedSerie ? 'bg-gb-black text-white' : 'bg-gray-50 text-gb-gray hover:bg-gray-100'
                    }`}
                  >
                    Serie {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Period summary */}
          {preciosSerie.length >= 2 && (
            <div className="bg-white rounded-xl border border-gb-border p-6">
              <h3 className="text-sm font-semibold text-gb-black mb-3">Serie {selectedSerie} ({preciosSerie.length} días)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div><div className="text-xs text-gb-gray">Desde</div><div className="text-sm font-semibold">{preciosSerie[0].fecha}</div></div>
                <div><div className="text-xs text-gb-gray">Hasta</div><div className="text-sm font-semibold">{latestSerie!.fecha}</div></div>
                <div>
                  <div className="text-xs text-gb-gray">Rent. período</div>
                  <div className={`text-sm font-semibold ${rentPeriodo && rentPeriodo > 0 ? 'text-green-600' : rentPeriodo && rentPeriodo < 0 ? 'text-red-600' : ''}`}>
                    {rentPeriodo != null ? `${rentPeriodo > 0 ? '+' : ''}${rentPeriodo.toFixed(2)}%` : '—'}
                  </div>
                </div>
                {latestSerie?.patrimonio_neto != null && (
                  <div><div className="text-xs text-gb-gray">Patrimonio</div><div className="text-sm font-semibold">${(Number(latestSerie.patrimonio_neto) / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 0 })}M</div></div>
                )}
              </div>
            </div>
          )}

          {/* Ficha data */}
          {fichaData && (
            <div className="bg-white rounded-xl border border-gb-border p-6">
              <h3 className="text-sm font-semibold text-gb-black mb-3">Datos Ficha CMF</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                {fichaData.tac_serie != null && (
                  <div>
                    <div className="text-xs text-gb-gray">TAC Serie</div>
                    <div className="font-semibold">{fichaData.tac_serie}%</div>
                  </div>
                )}
                {fichaData.horizonte_inversion && (
                  <div>
                    <div className="text-xs text-gb-gray">Horizonte</div>
                    <div className="font-semibold capitalize">{fichaData.horizonte_inversion}</div>
                  </div>
                )}
                {fichaData.tolerancia_riesgo && (
                  <div>
                    <div className="text-xs text-gb-gray">Riesgo</div>
                    <div className="font-semibold capitalize">{fichaData.tolerancia_riesgo}</div>
                  </div>
                )}
                {fichaData.rescatable != null && (
                  <div>
                    <div className="text-xs text-gb-gray">Rescatable</div>
                    <div className="font-semibold">
                      {fichaData.rescatable ? 'Sí' : 'No'}
                      {fichaData.plazo_rescate ? ` (${fichaData.plazo_rescate})` : ''}
                    </div>
                  </div>
                )}
              </div>
              {fichaData.objetivo && (
                <div className="mt-3 pt-3 border-t border-gb-border">
                  <div className="text-xs text-gb-gray mb-1">Objetivo</div>
                  <p className="text-xs text-gb-black leading-relaxed">{fichaData.objetivo}</p>
                </div>
              )}
            </div>
          )}

          {/* Table */}
          {preciosSerie.length > 0 && (
            <div className="bg-white rounded-xl border border-gb-border overflow-hidden">
              <div className="px-6 py-3 border-b border-gb-border">
                <h3 className="text-sm font-semibold text-gb-black">Historial ({preciosSerie.length} días)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gb-gray text-xs">
                      <th className="text-left px-6 py-2 font-medium">Fecha</th>
                      <th className="text-right px-6 py-2 font-medium">Valor Libro</th>
                      <th className="text-right px-6 py-2 font-medium">Valor Econ.</th>
                      <th className="text-right px-6 py-2 font-medium">Patrimonio</th>
                      <th className="text-right px-6 py-2 font-medium">Var. Diaria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gb-border">
                    {[...preciosSerie].reverse().map((p) => (
                      <tr key={`${p.serie}-${p.fecha}`} className="hover:bg-gray-50">
                        <td className="px-6 py-2 text-gb-black">{p.fecha}</td>
                        <td className="px-6 py-2 text-right font-mono">{formatPrice(Number(p.valor_libro))}</td>
                        <td className="px-6 py-2 text-right font-mono text-gb-gray">
                          {p.valor_economico != null ? formatPrice(Number(p.valor_economico)) : '—'}
                        </td>
                        <td className="px-6 py-2 text-right text-gb-gray text-xs">
                          {p.patrimonio_neto != null ? `$${(Number(p.patrimonio_neto) / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 0 })}M` : '—'}
                        </td>
                        <td className="px-6 py-2 text-right">
                          <VariacionBadge value={p.rent_diaria != null ? Number(p.rent_diaria) : null} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───
function VariacionBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-gb-gray">—</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const color = value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gb-gray';
  return (
    <span className={`inline-flex items-center gap-0.5 ${color} text-xs font-medium`}>
      <Icon className="w-3 h-3" />
      {value > 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

function formatPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return v.toLocaleString('es-CL', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}
