'use client';

import { useState } from 'react';

interface UploadTACModalProps {
  onClose: () => void;
}

export default function UploadTACModal({ onClose }: UploadTACModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [fechaActualizacion, setFechaActualizacion] = useState(new Date().toISOString().split('T')[0]);
  const [modo, setModo] = useState<'reemplazar' | 'actualizar'>('actualizar');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Por favor selecciona un archivo');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fecha_actualizacion', fechaActualizacion);
      formData.append('modo', modo);

      const response = await fetch('/api/tac', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 2000);
      } else {
        setError(data.error || 'Error al cargar datos');
        if (data.fondosNoEncontrados && data.fondosNoEncontrados.length > 0) {
          setError(data.error + ' | Fondos no encontrados: ' + data.fondosNoEncontrados.join(', '));
        }
      }
    } catch (error: any) {
      console.error('Error:', error);
      setError('Error de conexión: ' + error.message);
    } finally {
      setLoading(false);
    }
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
        maxWidth: '600px',
        padding: '32px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '700', 
            color: '#1a1a1a',
            marginBottom: '8px'
          }}>
            💰 Cargar TAC (Costos)
          </h2>
          <div style={{ fontSize: '13px', color: '#666' }}>
            Carga masiva de TAC Sintética por fondo
          </div>
        </div>

        {/* Formato esperado */}
        <div style={{
          padding: '16px',
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          marginBottom: '24px',
          border: '1px solid #bae6fd'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0c4a6e', marginBottom: '8px' }}>
            📋 Formato del Excel:
          </div>
          <div style={{ fontSize: '12px', color: '#0c4a6e', fontFamily: 'monospace' }}>
            fo_run | fm_serie | tac_sintetica
          </div>
          <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '8px' }}>
            Columnas opcionales: tac_administracion, tac_custodia, tac_total
          </div>
        </div>

        {/* Fecha de actualización */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ 
            display: 'block', 
            fontSize: '13px', 
            fontWeight: '600', 
            color: '#666', 
            marginBottom: '8px' 
          }}>
            Fecha de actualización:
          </label>
          <input
            type="date"
            value={fechaActualizacion}
            onChange={(e) => setFechaActualizacion(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #ddd',
              fontSize: '14px'
            }}
          />
        </div>

        {/* Modo */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#666', marginBottom: '8px' }}>
            Modo de carga:
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              borderRadius: '6px',
              border: `2px solid ${modo === 'reemplazar' ? '#6366f1' : '#ddd'}`,
              backgroundColor: modo === 'reemplazar' ? '#eef2ff' : 'white',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="radio"
                name="modo"
                value="reemplazar"
                checked={modo === 'reemplazar'}
                onChange={() => setModo('reemplazar')}
                style={{ cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>
                  🔄 Reemplazar todo
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  Borra TAC anterior de todos e inserta nuevos
                </div>
              </div>
            </label>
            
            <label style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              borderRadius: '6px',
              border: `2px solid ${modo === 'actualizar' ? '#6366f1' : '#ddd'}`,
              backgroundColor: modo === 'actualizar' ? '#eef2ff' : 'white',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="radio"
                name="modo"
                value="actualizar"
                checked={modo === 'actualizar'}
                onChange={() => setModo('actualizar')}
                style={{ cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>
                  ➕ Actualizar
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  Solo actualiza fondos incluidos en Excel
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* File input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            padding: '20px',
            border: '2px dashed #ddd',
            borderRadius: '8px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: file ? '#f0f9ff' : 'white',
            transition: 'all 0.2s'
          }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              disabled={loading}
            />
            <div style={{ fontSize: '14px', color: '#666' }}>
              {file ? (
                <>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
                  <div style={{ fontWeight: '600', color: '#1a1a1a' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                    {(file.size / 1024).toFixed(2)} KB
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>📁</div>
                  <div style={{ fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                    Click para seleccionar archivo Excel
                  </div>
                  <div style={{ fontSize: '12px', color: '#999' }}>
                    .xlsx o .xls
                  </div>
                </>
              )}
            </div>
          </label>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fee',
            borderRadius: '6px',
            marginBottom: '20px',
            border: '1px solid #fcc',
            maxHeight: '200px',
            overflow: 'auto'
          }}>
            <div style={{ fontSize: '13px', color: '#c00', fontWeight: '600', marginBottom: '8px' }}>
              ❌ Error al cargar datos
            </div>
            <div style={{ 
              fontSize: '12px', 
              color: '#800',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              lineHeight: '1.6'
            }}>
              {error.length > 500 ? (
                <>
                  {error.substring(0, 500)}...
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                    (Mensaje truncado - ver consola F12 para detalles completos)
                  </div>
                </>
              ) : error}
            </div>
          </div>
        )}

        {/* Success */}
        {result && (
          <div style={{
            padding: '16px',
            backgroundColor: '#d1fae5',
            borderRadius: '6px',
            marginBottom: '20px',
            border: '1px solid #86efac'
          }}>
            <div style={{ fontSize: '14px', color: '#065f46', fontWeight: '600', marginBottom: '8px' }}>
              ✅ TAC actualizados exitosamente
            </div>
            <div style={{ fontSize: '12px', color: '#047857' }}>
              • {result.actualizados} fondos actualizados
              {result.errores > 0 && ` • ${result.errores} errores`}
            </div>
            <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px' }}>
              Fecha: {result.fecha_actualizacion} | Modo: {result.modo}
              {result.tiempo_segundos && ` | ⚡ ${result.tiempo_segundos}s`}
            </div>
            {result.fondosNoEncontrados && result.fondosNoEncontrados.length > 0 && (
              <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '8px' }}>
                ⚠️ Fondos no encontrados: {result.fondosNoEncontrados.slice(0, 5).join(', ')}
                {result.fondosNoEncontrados.length > 5 && ` y ${result.fondosNoEncontrados.length - 5} más`}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: '1px solid #ddd',
              backgroundColor: 'white',
              color: '#666',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            Cerrar
          </button>
          
          <button
            onClick={handleSubmit}
            disabled={loading || !file}
            style={{
              padding: '10px 24px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: loading || !file ? '#ccc' : '#6366f1',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading || !file ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Cargando...' : 'Actualizar TAC'}
          </button>
        </div>
      </div>
    </div>
  );
}
