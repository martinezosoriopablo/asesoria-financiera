'use client';

import { useState, useEffect } from 'react';
import AdvisorHeader from '@/components/shared/AdvisorHeader';
import { useAdvisor } from '@/lib/hooks/useAdvisor';
import UploadRentDiariasModal from '@/components/market/UploadRentDiariasModal';
import FondoDetalleModal from '@/components/market/FondoDetalleModal';
import UploadRentAgregadasModal from '@/components/market/UploadRentAgregadasModal';
import UploadTACModal from '@/components/market/UploadTACModal';
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
  // Rentabilidades agregadas (nuevas)
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

export default function MarketDashboard() {
  const [fondos, setFondos] = useState<Fondo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsPorAGF, setStatsPorAGF] = useState<StatsPorAGF[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  
  // Filtros
  const [familia, setFamilia] = useState('todos');
  const [clase, setClase] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [ordenar, setOrdenar] = useState('rent_12m_nominal');
  const [direccion, setDireccion] = useState('desc');
  
  // Paginación
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  // Modales
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [detalleModalOpen, setDetalleModalOpen] = useState(false);
  const [selectedFondo, setSelectedFondo] = useState<{
    fo_run: number;
    fm_serie: string;
    nombre_fondo: string;
    nombre_agf: string;
  } | null>(null);

  const { advisor } = useAdvisor();
  const advisorEmail = advisor?.email || '';
  const advisorName = advisor?.name || '';
  
  // Estados para modales de carga masiva
  const [uploadRentAgregadasModalOpen, setUploadRentAgregadasModalOpen] = useState(false);
  const [uploadTACModalOpen, setUploadTACModalOpen] = useState(false);
  // Cargar estadísticas
  useEffect(() => {
    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const response = await fetch('/api/fondos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'stats',
            familia,
            clase
          })
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

  // Cargar fondos
  useEffect(() => {
    const fetchFondos = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/fondos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'list',
            familia,
            clase,
            busqueda,
            ordenar,
            direccion,
            pagina
          })
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
  }, [familia, clase, busqueda, ordenar, direccion, pagina]);

  const formatNumber = (num: number | null) => {
    if (num === null || num === undefined) return '-';
    return num.toFixed(2);
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
    setSelectedFondo({
      fo_run: fondo.fo_run,
      fm_serie: fondo.fm_serie,
      nombre_fondo: fondo.nombre_fondo,
      nombre_agf: fondo.nombre_agf
    });
    
    // Si tiene datos, abre el modal de detalle
    // Si no tiene datos, abre el modal de carga
    if (fondo.datos_diarios_count > 0) {
      setDetalleModalOpen(true);
    } else {
      setUploadModalOpen(true);
    }
  };

  const handleCloseModals = () => {
    setUploadModalOpen(false);
    setDetalleModalOpen(false);
    setSelectedFondo(null);
    // Recargar fondos para actualizar contador
    const fetchFondos = async () => {
      try {
        const response = await fetch('/api/fondos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'list',
            familia,
            clase,
            busqueda,
            ordenar,
            direccion,
            pagina
          })
        });
        const data = await response.json();
        if (data.success) {
          setFondos(data.fondos);
        }
      } catch (error) {
        console.error('Error recargando fondos:', error);
      }
    };
    fetchFondos();
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
      <AdvisorHeader
        advisorName={advisorName}
        advisorEmail={advisorEmail}
        advisorLogo={advisor?.logo}
        companyName={advisor?.companyName}
        isAdmin={advisor?.isAdmin}
      />

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        
        {/* Título */}
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
            Market Dashboard
          </h1>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Análisis del mercado de fondos mutuos en Chile
          </p>
        </div>

        {/* Botones de carga masiva */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setUploadRentAgregadasModalOpen(true)}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#10b981',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
          >
            <span style={{ fontSize: '18px' }}>📊</span>
            Cargar Rentabilidades
          </button>

          <button
            onClick={() => setUploadTACModalOpen(true)}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#6366f1',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6366f1'}
          >
            <span style={{ fontSize: '18px' }}>💰</span>
            Cargar TAC
          </button>
        </div>

        {/* Filtros */}
        <div style={{ 
          padding: '20px', 
          borderRadius: '12px', 
          backgroundColor: 'white', 
          border: '1px solid #e5e7eb',
          marginBottom: '30px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            
            {/* Familia */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                Familia
              </label>
              <select
                value={familia}
                onChange={(e) => { setFamilia(e.target.value); setPagina(1); }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: 'white'
                }}
              >
                <option value="todos">Todas las familias</option>
                <option value="Renta Variable">Renta Variable</option>
                <option value="Renta Fija">Renta Fija</option>
                <option value="Balanceado">Balanceado</option>
                <option value="Alternativos">Alternativos</option>
              </select>
            </div>

            {/* Clase */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                Clase inversionista
              </label>
              <select
                value={clase}
                onChange={(e) => { setClase(e.target.value); setPagina(1); }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: 'white'
                }}
              >
                <option value="todos">Todas las clases</option>
                <option value="Retail">Retail</option>
                <option value="APV">APV</option>
                <option value="Alto Patrimonio">Alto Patrimonio</option>
              </select>
            </div>

            {/* Buscar */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                Buscar fondo
              </label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                placeholder="Nombre del fondo o AGF..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>
        </div>

        {/* Tarjetas AGF */}
        {!loadingStats && statsPorAGF.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <h2 style={{ 
              fontSize: '18px', 
              fontWeight: '700', 
              color: '#1a1a1a', 
              marginBottom: '15px' 
            }}>
              Costos por Administradora
            </h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: '15px' 
            }}>
              {statsPorAGF.map((agf) => (
                <div 
                  key={agf.nombre_agf}
                  style={{ 
                    backgroundColor: 'white', 
                    padding: '16px', 
                    borderRadius: '8px', 
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    border: '1px solid #f0f0f0'
                  }}
                >
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: '700', 
                    color: '#1a1a1a', 
                    marginBottom: '8px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {agf.nombre_agf}
                  </div>
                  
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#666', 
                    marginBottom: '12px' 
                  }}>
                    {agf.total_fondos} {agf.total_fondos === 1 ? 'fondo' : 'fondos'}
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <div>
                      <div style={{ fontSize: '10px', color: '#999', marginBottom: '2px' }}>
                        Promedio
                      </div>
                      <div style={{ 
                        fontSize: '20px', 
                        fontWeight: '700', 
                        color: '#2563eb'
                      }}>
                        {formatNumber(agf.tac_promedio)}%
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: '#999', marginBottom: '2px' }}>
                        Rango
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        color: '#666' 
                      }}>
                        {formatNumber(agf.tac_min)} - {formatNumber(agf.tac_max)}%
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ 
                    width: '100%', 
                    height: '4px', 
                    backgroundColor: '#f0f0f0', 
                    borderRadius: '2px',
                    position: 'relative',
                    marginTop: '8px'
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: '0',
                      height: '100%',
                      width: `${Math.min(100, (agf.tac_promedio / (agf.tac_max || 1)) * 100)}%`,
                      backgroundColor: '#2563eb',
                      borderRadius: '2px'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabla de fondos */}
        <div style={{ 
          borderRadius: '12px', 
          backgroundColor: 'white', 
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef' }}>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Fondo
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    AGF
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Familia
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Clase
                  </th>
                  <th 
                    style={{ 
                      padding: '12px', 
                      textAlign: 'right', 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      color: '#666', 
                      cursor: 'pointer' 
                    }}
                    onClick={() => handleOrdenar('rent_7d_nominal')}
                  >
                    7d {ordenar === 'rent_7d_nominal' && (direccion === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    style={{ 
                      padding: '12px', 
                      textAlign: 'right', 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      color: '#666', 
                      cursor: 'pointer' 
                    }}
                    onClick={() => handleOrdenar('rent_30d_nominal')}
                  >
                    30d {ordenar === 'rent_30d_nominal' && (direccion === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    style={{ 
                      padding: '12px', 
                      textAlign: 'right', 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      color: '#666', 
                      cursor: 'pointer' 
                    }}
                    onClick={() => handleOrdenar('rent_3m_nominal')}
                  >
                    3m {ordenar === 'rent_3m_nominal' && (direccion === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    style={{ 
                      padding: '12px', 
                      textAlign: 'right', 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      color: '#666', 
                      cursor: 'pointer' 
                    }}
                    onClick={() => handleOrdenar('rent_12m_nominal')}
                  >
                    12m {ordenar === 'rent_12m_nominal' && (direccion === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    style={{ 
                      padding: '12px', 
                      textAlign: 'right', 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      color: '#666', 
                      cursor: 'pointer' 
                    }}
                    onClick={() => handleOrdenar('tac_sintetica')}
                  >
                    TAC {ordenar === 'tac_sintetica' && (direccion === 'asc' ? '↑' : '↓')}
                  </th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#666' }}>
                    Análisis
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                      Cargando fondos...
                    </td>
                  </tr>
                ) : fondos.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                      No se encontraron fondos
                    </td>
                  </tr>
                ) : (
                  fondos.map((fondo) => {
                    const tieneDatos = fondo.datos_diarios_count > 0;
                    
                    return (
                      <tr key={fondo.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px', fontSize: '13px' }}>
                          <div style={{ fontWeight: '600', color: '#1a1a1a', marginBottom: '2px' }}>
                            {fondo.nombre_fondo}
                          </div>
                          <div style={{ fontSize: '11px', color: '#999' }}>
                            {fondo.fo_run} - {fondo.fm_serie}
                          </div>
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: '#666' }}>
                          {fondo.nombre_agf || '-'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            backgroundColor: 
                              fondo.categoria_simple === 'Renta Variable' ? '#dbeafe' :
                              fondo.categoria_simple === 'Renta Fija' ? '#dcfce7' :
                              fondo.categoria_simple === 'Balanceado' ? '#fef3c7' : '#f3f4f6',
                            color:
                              fondo.categoria_simple === 'Renta Variable' ? '#1e40af' :
                              fondo.categoria_simple === 'Renta Fija' ? '#166534' :
                              fondo.categoria_simple === 'Balanceado' ? '#854d0e' : '#666'
                          }}>
                            {fondo.categoria_simple}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: '#666' }}>
                          {fondo.clase_inversionista || '-'}
                        </td>
                        <td style={{ 
                          padding: '12px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          textAlign: 'right',
                          color: ((fondo.rent_7d_agregada ?? fondo.rent_7d_nominal) || 0) > 0 ? '#10b981' : '#ef4444'
                        }}>
                          {formatNumber(fondo.rent_7d_agregada ?? fondo.rent_7d_nominal)}%
                        </td>
                        <td style={{ 
                          padding: '12px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          textAlign: 'right',
                          color: ((fondo.rent_30d_agregada ?? fondo.rent_30d_nominal) || 0) > 0 ? '#10b981' : '#ef4444'
                        }}>
                          {formatNumber(fondo.rent_30d_agregada ?? fondo.rent_30d_nominal)}%
                        </td>
                        <td style={{ 
                          padding: '12px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          textAlign: 'right',
                          color: ((fondo.rent_90d_agregada ?? fondo.rent_3m_nominal) || 0) > 0 ? '#10b981' : '#ef4444'
                        }}>
                          {formatNumber(fondo.rent_90d_agregada ?? fondo.rent_3m_nominal)}%
                        </td>
                        <td style={{ 
                          padding: '12px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          textAlign: 'right',
                          color: ((fondo.rent_365d_agregada ?? fondo.rent_12m_nominal) || 0) > 0 ? '#10b981' : '#ef4444'
                        }}>
                          {formatNumber(fondo.rent_365d_agregada ?? fondo.rent_12m_nominal)}%
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', fontWeight: '600', textAlign: 'right', color: '#2563eb' }}>
                          {formatNumber(fondo.tac_sintetica)}%
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleClickFondo(fondo)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #ddd',
                              backgroundColor: tieneDatos ? '#f0fdf4' : 'white',
                              color: tieneDatos ? '#16a34a' : '#3b82f6',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              margin: '0 auto'
                            }}
                            title={tieneDatos ? `Ver análisis (${fondo.datos_diarios_count} días)` : 'Cargar datos diarios'}
                          >
                            {tieneDatos ? `📊 Ver (${fondo.datos_diarios_count})` : '📊 Cargar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {!loading && totalPaginas > 1 && (
            <div style={{ 
              padding: '15px 20px', 
              borderTop: '1px solid #f0f0f0', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <div style={{ fontSize: '13px', color: '#666' }}>
                Mostrando {((pagina - 1) * 50) + 1} - {Math.min(pagina * 50, total)} de {total} fondos
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    backgroundColor: pagina === 1 ? '#f5f5f5' : 'white',
                    color: pagina === 1 ? '#999' : '#333',
                    cursor: pagina === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '13px'
                  }}
                >
                  ← Anterior
                </button>
                <div style={{ padding: '6px 12px', fontSize: '13px', color: '#666' }}>
                  Página {pagina} de {totalPaginas}
                </div>
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    backgroundColor: pagina === totalPaginas ? '#f5f5f5' : 'white',
                    color: pagina === totalPaginas ? '#999' : '#333',
                    cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de carga (fondos sin datos) */}
      {uploadModalOpen && selectedFondo && (
        <UploadRentDiariasModal
          fondo={selectedFondo}
          onClose={handleCloseModals}
        />
      )}

      {/* Modal de detalle (fondos con datos) */}
      {detalleModalOpen && selectedFondo && (
        <FondoDetalleModal
          fondo={selectedFondo}
          onClose={handleCloseModals}
        />
      )}

      {/* Modal de carga masiva de rentabilidades */}
      {uploadRentAgregadasModalOpen && (
        <UploadRentAgregadasModal
          onClose={() => setUploadRentAgregadasModalOpen(false)}
        />
      )}

      {/* Modal de carga masiva de TAC */}
      {uploadTACModalOpen && (
        <UploadTACModal
          onClose={() => setUploadTACModalOpen(false)}
        />
      )}
    </div>
  );
}
