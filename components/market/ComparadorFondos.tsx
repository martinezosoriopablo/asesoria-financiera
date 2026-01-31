'use client';

import { useState, useEffect } from 'react';

interface ComparadorFondosProps {
  fondoActual: {
    fo_run: number;
    fm_serie: string;
    nombre_fondo: string;
  };
}

interface Fondo {
  id: string;
  fo_run: number;
  fm_serie: string;
  nombre_fondo: string;
  nombre_agf: string;
  datos_diarios_count: number;
}

interface DatosComparacion {
  fo_run: number;
  fm_serie: string;
  nombre_fondo: string;
  datos: Array<{ fecha: string; valor_cuota: number }>;
  color: string;
}

export default function ComparadorFondos({ fondoActual }: ComparadorFondosProps) {
  const [fondosDisponibles, setFondosDisponibles] = useState<Fondo[]>([]);
  const [fondosSeleccionados, setFondosSeleccionados] = useState<number[]>([fondoActual.fo_run]);
  const [datosComparacion, setDatosComparacion] = useState<DatosComparacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFondos, setLoadingFondos] = useState(true);
  const [periodo, setPeriodo] = useState('1y');

  const colores = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  // Cargar fondos disponibles
  useEffect(() => {
    const fetchFondos = async () => {
      setLoadingFondos(true);
      try {
        const response = await fetch('/api/fondos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'list',
            pagina: 1,
            familia: 'todos',
            clase: 'todos',
            busqueda: '',
            ordenar: 'nombre_fondo',
            direccion: 'asc',
            solo_con_datos_diarios: true  // ✅ NUEVO: Solo fondos con datos para comparar
          })
        });
        const data = await response.json();
        
        if (data.success) {
          // ✅ El API ya retorna solo fondos con datos
          console.log('📊 Fondos con datos para comparar:', data.fondos.length);
          setFondosDisponibles(data.fondos);
        }
      } catch (error) {
        console.error('Error cargando fondos:', error);
      } finally {
        setLoadingFondos(false);
      }
    };
    
    fetchFondos();
  }, []);

  // Cargar datos cuando cambian fondos seleccionados
  useEffect(() => {
    if (fondosSeleccionados.length > 0) {
      cargarDatosComparacion();
    }
  }, [fondosSeleccionados, periodo]);

  const cargarDatosComparacion = async () => {
    setLoading(true);
    const datosNuevos: DatosComparacion[] = [];

    for (let i = 0; i < fondosSeleccionados.length; i++) {
      const fo_run = fondosSeleccionados[i];
      const fondo = fondosDisponibles.find(f => f.fo_run === fo_run);
      
      if (!fondo) continue;

      try {
        const response = await fetch('/api/rentabilidades-diarias', {
          method: 'GET',
          headers: {
            'x-fo-run': fo_run.toString(),
            'x-fm-serie': fondo.fm_serie
          }
        });
        
        const data = await response.json();
        
        if (data.success && data.datos) {
          datosNuevos.push({
            fo_run: fondo.fo_run,
            fm_serie: fondo.fm_serie,
            nombre_fondo: fondo.nombre_fondo,
            datos: data.datos,
            color: colores[i % colores.length]
          });
        }
      } catch (error) {
        console.error(`Error cargando datos de ${fo_run}:`, error);
      }
    }

    setDatosComparacion(datosNuevos);
    setLoading(false);
  };

  const toggleFondo = (fo_run: number) => {
    if (fondosSeleccionados.includes(fo_run)) {
      // No permitir deseleccionar el último
      if (fondosSeleccionados.length === 1) return;
      setFondosSeleccionados(fondosSeleccionados.filter(f => f !== fo_run));
    } else {
      // Máximo 6 fondos
      if (fondosSeleccionados.length >= 6) {
        alert('Máximo 6 fondos para comparar');
        return;
      }
      setFondosSeleccionados([...fondosSeleccionados, fo_run]);
    }
  };

  // Normalizar datos a base 100
  const normalizarDatos = (datos: Array<{ fecha: string; valor_cuota: number }>, periodo: string) => {
    if (datos.length === 0) return [];
    
    // Filtrar por período
    const hoy = new Date();
    let fechaInicio = new Date();
    
    switch (periodo) {
      case '1m': fechaInicio.setMonth(hoy.getMonth() - 1); break;
      case '3m': fechaInicio.setMonth(hoy.getMonth() - 3); break;
      case '6m': fechaInicio.setMonth(hoy.getMonth() - 6); break;
      case '1y': fechaInicio.setFullYear(hoy.getFullYear() - 1); break;
      case 'todo': fechaInicio = new Date(0); break;
    }
    
    const datosFiltrados = datos.filter(d => new Date(d.fecha) >= fechaInicio);
    
    if (datosFiltrados.length === 0) return [];
    
    // Normalizar a base 100
    const valorInicial = datosFiltrados[0].valor_cuota;
    return datosFiltrados.map(d => ({
      fecha: d.fecha,
      valor: (d.valor_cuota / valorInicial) * 100
    }));
  };

  // Renderizar gráfico comparativo
  const renderGrafico = () => {
    if (datosComparacion.length === 0) return null;
    
    const width = 900;
    const height = 400;
    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 60;
    
    // Normalizar todos los datos
    const datosNormalizados = datosComparacion.map(fondo => ({
      ...fondo,
      datosNorm: normalizarDatos(fondo.datos, periodo)
    })).filter(f => f.datosNorm.length > 0);
    
    if (datosNormalizados.length === 0) {
      return <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>No hay datos para el período seleccionado</div>;
    }
    
    // Encontrar rango de fechas común
    const todasFechas = new Set<string>();
    datosNormalizados.forEach(f => f.datosNorm.forEach(d => todasFechas.add(d.fecha)));
    const fechasOrdenadas = Array.from(todasFechas).sort();
    
    // Calcular min/max de valores
    const todosValores = datosNormalizados.flatMap(f => f.datosNorm.map(d => d.valor));
    const minVal = Math.min(...todosValores);
    const maxVal = Math.max(...todosValores);
    const rangoVal = maxVal - minVal;
    
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        {/* Ejes */}
        <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="#ddd" strokeWidth="1" />
        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#ddd" strokeWidth="1" />
        
        {/* Línea de referencia 100 */}
        {minVal <= 100 && maxVal >= 100 && (
          <>
            <line 
              x1={paddingLeft} 
              y1={height - paddingBottom - ((100 - minVal) / rangoVal) * (height - paddingTop - paddingBottom)} 
              x2={width - paddingRight} 
              y2={height - paddingBottom - ((100 - minVal) / rangoVal) * (height - paddingTop - paddingBottom)} 
              stroke="#999" 
              strokeWidth="1" 
              strokeDasharray="5,5" 
            />
            <text 
              x={paddingLeft - 5} 
              y={height - paddingBottom - ((100 - minVal) / rangoVal) * (height - paddingTop - paddingBottom) + 5} 
              textAnchor="end" 
              fontSize="11" 
              fill="#999"
            >
              100
            </text>
          </>
        )}
        
        {/* Labels eje Y */}
        <text x={paddingLeft - 5} y={paddingTop + 5} textAnchor="end" fontSize="11" fill="#666" fontWeight="500">
          {maxVal.toFixed(1)}
        </text>
        <text x={paddingLeft - 5} y={height - paddingBottom + 5} textAnchor="end" fontSize="11" fill="#666" fontWeight="500">
          {minVal.toFixed(1)}
        </text>
        
        {/* Líneas de cada fondo */}
        {datosNormalizados.map((fondo, idx) => {
          const puntos = fondo.datosNorm.map((d, i) => {
            const x = paddingLeft + (fechasOrdenadas.indexOf(d.fecha) / (fechasOrdenadas.length - 1)) * (width - paddingLeft - paddingRight);
            const y = height - paddingBottom - ((d.valor - minVal) / rangoVal) * (height - paddingTop - paddingBottom);
            return `${x},${y}`;
          }).join(' ');
          
          return (
            <polyline
              key={idx}
              points={puntos}
              fill="none"
              stroke={fondo.color}
              strokeWidth="2.5"
              opacity="0.9"
            />
          );
        })}
        
        {/* Fechas eje X */}
        {[0, Math.floor(fechasOrdenadas.length / 2), fechasOrdenadas.length - 1].map(idx => {
          const fecha = fechasOrdenadas[idx];
          const x = paddingLeft + (idx / (fechasOrdenadas.length - 1)) * (width - paddingLeft - paddingRight);
          const d = new Date(fecha);
          const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
          const label = `${meses[d.getMonth()]}-${d.getFullYear().toString().slice(-2)}`;
          
          return (
            <text
              key={idx}
              x={x}
              y={height - paddingBottom + 20}
              textAnchor="middle"
              fontSize="11"
              fill="#666"
              fontWeight="500"
            >
              {label}
            </text>
          );
        })}
        
        {/* Leyenda */}
        {datosNormalizados.map((fondo, idx) => (
          <g key={idx} transform={`translate(${paddingLeft}, ${height - paddingBottom + 35 + idx * 15})`}>
            <line x1="0" y1="0" x2="20" y2="0" stroke={fondo.color} strokeWidth="2.5" />
            <text x="25" y="4" fontSize="11" fill="#666">
              {fondo.nombre_fondo.substring(0, 40)}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  return (
    <div>
      {/* Controles */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a' }}>
            Comparador de Fondos
          </div>
          
          {/* Selector de período */}
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
        
        {/* Info */}
        <div style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
          Selecciona hasta 6 fondos para comparar. Gráfico normalizado a base 100.
        </div>
        
        {/* Lista de fondos disponibles */}
        <div style={{
          maxHeight: '120px',
          overflow: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          padding: '8px',
          backgroundColor: '#fafafa'
        }}>
          {loadingFondos ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '13px' }}>
              ⏳ Cargando fondos disponibles...
            </div>
          ) : fondosDisponibles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '13px' }}>
              ⚠️ No hay fondos con datos diarios disponibles para comparar.
              <div style={{ fontSize: '12px', marginTop: '8px' }}>
                Carga datos diarios de fondos para usar el comparador.
              </div>
            </div>
          ) : (
            fondosDisponibles.map(fondo => {
              const isSelected = fondosSeleccionados.includes(fondo.fo_run);
              const colorIndex = fondosSeleccionados.indexOf(fondo.fo_run);
              const color = colorIndex >= 0 ? colores[colorIndex % colores.length] : '#ddd';
              
              return (
                <div
                  key={`${fondo.fo_run}-${fondo.fm_serie}`}
                  onClick={() => toggleFondo(fondo.fo_run)}
                  style={{
                    padding: '8px 12px',
                    margin: '4px 0',
                    borderRadius: '6px',
                    backgroundColor: isSelected ? `${color}15` : 'white',
                    border: `2px solid ${isSelected ? color : '#e5e7eb'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isSelected && (
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: color
                      }} />
                    )}
                    <span style={{ fontSize: '13px', fontWeight: isSelected ? '600' : '400', color: '#1a1a1a' }}>
                      {fondo.nombre_fondo}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#999' }}>
                    {fondo.fo_run} - {fondo.fm_serie}
                  </span>
                </div>
              );
            })
          )}
        </div>
        
        <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
          {fondosSeleccionados.length} de 6 fondos seleccionados
        </div>
      </div>
      
      {/* Gráfico */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>
          Cargando datos de comparación...
        </div>
      ) : (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          padding: '20px',
          minHeight: '400px'
        }}>
          {renderGrafico()}
        </div>
      )}
    </div>
  );
}
