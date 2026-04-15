'use client';

import { useState, useEffect, useCallback } from 'react';
import AdvisorHeader from '@/components/shared/AdvisorHeader';
import { useAdvisor } from '@/lib/hooks/useAdvisor';
import { Search, TrendingUp, TrendingDown, Minus, ArrowLeft, RefreshCw, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

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

interface FondoDetail {
  id: string;
  fo_run: number;
  fm_serie: string;
  nombre_fondo: string;
  nombre_agf: string;
  moneda_funcional: string;
  familia_estudios: string | null;
  clase_inversionista: string | null;
  precio_actual: number | null;
  fecha_precio: string | null;
  variacion_diaria: number | null;
  dias_desactualizado: number | null;
}

interface PrecioHistorico {
  fecha: string;
  valor_cuota: number;
  rent_diaria: number | null;
}

interface Rentabilidades {
  rent_7d: number | null;
  rent_30d: number | null;
  rent_90d: number | null;
  rent_180d: number | null;
  rent_365d: number | null;
  rent_ytd: number | null;
  volatilidad_30d: number | null;
  volatilidad_365d: number | null;
  sharpe_365d: number | null;
  patrimonio_mm: number | null;
}

interface SyncStatus {
  latestDate: string | null;
  todayPrices: number;
  yesterdayPrices: number;
  totalFondos: number;
  autoSyncAvailable: boolean;
}

// ─── Fondos de Inversión types ───
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

type FondoType = 'FM' | 'FI';

export default function FondosPage() {
  const { advisor } = useAdvisor();

  // Tab state
  const [tipo, setTipo] = useState<FondoType>('FM');

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FondoResult[]>([]);
  const [fiResults, setFiResults] = useState<FIResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  // Detail state (FM)
  const [selectedFondo, setSelectedFondo] = useState<FondoDetail | null>(null);
  const [precios, setPrecios] = useState<PrecioHistorico[]>([]);
  const [rentabilidades, setRentabilidades] = useState<Rentabilidades | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Detail state (FI)
  const [selectedFI, setSelectedFI] = useState<FIDetail | null>(null);
  const [fiPrecios, setFiPrecios] = useState<FIPrecio[]>([]);

  // Sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  // Load CMF sync status
  useEffect(() => {
    fetch('/api/cmf/auto-sync')
      .then(r => r.json())
      .then(d => { if (d.success) setSyncStatus(d); })
      .catch(() => {});
  }, []);

  // Debounced search — hits FM or FI endpoint depending on active tab
  const doSearch = useCallback(async (q: string, t: FondoType) => {
    if (q.length < 2) {
      setResults([]);
      setFiResults([]);
      setSearchDone(false);
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
      setResults([]);
      setFiResults([]);
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query, tipo), 300);
    return () => clearTimeout(timer);
  }, [query, tipo, doSearch]);

  // Load FM detail
  const loadDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/fondos/lookup?id=${id}&dias=30`);
      const data = await res.json();
      if (data.success) {
        setSelectedFondo(data.fondo);
        setPrecios(data.precios || []);
        setRentabilidades(data.rentabilidades || null);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  };

  // Load FI detail
  const loadFIDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/fondos-inversion/lookup?id=${id}&dias=30`);
      const data = await res.json();
      if (data.success) {
        setSelectedFI(data.fondo);
        setFiPrecios(data.precios || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  };

  const backToSearch = () => {
    setSelectedFondo(null);
    setPrecios([]);
    setRentabilidades(null);
    setSelectedFI(null);
    setFiPrecios([]);
  };

  const switchTipo = (t: FondoType) => {
    setTipo(t);
    backToSearch();
    setQuery('');
    setResults([]);
    setFiResults([]);
    setSearchDone(false);
  };

  return (
    <div className="min-h-screen bg-gb-light">
      <AdvisorHeader advisorName={advisor?.name || ''} advisorEmail={advisor?.email || ''} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-gb-black mb-1">Consulta de Fondos</h1>
        <p className="text-gb-gray text-sm mb-6">Busca por nombre, RUN/RUT, serie o administradora</p>

        {/* Tipo selector */}
        <div className="flex gap-1 bg-white p-1 rounded-xl border border-gb-border mb-5 max-w-md">
          <button
            onClick={() => switchTipo('FM')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              tipo === 'FM' ? 'bg-gb-black text-white' : 'text-gb-gray hover:text-gb-black'
            }`}
          >
            Fondos Mutuos
          </button>
          <button
            onClick={() => switchTipo('FI')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              tipo === 'FI' ? 'bg-gb-black text-white' : 'text-gb-gray hover:text-gb-black'
            }`}
          >
            Fondos de Inversión
          </button>
        </div>

        {/* Sync Status Bar */}
        {syncStatus && (
          <div className="bg-white rounded-xl border border-gb-border p-4 mb-6 flex flex-wrap gap-4 items-center text-sm">
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
              Ayer: <span className="font-medium text-gb-black">{syncStatus.yesterdayPrices.toLocaleString()}</span> precios
            </div>
            <div className="text-gb-gray">
              Hoy: <span className="font-medium text-gb-black">{syncStatus.todayPrices.toLocaleString()}</span> precios
            </div>
            {syncStatus.autoSyncAvailable && (
              <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Auto-sync activo</span>
            )}
          </div>
        )}

        {/* Detail View */}
        {selectedFondo ? (
          <FondoDetailView
            fondo={selectedFondo}
            precios={precios}
            rentabilidades={rentabilidades}
            loading={loadingDetail}
            onBack={backToSearch}
          />
        ) : selectedFI ? (
          <FIDetailView
            fondo={selectedFI}
            precios={fiPrecios}
            loading={loadingDetail}
            onBack={backToSearch}
          />
        ) : (
          <>
            {/* Search Bar */}
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gb-gray" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tipo === 'FM'
                  ? 'Buscar fondo mutuo por nombre, administradora o RUN (ej: Scotia, 8304, Serie A)...'
                  : 'Buscar fondo de inversión por nombre, administradora o RUT (ej: Moneda, 9212, Arrayán)...'}
                className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gb-border bg-white text-gb-black placeholder-gray-400 focus:ring-2 focus:ring-gb-primary/20 focus:border-gb-primary transition-all text-sm"
                autoFocus
              />
              {searching && (
                <RefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray animate-spin" />
              )}
            </div>

            {/* Results FM */}
            {tipo === 'FM' && results.length > 0 && (
              <div className="bg-white rounded-xl border border-gb-border overflow-hidden">
                <div className="px-4 py-3 border-b border-gb-border bg-gray-50">
                  <span className="text-sm text-gb-gray">{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-gb-border">
                  {results.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => loadDetail(f.id)}
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
                            <div className="text-sm font-semibold text-gb-black">
                              {formatPrice(f.precio_actual)}
                            </div>
                            <div className="flex items-center justify-end gap-1">
                              <VariacionBadge value={f.variacion_diaria} />
                              {f.dias_desactualizado !== null && f.dias_desactualizado > 2 && (
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                  {f.dias_desactualizado}d
                                </span>
                              )}
                            </div>
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

            {/* Results FI */}
            {tipo === 'FI' && fiResults.length > 0 && (
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
                          {f.series_disponibles.length > 0 && (
                            <> &middot; Series: {f.series_disponibles.join(', ')}</>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {f.precio_actual ? (
                          <>
                            <div className="text-sm font-semibold text-gb-black">
                              {formatPrice(f.precio_actual)}
                              {f.serie_mostrada && <span className="ml-1 text-[10px] text-gb-gray">({f.serie_mostrada})</span>}
                            </div>
                            <div className="flex items-center justify-end gap-1">
                              <VariacionBadge value={f.variacion_diaria} />
                              {f.dias_desactualizado !== null && f.dias_desactualizado > 2 && (
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                  {f.dias_desactualizado}d
                                </span>
                              )}
                            </div>
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

            {searchDone && tipo === 'FM' && results.length === 0 && query.length >= 2 && (
              <div className="text-center py-12 text-gb-gray">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No se encontraron fondos para &ldquo;{query}&rdquo;</p>
                <p className="text-xs mt-1">Intenta con el RUN, nombre del fondo o administradora</p>
              </div>
            )}

            {searchDone && tipo === 'FI' && fiResults.length === 0 && query.length >= 2 && (
              <div className="text-center py-12 text-gb-gray">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No se encontraron fondos de inversión para &ldquo;{query}&rdquo;</p>
                <p className="text-xs mt-1">Intenta con el RUT, nombre del fondo o administradora</p>
              </div>
            )}

            {!searchDone && query.length < 2 && (
              <div className="text-center py-12 text-gb-gray">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Escribe para buscar un {tipo === 'FM' ? 'fondo mutuo' : 'fondo de inversión'}</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Detail View ─────────────────────────────────────────────────

function FondoDetailView({
  fondo,
  precios,
  rentabilidades,
  loading,
  onBack,
}: {
  fondo: FondoDetail;
  precios: PrecioHistorico[];
  rentabilidades: Rentabilidades | null;
  loading: boolean;
  onBack: () => void;
}) {
  const latest = precios.length > 0 ? precios[precios.length - 1] : null;

  return (
    <div>
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gb-gray hover:text-gb-black mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Volver a búsqueda
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-gb-gray animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header Card */}
          <div className="bg-white rounded-xl border border-gb-border p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gb-black">{fondo.nombre_fondo}</h2>
                <p className="text-sm text-gb-gray mt-0.5">{fondo.nombre_agf}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Tag label={`RUN ${fondo.fo_run}`} />
                  <Tag label={fondo.fm_serie} />
                  <Tag label={fondo.moneda_funcional || 'CLP'} />
                  {fondo.familia_estudios && <Tag label={fondo.familia_estudios} />}
                  {fondo.clase_inversionista && <Tag label={fondo.clase_inversionista} />}
                </div>
              </div>
              <div className="text-right">
                {fondo.precio_actual ? (
                  <>
                    <div className="text-2xl font-bold text-gb-black">{formatPrice(fondo.precio_actual)}</div>
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <VariacionBadge value={fondo.variacion_diaria} size="md" />
                    </div>
                    <div className="text-xs text-gb-gray mt-1 flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      {fondo.fecha_precio}
                      {fondo.dias_desactualizado !== null && fondo.dias_desactualizado > 0 && (
                        <span className={fondo.dias_desactualizado > 2 ? 'text-amber-600' : ''}>
                          ({fondo.dias_desactualizado}d atrás)
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <span className="text-gb-gray text-sm">Sin precio disponible</span>
                )}
              </div>
            </div>
          </div>

          {/* Rentabilidades */}
          {rentabilidades && (
            <div className="bg-white rounded-xl border border-gb-border p-6">
              <h3 className="text-sm font-semibold text-gb-black mb-3">Rentabilidades</h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                <RentCard label="7 días" value={rentabilidades.rent_7d} />
                <RentCard label="30 días" value={rentabilidades.rent_30d} />
                <RentCard label="90 días" value={rentabilidades.rent_90d} />
                <RentCard label="180 días" value={rentabilidades.rent_180d} />
                <RentCard label="1 año" value={rentabilidades.rent_365d} />
                <RentCard label="YTD" value={rentabilidades.rent_ytd} />
              </div>
              {(rentabilidades.volatilidad_365d || rentabilidades.sharpe_365d || rentabilidades.patrimonio_mm) && (
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gb-border">
                  {rentabilidades.volatilidad_365d != null && (
                    <MetricCard label="Volatilidad 1Y" value={`${rentabilidades.volatilidad_365d.toFixed(2)}%`} />
                  )}
                  {rentabilidades.sharpe_365d != null && (
                    <MetricCard label="Sharpe 1Y" value={rentabilidades.sharpe_365d.toFixed(2)} />
                  )}
                  {rentabilidades.patrimonio_mm != null && (
                    <MetricCard label="Patrimonio" value={`$${rentabilidades.patrimonio_mm.toFixed(0)}MM`} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Price History Table */}
          {precios.length > 0 && (
            <div className="bg-white rounded-xl border border-gb-border overflow-hidden">
              <div className="px-6 py-3 border-b border-gb-border">
                <h3 className="text-sm font-semibold text-gb-black">Historial de Precios ({precios.length} días)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gb-gray text-xs">
                      <th className="text-left px-6 py-2 font-medium">Fecha</th>
                      <th className="text-right px-6 py-2 font-medium">Valor Cuota</th>
                      <th className="text-right px-6 py-2 font-medium">Var. Diaria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gb-border">
                    {[...precios].reverse().map((p) => (
                      <tr key={p.fecha} className="hover:bg-gray-50">
                        <td className="px-6 py-2 text-gb-black">{p.fecha}</td>
                        <td className="px-6 py-2 text-right font-mono text-gb-black">{formatPrice(p.valor_cuota)}</td>
                        <td className="px-6 py-2 text-right">
                          <VariacionBadge value={p.rent_diaria} />
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

// ─── FI Detail View ──────────────────────────────────────────────

function FIDetailView({
  fondo,
  precios,
  loading,
  onBack,
}: {
  fondo: FIDetail;
  precios: FIPrecio[];
  loading: boolean;
  onBack: () => void;
}) {
  const series = Object.keys(fondo.series_precios).sort();
  const [selectedSerie, setSelectedSerie] = useState<string>(series[0] || '');

  useEffect(() => {
    if (!selectedSerie && series.length > 0) setSelectedSerie(series[0]);
  }, [series, selectedSerie]);

  const preciosSerie = precios.filter(p => p.serie === selectedSerie).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const latestSerie = preciosSerie.length > 0 ? preciosSerie[preciosSerie.length - 1] : null;

  const firstValor = preciosSerie[0]?.valor_libro;
  const lastValor = latestSerie?.valor_libro;
  const rentPeriodo = firstValor && lastValor ? ((Number(lastValor) - Number(firstValor)) / Number(firstValor)) * 100 : null;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gb-gray hover:text-gb-black mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Volver a búsqueda
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-gb-gray animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header Card */}
          <div className="bg-white rounded-xl border border-gb-border p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">{fondo.tipo}</span>
                  <h2 className="text-lg font-bold text-gb-black">{fondo.nombre}</h2>
                </div>
                <p className="text-sm text-gb-gray mt-0.5">{fondo.administradora}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Tag label={`RUT ${fondo.rut}`} />
                  <Tag label={fondo.moneda || 'CLP'} />
                  {fondo.ultimo_sync && (
                    <span className={`text-xs px-2 py-0.5 rounded ${fondo.ultimo_sync_ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      Sync: {new Date(fondo.ultimo_sync).toLocaleDateString('es-CL')}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                {latestSerie ? (
                  <>
                    <div className="text-2xl font-bold text-gb-black">{formatPrice(Number(latestSerie.valor_libro))}</div>
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <VariacionBadge value={latestSerie.rent_diaria != null ? Number(latestSerie.rent_diaria) : null} size="md" />
                    </div>
                    <div className="text-xs text-gb-gray mt-1 flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      {latestSerie.fecha}
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
              <div className="text-xs font-semibold text-gb-gray uppercase tracking-wider mb-2">Series disponibles</div>
              <div className="flex flex-wrap gap-2">
                {series.map(s => {
                  const info = fondo.series_precios[s];
                  const active = s === selectedSerie;
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedSerie(s)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        active ? 'bg-gb-black text-white' : 'bg-gray-50 text-gb-gray hover:bg-gray-100'
                      }`}
                    >
                      <div className="font-semibold">Serie {s}</div>
                      <div className={`text-xs ${active ? 'text-white/80' : 'text-gb-gray'}`}>
                        {formatPrice(Number(info.valor_libro))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Period summary */}
          {preciosSerie.length >= 2 && (
            <div className="bg-white rounded-xl border border-gb-border p-6">
              <h3 className="text-sm font-semibold text-gb-black mb-3">Rendimiento Serie {selectedSerie} (últimos {preciosSerie.length} días con data)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Desde" value={preciosSerie[0].fecha} />
                <MetricCard label="Hasta" value={latestSerie!.fecha} />
                <div className="text-center">
                  <div className="text-xs text-gb-gray">Rent. período</div>
                  <div className={`text-sm font-semibold mt-0.5 ${rentPeriodo && rentPeriodo > 0 ? 'text-green-600' : rentPeriodo && rentPeriodo < 0 ? 'text-red-600' : 'text-gb-black'}`}>
                    {rentPeriodo != null ? `${rentPeriodo > 0 ? '+' : ''}${rentPeriodo.toFixed(2)}%` : '—'}
                  </div>
                </div>
                {latestSerie?.patrimonio_neto != null && (
                  <MetricCard
                    label="Patrimonio neto"
                    value={`$${(Number(latestSerie.patrimonio_neto) / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 0 })}M`}
                  />
                )}
              </div>
            </div>
          )}

          {/* Price history table */}
          {preciosSerie.length > 0 && (
            <div className="bg-white rounded-xl border border-gb-border overflow-hidden">
              <div className="px-6 py-3 border-b border-gb-border">
                <h3 className="text-sm font-semibold text-gb-black">Historial Serie {selectedSerie} ({preciosSerie.length} días)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gb-gray text-xs">
                      <th className="text-left px-6 py-2 font-medium">Fecha</th>
                      <th className="text-right px-6 py-2 font-medium">Valor Libro</th>
                      <th className="text-right px-6 py-2 font-medium">Valor Econ.</th>
                      <th className="text-right px-6 py-2 font-medium">Patrimonio</th>
                      <th className="text-right px-6 py-2 font-medium">N° Apor.</th>
                      <th className="text-right px-6 py-2 font-medium">Var. Diaria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gb-border">
                    {[...preciosSerie].reverse().map((p) => (
                      <tr key={`${p.serie}-${p.fecha}`} className="hover:bg-gray-50">
                        <td className="px-6 py-2 text-gb-black">{p.fecha}</td>
                        <td className="px-6 py-2 text-right font-mono text-gb-black">{formatPrice(Number(p.valor_libro))}</td>
                        <td className="px-6 py-2 text-right font-mono text-gb-gray">
                          {p.valor_economico != null ? formatPrice(Number(p.valor_economico)) : '—'}
                        </td>
                        <td className="px-6 py-2 text-right text-gb-gray text-xs">
                          {p.patrimonio_neto != null ? `$${(Number(p.patrimonio_neto) / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 0 })}M` : '—'}
                        </td>
                        <td className="px-6 py-2 text-right text-gb-gray">{p.n_aportantes ?? '—'}</td>
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

// ─── Shared Components ───────────────────────────────────────────

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-block text-xs bg-gray-100 text-gb-gray px-2 py-0.5 rounded">
      {label}
    </span>
  );
}

function VariacionBadge({ value, size = 'sm' }: { value: number | null; size?: 'sm' | 'md' }) {
  if (value == null) return <span className="text-xs text-gb-gray">—</span>;

  const isPositive = value > 0;
  const isNegative = value < 0;
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';

  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const color = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gb-gray';

  return (
    <span className={`inline-flex items-center gap-0.5 ${color} ${textSize} font-medium`}>
      <Icon className={size === 'md' ? 'w-4 h-4' : 'w-3 h-3'} />
      {value > 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

function RentCard({ label, value }: { label: string; value: number | null }) {
  if (value == null) return (
    <div className="text-center">
      <div className="text-xs text-gb-gray">{label}</div>
      <div className="text-sm text-gb-gray mt-0.5">—</div>
    </div>
  );

  const color = value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gb-black';

  return (
    <div className="text-center">
      <div className="text-xs text-gb-gray">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${color}`}>
        {value > 0 ? '+' : ''}{value.toFixed(2)}%
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-gb-gray">{label}</div>
      <div className="text-sm font-semibold text-gb-black mt-0.5">{value}</div>
    </div>
  );
}

function formatPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString('es-CL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return v.toLocaleString('es-CL', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}
