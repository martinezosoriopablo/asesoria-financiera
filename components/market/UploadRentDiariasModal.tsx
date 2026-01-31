'use client';

import { useState } from 'react';

interface UploadRentDiariasModalProps {
  fondo: {
    fo_run: number;
    fm_serie: string;
    nombre_fondo: string;
  };
  onClose: () => void;
}

export default function UploadRentDiariasModal({ fondo, onClose }: UploadRentDiariasModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<'reemplazar' | 'agregar'>('reemplazar');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Selecciona un archivo Excel');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fo_run', fondo.fo_run.toString());
      formData.append('fm_serie', fondo.fm_serie);
      formData.append('modo', modo);

      const response = await fetch('/api/rentabilidades-diarias', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResult(data);
        setFile(null);
        
        console.log('✅ Upload exitoso:', {
          insertados: data.insertados,
          verificados: data.verificados,
          errores: data.errores
        });
        
        // ✅ MEJORADO: Cerrar modal y recargar página COMPLETA
        setTimeout(() => {
          // Cerrar modal primero
          onClose();
          
          // Agregar timestamp a URL para forzar recarga sin cache
          const url = new URL(window.location.href);
          url.searchParams.set('_reload', Date.now().toString());
          
          // Recargar página completa con nuevo URL
          window.location.href = url.toString();
        }, 2000);
      } else {
        setError(data.error || 'Error al cargar el archivo');
      }
    } catch (err: any) {
      setError('Error de conexión: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setError(null);
    setResult(null);
    onClose();
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
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '700', 
            color: '#1a1a1a', 
            marginBottom: '8px' 
          }}>
            Cargar Rentabilidades Diarias
          </h2>
          <div style={{ fontSize: '13px', color: '#666' }}>
            <div style={{ fontWeight: '600', marginBottom: '4px' }}>
              {fondo.nombre_fondo}
            </div>
            <div style={{ fontSize: '12px', color: '#999' }}>
              {fondo.fo_run} - {fondo.fm_serie}
            </div>
          </div>
        </div>

        {/* Formato esperado */}
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '12px'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '8px', color: '#666' }}>
            Formato del Excel:
          </div>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: '11px'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#e9ecef' }}>
                <th style={{ padding: '6px', textAlign: 'left', border: '1px solid #dee2e6' }}>
                  fecha
                </th>
                <th style={{ padding: '6px', textAlign: 'left', border: '1px solid #dee2e6' }}>
                  valor_cuota
                </th>
                <th style={{ padding: '6px', textAlign: 'left', border: '1px solid #dee2e6' }}>
                  rent_diaria
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '6px', border: '1px solid #dee2e6', color: '#666' }}>
                  2024-01-01
                </td>
                <td style={{ padding: '6px', border: '1px solid #dee2e6', color: '#666' }}>
                  1000.50
                </td>
                <td style={{ padding: '6px', border: '1px solid #dee2e6', color: '#666' }}>
                  0.05
                </td>
              </tr>
              <tr>
                <td style={{ padding: '6px', border: '1px solid #dee2e6', color: '#666' }}>
                  2024-01-02
                </td>
                <td style={{ padding: '6px', border: '1px solid #dee2e6', color: '#666' }}>
                  1001.00
                </td>
                <td style={{ padding: '6px', border: '1px solid #dee2e6', color: '#666' }}>
                  0.05
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#999' }}>
            * rent_diaria en porcentaje (ej: 0.05 = 0.05%)
          </div>
        </div>

        {/* File input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            padding: '15px',
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
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
                  <div style={{ fontWeight: '600', color: '#1a1a1a' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                    {(file.size / 1024).toFixed(2)} KB
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>📁</div>
                  <div style={{ fontWeight: '600', color: '#1a1a1a', marginBottom: '4px' }}>
                    Click para seleccionar archivo
                  </div>
                  <div style={{ fontSize: '12px', color: '#999' }}>
                    Excel (.xlsx, .xls)
                  </div>
                </>
              )}
            </div>
          </label>
        </div>

        {/* Modo: Reemplazar o Agregar */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#666', marginBottom: '8px' }}>
            Modo de carga:
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              borderRadius: '6px',
              border: `2px solid ${modo === 'reemplazar' ? '#2563eb' : '#ddd'}`,
              backgroundColor: modo === 'reemplazar' ? '#f0f9ff' : 'white',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="radio"
                name="modo"
                value="reemplazar"
                checked={modo === 'reemplazar'}
                onChange={(e) => setModo('reemplazar')}
                style={{ cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>
                  🔄 Reemplazar datos
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  Borra datos anteriores e inserta nuevos
                </div>
              </div>
            </label>
            
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              borderRadius: '6px',
              border: `2px solid ${modo === 'agregar' ? '#2563eb' : '#ddd'}`,
              backgroundColor: modo === 'agregar' ? '#f0f9ff' : 'white',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              <input
                type="radio"
                name="modo"
                value="agregar"
                checked={modo === 'agregar'}
                onChange={(e) => setModo('agregar')}
                style={{ cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>
                  ➕ Agregar datos
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  Mantiene datos anteriores y agrega nuevos
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#c00'
          }}>
            ❌ {error}
          </div>
        )}

        {/* Success */}
        {result && (
          <div style={{
            padding: '15px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '13px'
          }}>
            <div style={{ fontWeight: '600', color: '#166534', marginBottom: '8px' }}>
              ✅ Carga exitosa
            </div>
            <div style={{ color: '#15803d', fontSize: '12px' }}>
              <div>• {result.insertados} registros insertados</div>
              {result.verificados !== undefined && (
                <div>• {result.verificados} registros verificados en BD</div>
              )}
              {result.errores > 0 && (
                <div>• {result.errores} registros con error</div>
              )}
            </div>
            <div style={{ 
              marginTop: '12px', 
              padding: '8px',
              backgroundColor: '#dcfce7',
              borderRadius: '4px',
              fontSize: '11px',
              color: '#166534'
            }}>
              🔄 Cerrando modal y recargando en 2 segundos...
            </div>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleClose}
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
            onClick={handleUpload}
            disabled={!file || loading}
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: !file || loading ? '#ddd' : '#3b82f6',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: !file || loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Cargando...' : 'Cargar Datos'}
          </button>
        </div>
      </div>
    </div>
  );
}
