'use client';

import { useState, useEffect } from 'react';
import { useAdvisor } from '@/lib/hooks/useAdvisor';
import UploadRentAgregadasModal from '@/components/market/UploadRentAgregadasModal';
import UploadTACModal from '@/components/market/UploadTACModal';

interface SyncStatus {
  fintual: { funds: number; providers: number; lastUpdate: string | null } | null;
  aafm: { totalFunds: number; withPrice: number; todayPrices: number; latestPriceDate: string | null } | null;
  cmf: { latestDate: string | null; totalFondos: number; todayPrices: number; yesterdayPrices: number; autoSyncAvailable: boolean } | null;
}

interface DataHealth {
  prices: {
    totalFondos: number;
    fondosWithRecentPrice: number;
    fondosWithAnyPrice: number;
    fondosWithoutPrice: number;
    latestPriceDate: string | null;
    coveragePercent: number;
  };
  clients: {
    totalActive: number;
    withSnapshots: number;
    withStaleData: number;
    staleClients: string[];
  };
  staleHoldings: Array<{
    clientName: string;
    fundName: string;
    run: string;
    daysSinceSnapshot: number;
  }>;
  fichas: {
    totalFM: number;
    totalFI: number;
    withTAC: number;
    tacCoveragePercent: number;
    likelyGemini: number;
    withBeneficio: number;
  };
  fi: {
    total: number;
    synced: number;
    failed: number;
    neverSynced: number;
  };
  exchangeRates: {
    dolar: number;
    uf: number;
    source: string;
    date: string;
  };
}

export default function DataSyncPage() {
  const { advisor } = useAdvisor();
  const [status, setStatus] = useState<SyncStatus>({ fintual: null, aafm: null, cmf: null });
  const [loading, setLoading] = useState(true);

  // Sync states
  const [syncingFintual, setSyncingFintual] = useState(false);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [syncingAAFM, setSyncingAAFM] = useState(false);
  const [syncingFillPrices, setSyncingFillPrices] = useState(false);
  const [uploadingCMF, setUploadingCMF] = useState(false);
  const [syncingCMFAuto, setSyncingCMFAuto] = useState(false);
  const [syncingFINRA, setSyncingFINRA] = useState(false);
  const [syncingFINRAHist, setSyncingFINRAHist] = useState(false);
  const [finraStatus, setFinraStatus] = useState<{ configured: boolean; isLocal: boolean; totalBonds: number; latestDate: string | null } | null>(null);

  // Results
  const [results, setResults] = useState<Array<{ key: string; msg: string; ok: boolean; ts: number }>>([]);

  // Modals
  const [uploadRentOpen, setUploadRentOpen] = useState(false);
  const [uploadTACOpen, setUploadTACOpen] = useState(false);
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const addResult = (key: string, msg: string, ok: boolean) => {
    setResults(prev => [{ key, msg, ok, ts: Date.now() }, ...prev.filter(r => r.key !== key).slice(0, 9)]);
  };

  // Load status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [fintualRes, aafmRes, cmfRes] = await Promise.all([
          fetch('/api/fintual/sync').then(r => r.json()).catch(() => null),
          fetch('/api/aafm/sync').then(r => r.json()).catch(() => null),
          fetch('/api/cmf/auto-sync').then(r => r.json()).catch(() => null),
        ]);
        setStatus({
          fintual: fintualRes?.success ? fintualRes.stats : null,
          aafm: aafmRes?.success ? aafmRes : null,
          cmf: cmfRes?.success ? cmfRes : null,
        });
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchStatus();

    // Fetch FINRA bond status
    fetch('/api/bonds/sync-finra')
      .then(r => r.json())
      .then(d => { if (d.success) setFinraStatus(d); })
      .catch(() => {});

    // Fetch data health
    fetch('/api/admin/data-health')
      .then(r => r.json())
      .then(d => { if (d.success) setHealth(d); })
      .catch(() => {})
      .finally(() => setHealthLoading(false));
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

  const handleAutoSyncCMF = async () => {
    setSyncingCMFAuto(true);
    try {
      const res = await fetch('/api/cmf/auto-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        const parts = [
          `${data.import?.dailyPricesUpserted || 0} precios`,
          `${data.fondos} fondos`,
          `${data.rango?.inicio} → ${data.rango?.termino}`,
        ];
        if (data.captchaSolveMs) parts.push(`captcha: ${(data.captchaSolveMs / 1000).toFixed(1)}s`);
        addResult('cmf-auto', parts.join(', '), true);
        // Refresh status
        fetch('/api/cmf/auto-sync').then(r => r.json()).then(d => {
          if (d.success) setStatus(prev => ({ ...prev, cmf: d }));
        }).catch(() => {});
      } else {
        addResult('cmf-auto', data.error, false);
      }
    } catch {
      addResult('cmf-auto', 'Error de conexión', false);
    }
    setSyncingCMFAuto(false);
  };

  const handleUploadCMF = async (file: File) => {
    setUploadingCMF(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/cmf/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        const r = data.result;
        const parts = [
          `${r.dailyPricesUpserted} precios`,
          `${r.fondosCreated} fondos nuevos`,
          `${r.historyUpserted} historial`,
        ];
        if (data.metadata) parts.push(`${data.metadata.fechaInicio} → ${data.metadata.fechaTermino}`);
        addResult('cmf', parts.join(', '), true);
        // Refresh status
        fetch('/api/cmf/import').then(r => r.json()).then(d => {
          if (d.success) setStatus(prev => ({ ...prev, cmf: d }));
        }).catch(() => {});
      } else {
        addResult('cmf', data.error, false);
      }
    } catch {
      addResult('cmf', 'Error de conexión', false);
    }
    setUploadingCMF(false);
  };

  const handleSyncFINRA = async () => {
    setSyncingFINRA(true);
    try {
      const res = await fetch('/api/bonds/sync-finra', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addResult('finra', `${data.updated} bonos actualizados de ${data.total} (${data.errors} errores) — login: ${((data.loginTimeMs || 0) / 1000).toFixed(1)}s`, data.errors === 0);
        fetch('/api/bonds/sync-finra').then(r => r.json())
          .then(d => { if (d.success) setFinraStatus(d); })
          .catch(() => {});
      } else {
        addResult('finra', data.error, false);
      }
    } catch {
      addResult('finra', 'Error de conexion', false);
    }
    setSyncingFINRA(false);
  };

  const handleSyncFINRAHistorical = async () => {
    setSyncingFINRAHist(true);
    try {
      const res = await fetch('/api/bonds/sync-finra-historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 90 }),
      });
      const data = await res.json();
      if (data.success) {
        const ok = data.summary?.filter((s: { error?: string }) => !s.error).length || 0;
        const fail = data.summary?.filter((s: { error?: string }) => s.error).length || 0;
        addResult('finra-hist', `${data.totalDaysInserted} días insertados de ${data.cusipsQueried} bonos (${ok} OK, ${fail} sin datos)`, true);
        fetch('/api/bonds/sync-finra').then(r => r.json())
          .then(d => { if (d.success) setFinraStatus(d); })
          .catch(() => {});
      } else {
        addResult('finra-hist', data.error, false);
      }
    } catch {
      addResult('finra-hist', 'Error de conexión', false);
    }
    setSyncingFINRAHist(false);
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

        {/* Data Health Dashboard */}
        {!healthLoading && health && (
          <div style={{ marginBottom: '24px' }}>
            {/* Health summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <HealthCard
                label="Cobertura Precios"
                value={`${health.prices.coveragePercent}%`}
                detail={`${health.prices.fondosWithRecentPrice} de ${health.prices.totalFondos} fondos`}
                status={health.prices.coveragePercent >= 80 ? 'good' : health.prices.coveragePercent >= 50 ? 'warn' : 'bad'}
              />
              <HealthCard
                label="Clientes con Datos Stale"
                value={`${health.clients.withStaleData}`}
                detail={`de ${health.clients.totalActive} activos`}
                status={health.clients.withStaleData === 0 ? 'good' : health.clients.withStaleData <= 3 ? 'warn' : 'bad'}
              />
              <HealthCard
                label="Cobertura TAC"
                value={`${health.fichas.tacCoveragePercent}%`}
                detail={`${health.fichas.withTAC} de ${health.fichas.totalFM} fichas FM`}
                status={health.fichas.tacCoveragePercent >= 70 ? 'good' : health.fichas.tacCoveragePercent >= 40 ? 'warn' : 'bad'}
              />
              <HealthCard
                label="Tipo de Cambio"
                value={`$${health.exchangeRates.dolar.toFixed(0)}`}
                detail={health.exchangeRates.source}
                status={health.exchangeRates.source.includes('Central') ? 'good' : health.exchangeRates.source.includes('fallback') ? 'warn' : 'good'}
              />
            </div>

            {/* Detailed health info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Prices detail */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '12px' }}>Precios de Fondos</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>Último precio CMF</span>
                    <span style={{ fontWeight: '600' }}>{health.prices.latestPriceDate || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>Con precio reciente (3d)</span>
                    <span style={{ fontWeight: '600', color: '#10b981' }}>{health.prices.fondosWithRecentPrice}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>Sin precio alguno</span>
                    <span style={{ fontWeight: '600', color: health.prices.fondosWithoutPrice > 0 ? '#ef4444' : '#10b981' }}>
                      {health.prices.fondosWithoutPrice}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>UF actual</span>
                    <span style={{ fontWeight: '600' }}>${health.exchangeRates.uf.toLocaleString('es-CL', { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Fichas detail */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '12px' }}>Fichas CMF (Extracción)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>Fichas FM</span>
                    <span style={{ fontWeight: '600' }}>{health.fichas.totalFM}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>Fichas FI</span>
                    <span style={{ fontWeight: '600' }}>{health.fichas.totalFI}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>Con TAC extraído</span>
                    <span style={{ fontWeight: '600', color: '#10b981' }}>{health.fichas.withTAC}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>Extraídas con Gemini</span>
                    <span style={{ fontWeight: '600', color: '#6366f1' }}>{health.fichas.likelyGemini}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#666' }}>Con beneficio tributario</span>
                    <span style={{ fontWeight: '600' }}>{health.fichas.withBeneficio}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Alerts: stale clients */}
            {health.clients.staleClients.length > 0 && (
              <div style={{
                marginTop: '16px', padding: '14px 16px', borderRadius: '12px',
                backgroundColor: '#fef3c7', border: '1px solid #fcd34d',
              }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400e', marginBottom: '6px' }}>
                  Clientes con datos desactualizados (&gt;7 días)
                </div>
                <div style={{ fontSize: '12px', color: '#78350f' }}>
                  {health.clients.staleClients.join(' · ')}
                </div>
              </div>
            )}

            {/* FI sync status */}
            {health.fi.failed > 0 && (
              <div style={{
                marginTop: '12px', padding: '14px 16px', borderRadius: '12px',
                backgroundColor: '#fef2f2', border: '1px solid #fecaca',
              }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b', marginBottom: '4px' }}>
                  Fondos de Inversión: {health.fi.failed} con error de sync
                </div>
                <div style={{ fontSize: '12px', color: '#7f1d1d' }}>
                  {health.fi.synced} OK · {health.fi.neverSynced} nunca sincronizados · {health.fi.total} total
                </div>
              </div>
            )}
          </div>
        )}

        {/* CMF Status card — primary source */}
        {!loading && status.cmf && (
          <div style={{ background: 'white', borderRadius: '12px', border: '2px solid #10b981', padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#10b981', marginBottom: '8px' }}>
                  CMF CARTOLA DIARIA — FUENTE PRINCIPAL
                </div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a' }}>
                  {status.cmf.totalFondos} fondos
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                  {status.cmf.latestDate && <>Último: {status.cmf.latestDate}</>}
                  {status.cmf.todayPrices > 0 && <> — Hoy: {status.cmf.todayPrices} precios</>}
                  {status.cmf.yesterdayPrices > 0 && <> — Ayer: {status.cmf.yesterdayPrices} precios</>}
                </div>
              </div>
              <div style={{ fontSize: '12px', color: status.cmf.autoSyncAvailable ? '#10b981' : '#f59e0b', textAlign: 'right', fontWeight: '600' }}>
                {status.cmf.autoSyncAvailable ? '2captcha configurado' : '2captcha no configurado'}
              </div>
            </div>
          </div>
        )}

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

        {/* CMF Sync — Primary */}
        <div style={{ background: 'white', borderRadius: '12px', border: '2px solid #10b981', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
            CMF Cartola Diaria
          </h2>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
            Fuente principal de precios. Cubre 2,500+ fondos (100% del mercado chileno).
          </p>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Auto-sync button — primary */}
            <button
              onClick={handleAutoSyncCMF}
              disabled={syncingCMFAuto}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: syncingCMFAuto ? '#94a3b8' : '#10b981',
                color: 'white',
                cursor: syncingCMFAuto ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '14px',
              }}
            >
              {syncingCMFAuto ? 'Descargando + importando...' : 'Auto-Sync CMF (2captcha)'}
            </button>

            {/* Manual upload — fallback */}
            <label
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: uploadingCMF ? '#f3f4f6' : 'white',
                color: uploadingCMF ? '#94a3b8' : '#374151',
                cursor: uploadingCMF ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '13px',
                display: 'inline-block',
              }}
            >
              {uploadingCMF ? 'Importando...' : 'Subir .txt manual'}
              <input
                type="file"
                accept=".txt,.csv"
                style={{ display: 'none' }}
                disabled={uploadingCMF}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadCMF(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {syncingCMFAuto && (
            <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '13px', color: '#166534' }}>
              Resolviendo CAPTCHA via 2captcha + descargando cartola + importando a Supabase... (puede tardar ~30s)
            </div>
          )}
        </div>

        {/* FINRA Bond Prices */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
            Precios de Bonos (FINRA)
          </h2>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
            Scraping del portal FINRA para precios de bonos corporativos desde el watchlist. Solo funciona desde localhost (Playwright).
          </p>

          {finraStatus && (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '13px' }}>
              <span style={{ color: finraStatus.configured ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                {finraStatus.configured ? 'Credenciales OK' : 'Sin credenciales FINRA'}
              </span>
              {!finraStatus.isLocal && (
                <span style={{ color: '#f59e0b', fontWeight: '600' }}>
                  No localhost
                </span>
              )}
              {finraStatus.totalBonds > 0 && (
                <span style={{ color: '#666' }}>
                  {finraStatus.totalBonds} bonos · Ultimo: {finraStatus.latestDate}
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={handleSyncFINRA}
              disabled={syncingFINRA}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: syncingFINRA ? '#94a3b8' : '#7c3aed',
                color: 'white',
                cursor: syncingFINRA ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '14px',
              }}
            >
              {syncingFINRA ? 'Buscando precios...' : 'Sync Watchlist (Playwright)'}
            </button>

            <button
              onClick={handleSyncFINRAHistorical}
              disabled={syncingFINRAHist}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: syncingFINRAHist ? '#94a3b8' : '#6d28d9',
                color: 'white',
                cursor: syncingFINRAHist ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '14px',
              }}
            >
              {syncingFINRAHist ? 'Descargando histórico...' : 'Sync Histórico (90d)'}
            </button>
          </div>

          {syncingFINRA && (
            <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#f5f3ff', border: '1px solid #c4b5fd', fontSize: '13px', color: '#5b21b6' }}>
              Abriendo browser, logueandose en FINRA y leyendo watchlist... (puede tardar ~30-60s)
            </div>
          )}

          {syncingFINRAHist && (
            <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#f5f3ff', border: '1px solid #c4b5fd', fontSize: '13px', color: '#5b21b6' }}>
              Consultando FINRA API pública para cada bono (3s entre consultas, ~{finraStatus?.totalBonds ? finraStatus.totalBonds * 6 : 120}s total)...
            </div>
          )}
        </div>

        {/* Manual upload */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', marginBottom: '16px' }}>Carga manual (otros)</h2>
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

function HealthCard({ label, value, detail, status }: {
  label: string;
  value: string;
  detail: string;
  status: 'good' | 'warn' | 'bad';
}) {
  const borderColor = status === 'good' ? '#10b981' : status === 'warn' ? '#f59e0b' : '#ef4444';
  const bgColor = status === 'good' ? '#f0fdf4' : status === 'warn' ? '#fffbeb' : '#fef2f2';
  const valueColor = status === 'good' ? '#059669' : status === 'warn' ? '#d97706' : '#dc2626';

  return (
    <div style={{
      background: bgColor,
      borderRadius: '12px',
      border: `2px solid ${borderColor}`,
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: '800', color: valueColor }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{detail}</div>
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
