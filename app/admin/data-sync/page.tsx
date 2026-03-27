'use client';

import { useState, useEffect } from 'react';
import AdvisorHeader from '@/components/shared/AdvisorHeader';
import { useAdvisor } from '@/lib/hooks/useAdvisor';
import UploadRentAgregadasModal from '@/components/market/UploadRentAgregadasModal';
import UploadTACModal from '@/components/market/UploadTACModal';

interface SyncStatus {
  fintual: { funds: number; providers: number; lastUpdate: string | null } | null;
  aafm: { totalFunds: number; withPrice: number; todayPrices: number; latestPriceDate: string | null } | null;
}

export default function DataSyncPage() {
  const { advisor } = useAdvisor();
  const [status, setStatus] = useState<SyncStatus>({ fintual: null, aafm: null });
  const [loading, setLoading] = useState(true);

  // Sync states
  const [syncingFintual, setSyncingFintual] = useState(false);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncingAAFM, setSyncingAAFM] = useState(false);
  const [syncingFillPrices, setSyncingFillPrices] = useState(false);

  // Results
  const [results, setResults] = useState<Array<{ key: string; msg: string; ok: boolean; ts: number }>>([]);

  // Modals
  const [uploadRentOpen, setUploadRentOpen] = useState(false);
  const [uploadTACOpen, setUploadTACOpen] = useState(false);

  const addResult = (key: string, msg: string, ok: boolean) => {
    setResults(prev => [{ key, msg, ok, ts: Date.now() }, ...prev.filter(r => r.key !== key).slice(0, 9)]);
  };

  // Load status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [fintualRes, aafmRes] = await Promise.all([
          fetch('/api/fintual/sync').then(r => r.json()).catch(() => null),
          fetch('/api/aafm/sync').then(r => r.json()).catch(() => null),
        ]);
        setStatus({
          fintual: fintualRes?.success ? fintualRes.stats : null,
          aafm: aafmRes?.success ? aafmRes : null,
        });
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchStatus();
  }, []);

  const handleSyncFintual = async () => {
    setSyncingFintual(true);
    try {
      const res = await fetch('/api/fintual/sync?full=true', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addResult('fintual', `${data.result.providers} proveedores, ${data.result.funds} fondos, ${data.result.series} series`, true);
      } else {
        addResult('fintual', data.error, false);
      }
    } catch {
      addResult('fintual', 'Error de conexión', false);
    }
    setSyncingFintual(false);
  };

  const handleSyncPrices = async () => {
    setSyncingPrices(true);
    try {
      const res = await fetch('/api/fintual/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fintual_ids: [], days: 30 }),
      });
      const data = await res.json();
      if (data.success) {
        addResult('prices', `${data.results.synced} fondos, ${data.results.pricesAdded} registros de precio`, true);
      } else {
        addResult('prices', data.error, false);
      }
    } catch {
      addResult('prices', 'Error de conexión', false);
    }
    setSyncingPrices(false);
  };

  const handleSyncAAFM = async () => {
    setSyncingAAFM(true);
    try {
      const res = await fetch('/api/aafm/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        const parts = [`${data.updated} precios actualizados`];
        if (data.fondosMutuosUpdated) parts.push(`${data.fondosMutuosUpdated} rentabilidades`);
        if (data.historyRecords) parts.push(`${data.historyRecords} hist. cuotas`);
        parts.push(`fecha: ${data.date}`);
        addResult('aafm', parts.join(', '), true);
      } else {
        addResult('aafm', data.error, false);
      }
    } catch {
      addResult('aafm', 'Error de conexión', false);
    }
    setSyncingAAFM(false);
  };

  const handleFillPrices = async () => {
    setSyncingFillPrices(true);
    try {
      const res = await fetch('/api/portfolio/fill-prices', { method: 'POST' });
      const data = await res.json();
      if (data.success || data.filled !== undefined) {
        addResult('fill', `${data.filled || 0} precios actualizados de ${data.total || 0} holdings`, true);
      } else {
        addResult('fill', data.error || 'Error', false);
      }
    } catch {
      addResult('fill', 'Error de conexión', false);
    }
    setSyncingFillPrices(false);
  };

  if (!advisor) return null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
      <AdvisorHeader
        advisorName={advisor.name || ''}
        advisorEmail={advisor.email || ''}
        advisorLogo={advisor.logo}
        companyName={advisor.companyName}
        isAdmin={advisor.isAdmin}
      />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
            Sincronización de Datos
          </h1>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Panel de administración para actualizar precios, catálogos y rentabilidades.
            Ejecutar desde computador local para fuentes que requieren IP residencial (AAFM).
          </p>
        </div>

        {/* Status cards */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#666', marginBottom: '8px' }}>CATÁLOGO FINTUAL</div>
              {status.fintual ? (
                <>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a' }}>{status.fintual.funds} fondos</div>
                  <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                    {status.fintual.providers} proveedores
                    {status.fintual.lastUpdate && <> — Actualizado: {new Date(status.fintual.lastUpdate).toLocaleDateString('es-CL')}</>}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: '#999' }}>Sin datos</div>
              )}
            </div>
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#666', marginBottom: '8px' }}>PRECIOS AAFM</div>
              {status.aafm ? (
                <>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a' }}>{status.aafm.withPrice} con precio</div>
                  <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                    de {status.aafm.totalFunds} fondos — Hoy: {status.aafm.todayPrices}
                    {status.aafm.latestPriceDate && <> — Último: {status.aafm.latestPriceDate}</>}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: '#999' }}>Sin datos</div>
              )}
            </div>
          </div>
        )}

        {/* Sync buttons */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '16px' }}>Sincronización automática</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <SyncButton
              label="Sync AAFM (Precios Hoy)"
              description="Descarga precios del día y rentabilidades desde AAFM. Requiere IP residencial."
              color="#10b981"
              loading={syncingAAFM}
              onClick={handleSyncAAFM}
            />
            <SyncButton
              label="Sync Fintual (Catálogo)"
              description="Actualiza catálogo de proveedores, fondos y series desde Fintual API."
              color="#f59e0b"
              loading={syncingFintual}
              onClick={handleSyncFintual}
            />
            <SyncButton
              label="Sync Precios Fintual (30d)"
              description="Descarga precios históricos de 30 días para fondos Fintual."
              color="#0ea5e9"
              loading={syncingPrices}
              onClick={handleSyncPrices}
            />
            <SyncButton
              label="Fill Prices (Portafolios)"
              description="Actualiza precios de holdings en portafolios de clientes."
              color="#6366f1"
              loading={syncingFillPrices}
              onClick={handleFillPrices}
            />
          </div>
        </div>

        {/* Manual upload */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '16px' }}>Carga manual</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={() => setUploadRentOpen(true)}
              style={{
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: 'white',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#8b5cf6', marginBottom: '4px' }}>
                Cargar Rentabilidades
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                Subir Excel con rentabilidades agregadas por fondo.
              </div>
            </button>
            <button
              onClick={() => setUploadTACOpen(true)}
              style={{
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: 'white',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#6366f1', marginBottom: '4px' }}>
                Cargar TAC
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                Subir Excel con TAC sintética por fondo/serie.
              </div>
            </button>
          </div>
        </div>

        {/* Results log */}
        {results.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '12px' }}>Resultados</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {results.map(r => (
                <div
                  key={r.ts}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: r.ok ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${r.ok ? '#bbf7d0' : '#fecaca'}`,
                    fontSize: '13px',
                    color: r.ok ? '#166534' : '#dc2626',
                    fontWeight: '500',
                  }}
                >
                  <span style={{ fontWeight: '700', textTransform: 'uppercase', marginRight: '8px' }}>{r.key}:</span>
                  {r.msg}
                  <span style={{ float: 'right', color: '#999', fontWeight: '400', fontSize: '11px' }}>
                    {new Date(r.ts).toLocaleTimeString('es-CL')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {uploadRentOpen && <UploadRentAgregadasModal onClose={() => setUploadRentOpen(false)} />}
      {uploadTACOpen && <UploadTACModal onClose={() => setUploadTACOpen(false)} />}
    </div>
  );
}

function SyncButton({ label, description, color, loading, onClick }: {
  label: string;
  description: string;
  color: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '16px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: loading ? '#94a3b8' : color,
        color: 'white',
        cursor: loading ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        transition: 'opacity 0.2s',
        opacity: loading ? 0.7 : 1,
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px' }}>
        {loading ? 'Sincronizando...' : label}
      </div>
      <div style={{ fontSize: '11px', opacity: 0.85 }}>{description}</div>
    </button>
  );
}
