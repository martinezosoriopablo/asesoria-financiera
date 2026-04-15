/**
 * Auditoría de precios: AAFM vs CMF
 *
 * Compara los valores cuota de ambas fuentes regulatorias para detectar:
 * - Discrepancias en precios
 * - Fondos que solo aparecen en una fuente
 * - Cobertura de cada fuente
 * - Recomendación de fuente más confiable
 *
 * Usage:
 *   npx tsx scripts/audit-prices.ts
 *   npx tsx scripts/audit-prices.ts --fecha 2026-04-07
 *   npx tsx scripts/audit-prices.ts --fecha 2026-04-07 --show-all
 *   npx tsx scripts/audit-prices.ts --range 2026-04-01 2026-04-07
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

// ─── Env ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Faltan variables de entorno en .env.local:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL')
  console.error('  SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── CLI args ────────────────────────────────────────────────────────

interface CliArgs {
  fecha: string | null
  rangeStart: string | null
  rangeEnd: string | null
  showAll: boolean
  threshold: number
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  let fecha: string | null = null
  let rangeStart: string | null = null
  let rangeEnd: string | null = null
  let showAll = false
  let threshold = 0.01

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fecha' && args[i + 1]) {
      fecha = args[++i]
    } else if (args[i] === '--range' && args[i + 1] && args[i + 2]) {
      rangeStart = args[++i]
      rangeEnd = args[++i]
    } else if (args[i] === '--show-all') {
      showAll = true
    } else if (args[i] === '--threshold' && args[i + 1]) {
      threshold = parseFloat(args[++i])
    }
  }

  return { fecha, rangeStart, rangeEnd, showAll, threshold }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function pad(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length)
}

function padNum(num: number, decimals: number = 4, width: number = 14): string {
  const s = num.toFixed(decimals)
  return s.length >= width ? s : ' '.repeat(width - s.length) + s
}

function colorStatus(status: string): string {
  switch (status) {
    case 'ok': return '\x1b[32m OK \x1b[0m'
    case 'warning': return '\x1b[33mWARN\x1b[0m'
    case 'error': return '\x1b[31m ERR\x1b[0m'
    default: return status
  }
}

// ─── Core audit for a single date ───────────────────────────────────

interface AuditResult {
  fecha: string
  matched: number
  soloAAFM: number
  soloCMF: number
  ok: number
  warnings: number
  errors: number
  maxDiffPct: number
  avgDiffPct: number
  details: Array<{
    foRun: number
    serie: string
    nombreFondo: string
    nombreAgf: string
    aafmCuota: number
    cmfCuota: number
    diffPct: number
    status: string
  }>
  onlyAAFM: Array<{ foRun: number; serie: string; nombre: string; cuota: number }>
  onlyCMF: Array<{ foRun: number; serie: string; nombre: string; cuota: number }>
}

async function auditDate(fecha: string): Promise<AuditResult> {
  // Fetch AAFM cuota history
  const { data: aafmRaw } = await supabase
    .from('fund_cuota_history')
    .select('fondo_id, valor_cuota, moneda')
    .eq('source', 'aafm_direct')
    .eq('fecha', fecha)
    .limit(5000)

  // Fetch CMF cuota history
  const { data: cmfRaw } = await supabase
    .from('fund_cuota_history')
    .select('fondo_id, valor_cuota, moneda')
    .eq('source', 'cmf_cartola')
    .eq('fecha', fecha)
    .limit(5000)

  // Also check fondos_rentabilidades_diarias as secondary CMF source
  const { data: dailyRaw } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fondo_id, valor_cuota')
    .eq('fecha', fecha)
    .limit(5000)

  const aafmMap = new Map<string, number>()
  for (const r of aafmRaw || []) {
    aafmMap.set(r.fondo_id, r.valor_cuota)
  }

  const cmfMap = new Map<string, number>()
  for (const r of cmfRaw || []) {
    cmfMap.set(r.fondo_id, r.valor_cuota)
  }

  // Use daily prices as CMF fallback for fondos not in cmf history
  if (dailyRaw) {
    for (const r of dailyRaw) {
      if (!cmfMap.has(r.fondo_id) && aafmMap.has(r.fondo_id)) {
        cmfMap.set(r.fondo_id, r.valor_cuota)
      }
    }
  }

  // Load fondos metadata
  const allIds = new Set([...aafmMap.keys(), ...cmfMap.keys()])
  const fondoMeta = new Map<string, { fo_run: number; fm_serie: string; nombre_fondo: string; nombre_agf: string }>()

  const idArr = Array.from(allIds)
  for (let i = 0; i < idArr.length; i += 100) {
    const batch = idArr.slice(i, i + 100)
    const { data } = await supabase
      .from('fondos_mutuos')
      .select('id, fo_run, fm_serie, nombre_fondo, nombre_agf')
      .in('id', batch)

    if (data) {
      for (const m of data) {
        fondoMeta.set(m.id, {
          fo_run: m.fo_run,
          fm_serie: m.fm_serie || '',
          nombre_fondo: m.nombre_fondo || '',
          nombre_agf: m.nombre_agf || '',
        })
      }
    }
  }

  // Compare
  const details: AuditResult['details'] = []
  const onlyAAFM: AuditResult['onlyAAFM'] = []
  const onlyCMF: AuditResult['onlyCMF'] = []

  for (const fondoId of allIds) {
    const meta = fondoMeta.get(fondoId)
    const aafm = aafmMap.get(fondoId)
    const cmf = cmfMap.get(fondoId)

    if (aafm !== undefined && cmf !== undefined) {
      const diff = Math.abs(aafm - cmf)
      const avg = (aafm + cmf) / 2
      const diffPct = avg > 0 ? (diff / avg) * 100 : 0

      let status = 'ok'
      if (diffPct > 0.1) status = 'error'
      else if (diffPct > 0.01) status = 'warning'

      details.push({
        foRun: meta?.fo_run || 0,
        serie: meta?.fm_serie || '',
        nombreFondo: meta?.nombre_fondo || '',
        nombreAgf: meta?.nombre_agf || '',
        aafmCuota: aafm,
        cmfCuota: cmf,
        diffPct,
        status,
      })
    } else if (aafm !== undefined) {
      onlyAAFM.push({
        foRun: meta?.fo_run || 0,
        serie: meta?.fm_serie || '',
        nombre: meta?.nombre_fondo || '',
        cuota: aafm,
      })
    } else if (cmf !== undefined) {
      onlyCMF.push({
        foRun: meta?.fo_run || 0,
        serie: meta?.fm_serie || '',
        nombre: meta?.nombre_fondo || '',
        cuota: cmf,
      })
    }
  }

  // Sort: errors first
  details.sort((a, b) => {
    const order: Record<string, number> = { error: 0, warning: 1, ok: 2 }
    return (order[a.status] || 2) - (order[b.status] || 2) || b.diffPct - a.diffPct
  })

  const diffs = details.map((d) => d.diffPct)

  return {
    fecha,
    matched: details.length,
    soloAAFM: onlyAAFM.length,
    soloCMF: onlyCMF.length,
    ok: details.filter((d) => d.status === 'ok').length,
    warnings: details.filter((d) => d.status === 'warning').length,
    errors: details.filter((d) => d.status === 'error').length,
    maxDiffPct: diffs.length > 0 ? Math.max(...diffs) : 0,
    avgDiffPct: diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0,
    details,
    onlyAAFM,
    onlyCMF,
  }
}

// ─── Display ─────────────────────────────────────────────────────────

function printAuditResult(result: AuditResult, showAll: boolean, threshold: number) {
  console.log()
  console.log(`\x1b[1m══════════════════════════════════════════════════════════════════\x1b[0m`)
  console.log(`\x1b[1m  AUDITORÍA DE PRECIOS: ${result.fecha}\x1b[0m`)
  console.log(`\x1b[1m══════════════════════════════════════════════════════════════════\x1b[0m`)
  console.log()

  // Summary box
  console.log(`  Fondos con ambas fuentes:  \x1b[1m${result.matched}\x1b[0m`)
  console.log(`  Solo AAFM:                 ${result.soloAAFM}`)
  console.log(`  Solo CMF:                  ${result.soloCMF}`)
  console.log()
  console.log(`  ✓ Coincidencias exactas:   \x1b[32m${result.ok}\x1b[0m`)
  console.log(`  △ Advertencias (>${threshold}%):   \x1b[33m${result.warnings}\x1b[0m`)
  console.log(`  ✗ Errores (>0.1%):         \x1b[31m${result.errors}\x1b[0m`)
  console.log()
  console.log(`  Diferencia máxima:         ${result.maxDiffPct.toFixed(6)}%`)
  console.log(`  Diferencia promedio:       ${result.avgDiffPct.toFixed(6)}%`)
  console.log()

  // Recommendation
  if (result.matched > 0) {
    if (result.errors === 0 && result.warnings === 0) {
      console.log(`  \x1b[32m✓ RESULTADO: Ambas fuentes son 100% consistentes.\x1b[0m`)
      console.log(`    → AAFM recomendada como fuente principal (incluye rentabilidades pre-calculadas)`)
      console.log(`    → CMF como fuente de validación/backup`)
    } else if (result.errors === 0) {
      console.log(`  \x1b[33m△ RESULTADO: Diferencias menores detectadas.\x1b[0m`)
      console.log(`    → Ambas fuentes confiables. AAFM preferida por rentabilidades.`)
    } else {
      console.log(`  \x1b[31m✗ RESULTADO: Discrepancias significativas en ${result.errors} fondos.\x1b[0m`)
      console.log(`    → Revisar fondos con status ERR antes de confiar en precios.`)
    }
  } else {
    console.log(`  \x1b[33m? No hay fondos con datos en ambas fuentes para comparar.\x1b[0m`)
  }
  console.log()

  // Detail table — show discrepancies (or all if --show-all)
  const toShow = showAll
    ? result.details
    : result.details.filter((d) => d.status !== 'ok')

  if (toShow.length > 0) {
    console.log(`\x1b[1m  DETALLE DE COMPARACIÓN${showAll ? '' : ' (solo discrepancias)'}:\x1b[0m`)
    console.log(`  ${'─'.repeat(110)}`)
    console.log(
      `  ${pad('RUN', 7)} ${pad('SERIE', 7)} ${pad('AGF', 15)} ${pad('FONDO', 30)} ${padNum(0, 0, 14).replace(/./g, ' ').substring(0, 4)}AAFM CUOTA ${padNum(0, 0, 14).replace(/./g, ' ').substring(0, 5)}CMF CUOTA     DIFF%  ST`
    )
    console.log(`  ${'─'.repeat(110)}`)

    for (const d of toShow.slice(0, 100)) {
      console.log(
        `  ${pad(String(d.foRun), 7)} ${pad(d.serie, 7)} ${pad(d.nombreAgf.substring(0, 15), 15)} ${pad(d.nombreFondo.substring(0, 30), 30)} ${padNum(d.aafmCuota)} ${padNum(d.cmfCuota)} ${padNum(d.diffPct, 6, 10)} ${colorStatus(d.status)}`
      )
    }

    if (toShow.length > 100) {
      console.log(`  ... y ${toShow.length - 100} más`)
    }
    console.log()
  }

  // Fondos solo en una fuente
  if (result.onlyAAFM.length > 0) {
    console.log(`\x1b[1m  FONDOS SOLO EN AAFM (${result.onlyAAFM.length}):\x1b[0m`)
    for (const f of result.onlyAAFM.slice(0, 20)) {
      console.log(`    RUN ${pad(String(f.foRun), 7)} ${pad(f.serie, 7)} ${pad(f.nombre.substring(0, 40), 40)} $${f.cuota.toFixed(4)}`)
    }
    if (result.onlyAAFM.length > 20) console.log(`    ... y ${result.onlyAAFM.length - 20} más`)
    console.log()
  }

  if (result.onlyCMF.length > 0) {
    console.log(`\x1b[1m  FONDOS SOLO EN CMF (${result.onlyCMF.length}):\x1b[0m`)
    for (const f of result.onlyCMF.slice(0, 20)) {
      console.log(`    RUN ${pad(String(f.foRun), 7)} ${pad(f.serie, 7)} ${pad(f.nombre.substring(0, 40), 40)} $${f.cuota.toFixed(4)}`)
    }
    if (result.onlyCMF.length > 20) console.log(`    ... y ${result.onlyCMF.length - 20} más`)
    console.log()
  }
}

// ─── Freshness audit: which source has the most recent data? ─────────

async function auditFreshness() {
  console.log()
  console.log(`\x1b[1m  ANÁLISIS DE FRESCURA DE DATOS:\x1b[0m`)
  console.log(`  ${'─'.repeat(60)}`)

  // Latest AAFM date
  const { data: latestAAFM } = await supabase
    .from('fund_cuota_history')
    .select('fecha')
    .eq('source', 'aafm_direct')
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  // Latest CMF date
  const { data: latestCMF } = await supabase
    .from('fund_cuota_history')
    .select('fecha')
    .eq('source', 'cmf_cartola')
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  // Latest daily price
  const { data: latestDaily } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  // Latest Fintual API
  const { data: latestFintual } = await supabase
    .from('fintual_prices')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  // Count records per source
  const { count: aafmCount } = await supabase
    .from('fund_cuota_history')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'aafm_direct')

  const { count: cmfCount } = await supabase
    .from('fund_cuota_history')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'cmf_cartola')

  const today = new Date().toISOString().split('T')[0]

  console.log(`  Fuente                Último dato    Registros   Días atrás`)
  console.log(`  ${'─'.repeat(60)}`)

  const sources = [
    { name: 'AAFM (cuota_history)', date: latestAAFM?.fecha, count: aafmCount },
    { name: 'CMF (cuota_history)', date: latestCMF?.fecha, count: cmfCount },
    { name: 'Rent. diarias', date: latestDaily?.fecha, count: null },
    { name: 'Fintual API', date: latestFintual?.date, count: null },
  ]

  for (const s of sources) {
    const dateStr = s.date || 'N/A'
    const daysAgo = s.date
      ? Math.round((new Date(today).getTime() - new Date(s.date).getTime()) / (1000 * 60 * 60 * 24))
      : '?'
    const countStr = s.count !== null ? String(s.count) : '-'
    const fresh = typeof daysAgo === 'number' && daysAgo <= 3 ? '\x1b[32m✓\x1b[0m' : typeof daysAgo === 'number' && daysAgo <= 7 ? '\x1b[33m△\x1b[0m' : '\x1b[31m✗\x1b[0m'
    console.log(`  ${pad(s.name, 24)} ${pad(dateStr, 14)} ${pad(countStr, 11)} ${daysAgo} ${fresh}`)
  }

  console.log()

  // Recommendation
  const aafmDate = latestAAFM?.fecha || ''
  const cmfDate = latestCMF?.fecha || ''

  if (aafmDate >= cmfDate) {
    console.log(`  \x1b[32m→ AAFM tiene datos más recientes o iguales que CMF.\x1b[0m`)
    console.log(`    Usar AAFM como fuente principal para rentabilidades de cartolas y portfolios.`)
  } else {
    console.log(`  \x1b[33m→ CMF tiene datos más recientes que AAFM.\x1b[0m`)
    console.log(`    Considerar sincronizar AAFM. CMF puede usarse como fuente temporal.`)
  }
  console.log()
}

// ─── Portfolio impact: which client holdings depend on each source ───

async function auditPortfolioImpact() {
  console.log()
  console.log(`\x1b[1m  IMPACTO EN PORTFOLIOS DE CLIENTES:\x1b[0m`)
  console.log(`  ${'─'.repeat(60)}`)

  // Get recent snapshots with their source info
  const { data: snapshots } = await supabase
    .from('portfolio_snapshots')
    .select('id, client_id, snapshot_date, holdings')
    .order('snapshot_date', { ascending: false })
    .limit(50)

  if (!snapshots || snapshots.length === 0) {
    console.log('  No hay snapshots recientes para analizar.')
    return
  }

  // Count source usage across snapshots
  const sourceCounts: Record<string, number> = {}
  let totalHoldings = 0

  for (const snap of snapshots) {
    if (!snap.holdings || !Array.isArray(snap.holdings)) continue
    for (const h of snap.holdings as Array<{ source?: string }>) {
      const src = h.source || 'unknown'
      sourceCounts[src] = (sourceCounts[src] || 0) + 1
      totalHoldings++
    }
  }

  if (totalHoldings === 0) {
    console.log('  No hay holdings con info de fuente en los snapshots.')
    return
  }

  console.log(`  Fuente de precios en últimos ${snapshots.length} snapshots:`)
  console.log(`  ${'─'.repeat(40)}`)

  const sorted = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])
  for (const [source, count] of sorted) {
    const pct = ((count / totalHoldings) * 100).toFixed(1)
    console.log(`    ${pad(source, 20)} ${count} holdings (${pct}%)`)
  }
  console.log(`    ${'─'.repeat(36)}`)
  console.log(`    ${pad('TOTAL', 20)} ${totalHoldings}`)
  console.log()
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const { fecha, rangeStart, rangeEnd, showAll, threshold } = parseArgs()

  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║  AUDITORÍA DE PRECIOS: AAFM vs CMF                              ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')

  // Freshness analysis always runs
  await auditFreshness()

  if (rangeStart && rangeEnd) {
    // Range mode: compact summary for each date
    console.log(`\x1b[1m  RANGO: ${rangeStart} → ${rangeEnd}\x1b[0m`)
    console.log(`  ${'─'.repeat(80)}`)
    console.log(`  ${pad('FECHA', 12)} ${pad('MATCHED', 9)} ${pad('OK', 6)} ${pad('WARN', 6)} ${pad('ERR', 6)} ${pad('MAX DIFF%', 12)} ${pad('AVG DIFF%', 12)} ${pad('AAFM', 6)} ${pad('CMF', 6)}`)
    console.log(`  ${'─'.repeat(80)}`)

    const start = new Date(rangeStart)
    const end = new Date(rangeEnd)
    const current = new Date(start)

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]
      const result = await auditDate(dateStr)

      if (result.matched > 0 || result.soloAAFM > 0 || result.soloCMF > 0) {
        const errColor = result.errors > 0 ? '\x1b[31m' : '\x1b[0m'
        console.log(
          `  ${pad(dateStr, 12)} ${pad(String(result.matched), 9)} ${pad(String(result.ok), 6)} ${pad(String(result.warnings), 6)} ${errColor}${pad(String(result.errors), 6)}\x1b[0m ${pad(result.maxDiffPct.toFixed(6), 12)} ${pad(result.avgDiffPct.toFixed(6), 12)} ${pad(String(result.soloAAFM), 6)} ${pad(String(result.soloCMF), 6)}`
        )
      }

      current.setDate(current.getDate() + 1)
    }
    console.log()
  } else {
    // Single date mode
    let targetDate = fecha

    if (!targetDate) {
      // Find most recent date with AAFM data
      const { data } = await supabase
        .from('fund_cuota_history')
        .select('fecha')
        .eq('source', 'aafm_direct')
        .order('fecha', { ascending: false })
        .limit(1)
        .single()

      targetDate = data?.fecha || new Date().toISOString().split('T')[0]
    }

    const result = await auditDate(targetDate)
    printAuditResult(result, showAll, threshold)
  }

  // Portfolio impact
  await auditPortfolioImpact()

  // Final recommendation
  console.log(`\x1b[1m═══════════════════════════════════════════════════════════════════\x1b[0m`)
  console.log(`\x1b[1m  RECOMENDACIÓN FINAL:\x1b[0m`)
  console.log()
  console.log(`  1. \x1b[1mCMF Cartola Diaria como fuente PRINCIPAL\x1b[0m de valor cuota:`)
  console.log(`     - Cubre TODOS los fondos mutuos registrados en Chile (2500+)`)
  console.log(`     - Fuente regulatoria oficial de la CMF`)
  console.log(`     - AAFM solo cubre ~1000 fondos (40% del universo)`)
  console.log(`     - Importar con: npx tsx scripts/importar-cmf.ts`)
  console.log()
  console.log(`  2. \x1b[1mAAFM como fuente de RENTABILIDADES pre-calculadas\x1b[0m:`)
  console.log(`     - Incluye rent 7d, 30d, 90d, YTD, 1Y directamente`)
  console.log(`     - Útil para dashboard de mercado y comparación de fondos`)
  console.log(`     - Complementa CMF (que solo trae valor cuota diario)`)
  console.log()
  console.log(`  3. \x1b[1mFintual API solo para datos HISTÓRICOS\x1b[0m:`)
  console.log(`     - No tiene datos actualizados`)
  console.log(`     - Útil para backfill de precios antiguos`)
  console.log()
  console.log(`  PRIORIDAD DE FUENTES para current-prices:`)
  console.log(`     fondos_rentabilidades_diarias (CMF+AAFM) → Fintual DB cache → Snapshot`)
  console.log(`\x1b[1m═══════════════════════════════════════════════════════════════════\x1b[0m`)
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
