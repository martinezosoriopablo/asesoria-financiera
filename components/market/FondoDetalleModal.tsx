'use client';

import { useState, useEffect } from 'react';
import ComparadorFondos from './ComparadorFondos';

interface FondoDetalleModalProps {
  fondo: {
    fo_run: number;
    fm_serie: string;
    nombre_fondo: string;
    nombre_agf: string;
  };
  onClose: () => void;
}

interface DatosDiarios {
  fecha: string;
  valor_cuota: number;
  rent_diaria: number;
}

interface Metricas {
  volatilidad_anual: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  var_95: number;
  rentabilidad_acumulada: number;
  mejor_dia: { fecha: string; valor: number };
  peor_dia: { fecha: string; valor: number };
}

export default function FondoDetalleModal({ fondo, onClose }: FondoDetalleModalProps) {
  const [activeTab, setActiveTab] = useState<'grafico' | 'tabla' | 'volatilidad' | 'metricas' | 'comparar'>('grafico');
  const [datos, setDatos] = useState<DatosDiarios[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('todo'); // 1m, 3m, 6m, 1y, todo
  const [metricas, setMetricas] = useState<Metricas | null>(null);

  // Cargar datos
  useEffect(() => {
    const fetchDatos = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/rentabilidades-diarias', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-fo-run': fondo.fo_run.toString(),
            'x-fm-serie': fondo.fm_serie
          }
        });
        
        const data = await response.json();
        
        if (data.success && data.datos) {
          setDatos(data.datos);
          calcularMetricas(data.datos);
        }
      } catch (error) {
        console.error('Error cargando datos:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDatos();
  }, [fondo]);

  // Calcular métricas
  const calcularMetricas = (datos: DatosDiarios[]) => {
    if (datos.length === 0) return;

    const rentabilidades = datos.map(d => d.rent_diaria);
    const n = rentabilidades.length;
    
    // Rentabilidad promedio
    const rentPromedio = rentabilidades.reduce((a, b) => a + b, 0) / n;
    
    // Desviación estándar (volatilidad diaria)
    const varianza = rentabilidades.reduce((sum, r) => sum + Math.pow(r - rentPromedio, 2), 0) / n;
    const volatilidad_diaria = Math.sqrt(varianza);
    const volatilidad_anual = volatilidad_diaria * Math.sqrt(252);
    
    // Sharpe Ratio (asumiendo risk-free rate = 0 por simplicidad)
    const sharpe_ratio = rentPromedio / volatilidad_diaria * Math.sqrt(252);
    
    // Sortino Ratio (solo desviación negativa)
    const rentNegativas = rentabilidades.filter(r => r < 0);
    const downside_deviation = rentNegativas.length > 0 
      ? Math.sqrt(rentNegativas.reduce((sum, r) => sum + Math.pow(r, 2), 0) / rentNegativas.length)
      : 0.0001;
    const sortino_ratio = rentPromedio / downside_deviation * Math.sqrt(252);
    
    // Max Drawdown
    let maxDrawdown = 0;
    let peak = datos[0].valor_cuota;
    datos.forEach(d => {
      if (d.valor_cuota > peak) peak = d.valor_cuota;
      const drawdown = ((peak - d.valor_cuota) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
    
    // VaR 95%
    const rentOrdenadas = [...rentabilidades].sort((a, b) => a - b);
    const var_95 = rentOrdenadas[Math.floor(n * 0.05)];
    
    // Rentabilidad acumulada
    const rentabilidad_acumulada = ((datos[datos.length - 1].valor_cuota / datos[0].valor_cuota) - 1) * 100;
    
    // Mejor y peor día
    const mejor = rentabilidades.reduce((max, r, i) => r > rentabilidades[max] ? i : max, 0);
    const peor = rentabilidades.reduce((min, r, i) => r < rentabilidades[min] ? i : min, 0);
    
    setMetricas({
      volatilidad_anual,
      sharpe_ratio,
      sortino_ratio,
      max_drawdown: maxDrawdown,
      var_95,
      rentabilidad_acumulada,
      mejor_dia: { fecha: datos[mejor].fecha, valor: rentabilidades[mejor] },
      peor_dia: { fecha: datos[peor].fecha, valor: rentabilidades[peor] }
    });
  };

  // Filtrar datos por período
  const datosFiltrados = () => {
    if (periodo === 'todo' || datos.length === 0) return datos;
    
    const hoy = new Date();
    const fechaInicio = new Date();
    
    switch (periodo) {
      case '1m': fechaInicio.setMonth(hoy.getMonth() - 1); break;
      case '3m': fechaInicio.setMonth(hoy.getMonth() - 3); break;
      case '6m': fechaInicio.setMonth(hoy.getMonth() - 6); break;
      case '1y': fechaInicio.setFullYear(hoy.getFullYear() - 1); break;
    }
    
    return datos.filter(d => new Date(d.fecha) >= fechaInicio);
  };

  // Exportar a Excel
  const exportarExcel = () => {
    const csv = [
      ['Fecha', 'Valor Cuota', 'Rentabilidad Diaria %'].join(','),
      ...datosFiltrados().map(d => [d.fecha, d.valor_cuota, d.rent_diaria].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fondo.nombre_fondo}_${fondo.fm_serie}_datos.csv`;
    a.click();
  };

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-CL');
  };

  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return '-';
    return num.toFixed(2);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '1200px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <h2 style={{ 
              fontSize: '20px', 
              fontWeight: '700', 
              color: '#1a1a1a', 
              marginBottom: '4px' 
            }}>
              {fondo.nombre_fondo}
            </h2>
            <div style={{ fontSize: '13px', color: '#666' }}>
              {fondo.nombre_agf} • {fondo.fo_run} - {fondo.fm_serie}
            </div>
            {datos.length > 0 && (
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                {datos.length} registros • {formatFecha(datos[0].fecha)} - {formatFecha(datos[datos.length - 1].fecha)}
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={exportarExcel}
              disabled={loading || datos.length === 0}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                color: '#2563eb',
                fontSize: '13px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1
              }}
            >
              💾 Exportar
            </button>
            
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                color: '#666',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              ✕ Cerrar
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          padding: '0 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          gap: '8px'
        }}>
          {[
            { id: 'grafico', label: '📈 Gráfico', icon: '📈' },
            { id: 'tabla', label: '📊 Tabla', icon: '📊' },
            { id: 'volatilidad', label: '📉 Volatilidad', icon: '📉' },
            { id: 'metricas', label: '🎯 Métricas', icon: '🎯' },
            { id: 'comparar', label: '⚖️ Comparar', icon: '⚖️' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 16px',
                border: 'none',
                backgroundColor: 'transparent',
                color: activeTab === tab.id ? '#2563eb' : '#666',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>
              Cargando datos...
            </div>
          ) : datos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#666', marginBottom: '8px' }}>
                No hay datos diarios
              </div>
              <div style={{ fontSize: '14px', color: '#999' }}>
                Carga un archivo Excel con las rentabilidades diarias
              </div>
            </div>
          ) : (
            <>
              {/* TAB: GRÁFICO */}
              {activeTab === 'grafico' && (
                <div>
                  {/* Selector de período */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '20px'
                  }}>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a' }}>
                      Evolución del Valor Cuota
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[
                        { id: '1m', label: '1M' },
                        { id: '3m', label: '3M' },
                        { id: '6m', label: '6M' },
                        { id: '1y', label: '1Y' },
                        { id: 'todo', label: 'Todo' }
                      ].map(p => (
                        <button
                          key={p.id}
                          onClick={() => setPeriodo(p.id)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #ddd',
                            backgroundColor: periodo === p.id ? '#2563eb' : 'white',
                            color: periodo === p.id ? 'white' : '#666',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Gráfico simple ASCII-style */}
                  <div style={{
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    padding: '20px',
                    height: '400px',
                    position: 'relative'
                  }}>
                    <svg width="100%" height="100%" style={{ display: 'block' }}>
                      {(() => {
                        const filtered = datosFiltrados();
                        if (filtered.length === 0) return null;
                        
                        const width = 1000;
                        const height = 360;
                        const padding = 40;
                        
                        const valores = filtered.map(d => d.valor_cuota);
                        const minVal = Math.min(...valores);
                        const maxVal = Math.max(...valores);
                        const rangoVal = maxVal - minVal;
                        
                        const puntos = filtered.map((d, i) => {
                          const x = padding + (i / (filtered.length - 1)) * (width - 2 * padding);
                          const y = height - padding - ((d.valor_cuota - minVal) / rangoVal) * (height - 2 * padding);
                          return `${x},${y}`;
                        }).join(' ');
                        
                        return (
                          <>
                            {/* Línea */}
                            <polyline
                              points={puntos}
                              fill="none"
                              stroke="#2563eb"
                              strokeWidth="2"
                            />
                            {/* Área */}
                            <polyline
                              points={`${padding},${height - padding} ${puntos} ${width - padding},${height - padding}`}
                              fill="rgba(37, 99, 235, 0.1)"
                              stroke="none"
                            />
                            {/* Eje Y */}
                            <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#ddd" strokeWidth="1" />
                            {/* Eje X */}
                            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#ddd" strokeWidth="1" />
                            {/* Labels eje Y */}
                            <text x={padding - 5} y={padding} textAnchor="end" fontSize="12" fill="#666">
                              {maxVal.toFixed(2)}
                            </text>
                            <text x={padding - 5} y={height - padding} textAnchor="end" fontSize="12" fill="#666">
                              {minVal.toFixed(2)}
                            </text>
                            {/* Labels eje X (fechas) */}
                            {(() => {
                              const indiceFechas = [0, Math.floor(filtered.length / 2), filtered.length - 1];
                              return indiceFechas.map(idx => {
                                if (idx >= filtered.length) return null;
                                const d = new Date(filtered[idx].fecha);
                                const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
                                const label = `${meses[d.getMonth()]}-${d.getFullYear().toString().slice(-2)}`;
                                const x = padding + (idx / (filtered.length - 1)) * (width - 2 * padding);
                                return (
                                  <text 
                                    key={idx}
                                    x={x} 
                                    y={height - padding + 20} 
                                    textAnchor="middle" 
                                    fontSize="11" 
                                    fill="#666"
                                  >
                                    {label}
                                  </text>
                                );
                              });
                            })()}
                          </>
                        );
                      })()}
                    </svg>
                  </div>

                  {/* Métricas rápidas */}
                  {metricas && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '12px',
                      marginTop: '20px'
                    }}>
                      <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>Rentabilidad Acumulada</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: metricas.rentabilidad_acumulada > 0 ? '#10b981' : '#ef4444' }}>
                          {formatNumber(metricas.rentabilidad_acumulada)}%
                        </div>
                      </div>
                      <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>Volatilidad Anual</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#2563eb' }}>
                          {formatNumber(metricas.volatilidad_anual)}%
                        </div>
                      </div>
                      <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>Sharpe Ratio</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#2563eb' }}>
                          {formatNumber(metricas.sharpe_ratio)}
                        </div>
                      </div>
                      <div style={{ padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>Max Drawdown</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#ef4444' }}>
                          -{formatNumber(metricas.max_drawdown)}%
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: TABLA */}
              {activeTab === 'tabla' && (
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', marginBottom: '16px' }}>
                    Datos Históricos ({datosFiltrados().length} registros)
                  </div>
                  
                  <div style={{ 
                    maxHeight: '500px', 
                    overflow: 'auto',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                        <tr>
                          <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#666', borderBottom: '1px solid #e5e7eb' }}>
                            Fecha
                          </th>
                          <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#666', borderBottom: '1px solid #e5e7eb' }}>
                            Valor Cuota
                          </th>
                          <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#666', borderBottom: '1px solid #e5e7eb' }}>
                            Rent. Diaria
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {datosFiltrados().reverse().map((d, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#1a1a1a' }}>
                              {formatFecha(d.fecha)}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '600', textAlign: 'right', color: '#1a1a1a' }}>
                              {formatNumber(d.valor_cuota)}
                            </td>
                            <td style={{ 
                              padding: '10px 12px', 
                              fontSize: '13px', 
                              fontWeight: '600', 
                              textAlign: 'right',
                              color: d.rent_diaria > 0 ? '#10b981' : '#ef4444'
                            }}>
                              {d.rent_diaria > 0 ? '+' : ''}{formatNumber(d.rent_diaria)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB: VOLATILIDAD */}
              {activeTab === 'volatilidad' && metricas && (
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', marginBottom: '16px' }}>
                    Análisis de Riesgo
                  </div>
                  
                  <div style={{ display: 'grid', gap: '16px' }}>
                    {/* Volatilidad */}
                    <div style={{ 
                      padding: '20px', 
                      backgroundColor: '#f9fafb', 
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                            Volatilidad Anualizada
                          </div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            Desviación estándar de rentabilidades
                          </div>
                        </div>
                        <div style={{ fontSize: '32px', fontWeight: '700', color: '#2563eb' }}>
                          {formatNumber(metricas.volatilidad_anual)}%
                        </div>
                      </div>
                      <div style={{ marginTop: '12px', fontSize: '12px', color: '#666' }}>
                        {metricas.volatilidad_anual < 5 ? '🟢 Volatilidad Baja' : 
                         metricas.volatilidad_anual < 15 ? '🟡 Volatilidad Media' : 
                         '🔴 Volatilidad Alta'}
                      </div>
                    </div>

                    {/* Max Drawdown */}
                    <div style={{ 
                      padding: '20px', 
                      backgroundColor: '#fef2f2', 
                      borderRadius: '8px',
                      border: '1px solid #fee2e2'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                            Máxima Caída (Drawdown)
                          </div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            Peor caída desde el máximo histórico
                          </div>
                        </div>
                        <div style={{ fontSize: '32px', fontWeight: '700', color: '#ef4444' }}>
                          -{formatNumber(metricas.max_drawdown)}%
                        </div>
                      </div>
                    </div>

                    {/* VaR */}
                    <div style={{ 
                      padding: '20px', 
                      backgroundColor: '#fef3c7', 
                      borderRadius: '8px',
                      border: '1px solid #fde68a'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                            VaR 95% (Value at Risk)
                          </div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            Pérdida máxima esperada en el 95% de los casos
                          </div>
                        </div>
                        <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>
                          {formatNumber(metricas.var_95)}%
                        </div>
                      </div>
                    </div>

                    {/* Mejor y Peor Día */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ 
                        padding: '16px', 
                        backgroundColor: '#f0fdf4', 
                        borderRadius: '8px',
                        border: '1px solid #bbf7d0'
                      }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                          📈 Mejor Día
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981', marginBottom: '4px' }}>
                          +{formatNumber(metricas.mejor_dia.valor)}%
                        </div>
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          {formatFecha(metricas.mejor_dia.fecha)}
                        </div>
                      </div>
                      
                      <div style={{ 
                        padding: '16px', 
                        backgroundColor: '#fef2f2', 
                        borderRadius: '8px',
                        border: '1px solid #fecaca'
                      }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                          📉 Peor Día
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#ef4444', marginBottom: '4px' }}>
                          {formatNumber(metricas.peor_dia.valor)}%
                        </div>
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          {formatFecha(metricas.peor_dia.fecha)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: MÉTRICAS */}
              {activeTab === 'metricas' && metricas && (
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', marginBottom: '16px' }}>
                    Ratios Financieros
                  </div>
                  
                  <div style={{ display: 'grid', gap: '20px' }}>
                    {/* Sharpe Ratio */}
                    <div style={{ 
                      padding: '20px', 
                      backgroundColor: 'white', 
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                            Sharpe Ratio
                          </div>
                          <div style={{ fontSize: '13px', color: '#666' }}>
                            Rentabilidad ajustada por riesgo (volatilidad total)
                          </div>
                        </div>
                        <div style={{ fontSize: '36px', fontWeight: '700', color: '#2563eb' }}>
                          {formatNumber(metricas.sharpe_ratio)}
                        </div>
                      </div>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f0f9ff', 
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#666'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1a1a1a' }}>Interpretación:</div>
                        {metricas.sharpe_ratio < 0 ? '🔴 Negativo: Rentabilidad inferior al activo libre de riesgo' :
                         metricas.sharpe_ratio < 1 ? '🟡 Bajo: 0-1 - Poco atractivo ajustado por riesgo' :
                         metricas.sharpe_ratio < 2 ? '🟢 Bueno: 1-2 - Rentabilidad adecuada vs riesgo' :
                         '🟢 Excelente: mayor a 2 - Muy buena rentabilidad ajustada por riesgo'}
                      </div>
                    </div>

                    {/* Sortino Ratio */}
                    <div style={{ 
                      padding: '20px', 
                      backgroundColor: 'white', 
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                            Sortino Ratio
                          </div>
                          <div style={{ fontSize: '13px', color: '#666' }}>
                            Rentabilidad ajustada por riesgo (solo volatilidad negativa)
                          </div>
                        </div>
                        <div style={{ fontSize: '36px', fontWeight: '700', color: '#10b981' }}>
                          {formatNumber(metricas.sortino_ratio)}
                        </div>
                      </div>
                      <div style={{ 
                        padding: '12px', 
                        backgroundColor: '#f0fdf4', 
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#666'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1a1a1a' }}>Interpretación:</div>
                        Similar al Sharpe, pero solo penaliza volatilidad negativa. Valores mayores a 2 son excelentes.
                      </div>
                    </div>

                    {/* Resumen */}
                    <div style={{ 
                      padding: '20px', 
                      backgroundColor: '#f9fafb', 
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', marginBottom: '12px' }}>
                        📋 Resumen General
                      </div>
                      <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#666' }}>Rentabilidad Total:</span>
                          <span style={{ fontWeight: '600', color: metricas.rentabilidad_acumulada > 0 ? '#10b981' : '#ef4444' }}>
                            {formatNumber(metricas.rentabilidad_acumulada)}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#666' }}>Volatilidad Anual:</span>
                          <span style={{ fontWeight: '600', color: '#2563eb' }}>
                            {formatNumber(metricas.volatilidad_anual)}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#666' }}>Ratio Rent/Riesgo:</span>
                          <span style={{ fontWeight: '600', color: '#2563eb' }}>
                            {formatNumber(metricas.rentabilidad_acumulada / metricas.volatilidad_anual)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#666' }}>Período Análisis:</span>
                          <span style={{ fontWeight: '600', color: '#1a1a1a' }}>
                            {datos.length} días
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: COMPARAR */}
              {activeTab === 'comparar' && (
                <ComparadorFondos fondoActual={fondo} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
