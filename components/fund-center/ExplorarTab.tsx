'use client';

import { useState, useEffect } from 'react';
import UploadRentDiariasModal from '@/components/market/UploadRentDiariasModal';
import UploadRentAgregadasModal from '@/components/market/UploadRentAgregadasModal';
import UploadTACModal from '@/components/market/UploadTACModal';
import FondoDetalleModal from '@/components/market/FondoDetalleModal';
import SyncFichasModal from '@/components/fund-center/SyncFichasModal';
import FIDetalleModal from '@/components/fund-center/FIDetalleModal';

interface Fondo {
  id: string;
  fo_run: number;
  fm_serie: string;
  nombre_fondo: string;
  nombre_agf: string;
  familia_estudios: string;
  clase_inversionista: string;
  categoria_simple: string;
  rent_7d_nominal: number | null;
  rent_30d_nominal: number | null;
  rent_3m_nominal: number | null;
  rent_12m_nominal: number | null;
  tac_sintetica: number | null;
  datos_diarios_count: number;
  rent_7d_agregada?: number | null;
  rent_30d_agregada?: number | null;
  rent_90d_agregada?: number | null;
  rent_180d_agregada?: number | null;
  rent_365d_agregada?: number | null;
  rent_ytd_agregada?: number | null;
  rent_3y_agregada?: number | null;
  rent_5y_agregada?: number | null;
  volatilidad_30d?: number | null;
  volatilidad_365d?: number | null;
  sharpe_365d?: number | null;
  patrimonio_mm?: number | null;
  tipo_fondo?: string;
}

interface Stats {
  total_fondos: number;
  por_familia: { [key: string]: number };
  por_clase: { [key: string]: number };
  rent_promedio: number;
  tac_promedio: number;
}

interface StatsPorAGF {
  nombre_agf: string;
  total_fondos: number;
  tac_promedio: number;
  tac_min: number;
  tac_max: number;
}

interface RankingFondo {
  fo_run: number;
  fm_serie: string;
  nombre_fondo: string;
  nombre_agf: string;
  valor: number;
  tipo?: string;
}

export default function ExplorarTab() {
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsPorAGF, setStatsPorAGF] = useState<StatsPorAGF[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);

  // Rankings
  const [rankings, setRankings] = useState<{ top_rentables: RankingFondo[]; top_baratos: RankingFondo[] } | null>(null);

  // Filtros
  const [familia, setFamilia] = useState('todos');
  const [clase, setClase] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');
  const [ordenar, setOrdenar] = useState('rent_12m_nominal');
  const [direccion, setDireccion] = useState('desc');
  const [incluirFI, setIncluirFI] = useState(false);

  // Paginacion
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  // Modales
  const [uploadDiariasOpen, setUploadDiariasOpen] = useState(false);
  const [uploadAgregadasOpen, setUploadAgregadasOpen] = useState(false);
  const [uploadTACOpen, setUploadTACOpen] = useState(false);
  const [syncFichasOpen, setSyncFichasOpen] = useState(false);
  const [detalleModalOpen, setDetalleModalOpen] = useState(false);
  const [fiDetalleOpen, setFiDetalleOpen] = useState(false);
  const [selectedFI, setSelectedFI] = useState<{ rut: string; nombre: string; administradora: string } | null>(null);
  const [selectedFondo, setSelectedFondo] = useState<{
    fo_run: number;
    fm_serie: string;
    nombre_fondo: string;
    nombre_agf: string;
  } | null>(null);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBusqueda(busqueda), 300);
    return () => clearTimeout(timer);
  }, [busqueda]);

  // Stats
  useEffect(() => {
    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const response = await fetch('/api/fondos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stats', familia, clase })
        });
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
          setStatsPorAGF(data.stats_por_agf || []);
        }
      } catch (error) {
        console.error('Error cargando stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, [familia, clase]);

  // Rankings (respetan filtros)
  useEffect(() => {
    const fetchRankings = async () => {
      try {
        const response = await fetch('/api/fondos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'rankings', familia, clase, incluir_fi: incluirFI })
        });
        const data = await response.json();
        if (data.success) {
          setRankings(data.rankings);
        }
      } catch (error) {
        console.error('Error cargando rankings:', error);
      }
    };
    fetchRankings();
  }, [familia, clase, incluirFI]);

  // Fondos
  useEffect(() => {
    const fetchFondos = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/fondos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'list', familia, clase, busqueda: debouncedBusqueda, ordenar, direccion, pagina, incluir_fi: incluirFI })
        });
        const data = await response.json();
        if (data.success) {
          setFondos(data.fondos);
          setTotal(data.total);
          setTotalPaginas(Math.ceil(data.total / 50));
        }
      } catch (error) {
        console.error('Error cargando fondos:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchFondos();
  }, [familia, clase, debouncedBusqueda, ordenar, direccion, pagina, incluirFI]);

  const formatNumber = (num: number | null) => {
    if (num === null || num === undefined) return '-';
    return num.toFixed(2);
  };

  const formatPct = (num: number | null | undefined) => {
    if (num === null || num === undefined) return '-';
    return `${num.toFixed(2)}%`;
  };

  const rentColor = (num: number | null | undefined) => {
    if (num === null || num === undefined) return 'text-gb-gray';
    return num > 0 ? 'text-emerald-600' : num < 0 ? 'text-red-500' : 'text-gb-gray';
  };

  const handleOrdenar = (columna: string) => {
    if (ordenar === columna) {
      setDireccion(direccion === 'asc' ? 'desc' : 'asc');
    } else {
      setOrdenar(columna);
      setDireccion('desc');
    }
  };

  const handleClickFondo = (fondo: Fondo) => {
    if (fondo.tipo_fondo === 'FI') {
      setSelectedFI({
        rut: String(fondo.fo_run),
        nombre: fondo.nombre_fondo,
        administradora: fondo.nombre_agf,
      });
      setFiDetalleOpen(true);
      return;
    }
    setSelectedFondo({
      fo_run: fondo.fo_run,
      fm_serie: fondo.fm_serie,
      nombre_fondo: fondo.nombre_fondo,
      nombre_agf: fondo.nombre_agf
    });
    if (fondo.datos_diarios_count > 0) {
      setDetalleModalOpen(true);
    } else {
      setUploadDiariasOpen(true);
    }
  };

  const handleCloseModals = () => {
    setUploadDiariasOpen(false);
    setUploadAgregadasOpen(false);
    setUploadTACOpen(false);
    setDetalleModalOpen(false);
    setSelectedFondo(null);
  };

  return (
    <div className="space-y-6">
      {/* Upload buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setUploadAgregadasOpen(true)}
          className="px-3 py-2 text-xs font-medium bg-white border border-gb-border rounded-lg hover:bg-gb-light transition-colors"
        >
          Subir Rent. Agregadas
        </button>
        <button
          onClick={() => setUploadTACOpen(true)}
          className="px-3 py-2 text-xs font-medium bg-white border border-gb-border rounded-lg hover:bg-gb-light transition-colors"
        >
          Subir TAC
        </button>
        <button
          onClick={() => setSyncFichasOpen(true)}
          className="px-3 py-2 text-xs font-medium bg-white border border-gb-border rounded-lg hover:bg-gb-light transition-colors"
        >
          Sync Fichas CMF
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gb-border p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block mb-1 text-xs font-semibold text-gb-gray">Familia</label>
            <select
              value={familia}
              onChange={(e) => { setFamilia(e.target.value); setPagina(1); }}
              className="w-full px-3 py-2 rounded-lg border border-gb-border text-sm"
            >
              <option value="todos">Todas las familias</option>
              <option value="Renta Variable">Renta Variable</option>
              <option value="Renta Fija">Renta Fija</option>
              <option value="Balanceado">Balanceado</option>
              <option value="Alternativos">Alternativos</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-gb-gray">Clase inversionista</label>
            <select
              value={clase}
              onChange={(e) => { setClase(e.target.value); setPagina(1); }}
              className="w-full px-3 py-2 rounded-lg border border-gb-border text-sm"
            >
              <option value="todos">Todas las clases</option>
              <option value="Retail">Retail</option>
              <option value="APV">APV</option>
              <option value="Alto Patrimonio">Alto Patrimonio</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-gb-gray">Buscar fondo</label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
              placeholder="Nombre del fondo o AGF..."
              className="w-full px-3 py-2 rounded-lg border border-gb-border text-sm"
            />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gb-border">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={incluirFI}
              onChange={(e) => { setIncluirFI(e.target.checked); setPagina(1); }}
              className="rounded border-gb-border text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs font-medium text-gb-gray">
              Incluir Fondos de Inversión
            </span>
            {incluirFI && (
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">FI</span>
            )}
          </label>
        </div>
      </div>

      {/* Rankings — only show if there's data */}
      {rankings && (rankings.top_rentables.length > 0 || rankings.top_baratos.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rankings.top_rentables.length > 0 && (
            <div className="bg-white rounded-xl border border-gb-border p-5">
              <h3 className="text-sm font-semibold text-gb-black mb-3">Top 10 Rentabilidad 12m</h3>
              <div className="space-y-2">
                {rankings.top_rentables.map((f, i) => (
                  <div key={`${f.tipo}-${f.fo_run}-${f.fm_serie}`} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-gb-gray font-medium w-4">{i + 1}</span>
                      {f.tipo === 'FI' && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded font-semibold shrink-0">FI</span>}
                      <span className="truncate text-gb-black">{f.nombre_fondo}</span>
                    </div>
                    <span className="text-emerald-600 font-semibold shrink-0 ml-2">
                      +{f.valor.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {rankings.top_baratos.length > 0 && (
            <div className="bg-white rounded-xl border border-gb-border p-5">
              <h3 className="text-sm font-semibold text-gb-black mb-3">Top 10 Menor TAC</h3>
              <div className="space-y-2">
                {rankings.top_baratos.map((f, i) => (
                  <div key={`${f.tipo}-${f.fo_run}-${f.fm_serie}`} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-gb-gray font-medium w-4">{i + 1}</span>
                      {f.tipo === 'FI' && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded font-semibold shrink-0">FI</span>}
                      <span className="truncate text-gb-black">{f.nombre_fondo}</span>
                    </div>
                    <span className="text-blue-600 font-semibold shrink-0 ml-2">
                      {f.valor.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AGF Cards — only show those with valid TAC data */}
      {!loadingStats && statsPorAGF.filter(a => a.tac_promedio > 0).length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gb-black mb-3">Costos por Administradora</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {statsPorAGF.filter(a => a.tac_promedio > 0).map((agf) => (
              <div key={agf.nombre_agf} className="bg-white p-4 rounded-lg border border-gb-border">
                <div className="text-sm font-semibold text-gb-black truncate mb-1">{agf.nombre_agf}</div>
                <div className="text-xs text-gb-gray mb-3">{agf.total_fondos} fondos</div>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-[10px] text-gb-gray">Promedio</div>
                    <div className="text-lg font-bold text-blue-600">{formatNumber(agf.tac_promedio)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gb-gray">Rango</div>
                    <div className="text-xs font-medium text-gb-gray">{formatNumber(agf.tac_min)} - {formatNumber(agf.tac_max)}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gb-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b-2 border-gb-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-gray">Fondo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-gray">AGF</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-gray">Familia</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-gray">Clase</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-gray cursor-pointer" onClick={() => handleOrdenar('rent_7d_nominal')}>
                  7d {ordenar === 'rent_7d_nominal' && (direccion === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-gray cursor-pointer" onClick={() => handleOrdenar('rent_30d_nominal')}>
                  30d {ordenar === 'rent_30d_nominal' && (direccion === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-gray cursor-pointer" onClick={() => handleOrdenar('rent_12m_nominal')}>
                  12m {ordenar === 'rent_12m_nominal' && (direccion === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-gray cursor-pointer" onClick={() => handleOrdenar('tac_sintetica')}>
                  TAC {ordenar === 'tac_sintetica' && (direccion === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gb-gray">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gb-border">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gb-gray">Cargando fondos...</td></tr>
              ) : fondos.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gb-gray">No se encontraron fondos</td></tr>
              ) : (
                fondos.map((fondo) => (
                  <tr key={fondo.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gb-black text-xs flex items-center gap-1.5">
                        {fondo.tipo_fondo === 'FI' && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded font-semibold shrink-0">FI</span>}
                        <span className="truncate">{fondo.nombre_fondo}</span>
                      </div>
                      <div className="text-[11px] text-gb-gray">{fondo.tipo_fondo === 'FI' ? `RUT ${fondo.fo_run}` : `${fondo.fo_run} - ${fondo.fm_serie}`}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gb-gray">{fondo.nombre_agf || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        fondo.categoria_simple === 'Renta Variable' ? 'bg-blue-50 text-blue-700' :
                        fondo.categoria_simple === 'Renta Fija' ? 'bg-green-50 text-green-700' :
                        fondo.categoria_simple === 'Balanceado' ? 'bg-amber-50 text-amber-700' :
                        fondo.categoria_simple?.startsWith('FI') ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gb-gray'
                      }`}>
                        {fondo.categoria_simple}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gb-gray">{fondo.clase_inversionista || '-'}</td>
                    <td className={`px-4 py-3 text-xs font-medium text-right ${rentColor(fondo.rent_7d_agregada ?? fondo.rent_7d_nominal)}`}>
                      {formatPct(fondo.rent_7d_agregada ?? fondo.rent_7d_nominal)}
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium text-right ${rentColor(fondo.rent_30d_agregada ?? fondo.rent_30d_nominal)}`}>
                      {formatPct(fondo.rent_30d_agregada ?? fondo.rent_30d_nominal)}
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium text-right ${rentColor(fondo.rent_365d_agregada ?? fondo.rent_12m_nominal)}`}>
                      {formatPct(fondo.rent_365d_agregada ?? fondo.rent_12m_nominal)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-right text-blue-600">
                      {formatPct(fondo.tac_sintetica)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleClickFondo(fondo)}
                        className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                          fondo.datos_diarios_count > 0
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-white text-blue-600 border-gb-border hover:bg-blue-50'
                        }`}
                      >
                        {fondo.datos_diarios_count > 0 ? `Ver (${fondo.datos_diarios_count})` : 'Cargar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginacion */}
        {!loading && totalPaginas > 1 && (
          <div className="px-4 py-3 border-t border-gb-border flex justify-between items-center">
            <div className="text-xs text-gb-gray">
              {((pagina - 1) * 50) + 1} - {Math.min(pagina * 50, total)} de {total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="px-3 py-1.5 rounded border border-gb-border text-xs disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="px-3 py-1.5 text-xs text-gb-gray">
                {pagina} / {totalPaginas}
              </span>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="px-3 py-1.5 rounded border border-gb-border text-xs disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {uploadDiariasOpen && selectedFondo && (
        <UploadRentDiariasModal fondo={selectedFondo} onClose={handleCloseModals} />
      )}
      {uploadAgregadasOpen && (
        <UploadRentAgregadasModal onClose={() => setUploadAgregadasOpen(false)} />
      )}
      {uploadTACOpen && (
        <UploadTACModal onClose={() => setUploadTACOpen(false)} />
      )}
      {detalleModalOpen && selectedFondo && (
        <FondoDetalleModal fondo={selectedFondo} onClose={handleCloseModals} />
      )}
      {syncFichasOpen && (
        <SyncFichasModal onClose={() => setSyncFichasOpen(false)} />
      )}
      {fiDetalleOpen && selectedFI && (
        <FIDetalleModal
          rut={selectedFI.rut}
          nombre={selectedFI.nombre}
          administradora={selectedFI.administradora}
          onClose={() => { setFiDetalleOpen(false); setSelectedFI(null); }}
        />
      )}
    </div>
  );
}
