/**
 * CMF Cartola Import Logic (reusable by API route and CLI script)
 *
 * Parses CMF cartola rows and imports to Supabase:
 * 1. Creates missing fondos in fondos_mutuos
 * 2. Upserts daily prices in fondos_rentabilidades_diarias
 * 3. Upserts history in fund_cuota_history (source: 'cmf_cartola')
 * 4. Updates fintual_funds.last_price when RUN matches
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// Minimal fields needed from CMF cartola rows
export interface CMFImportRow {
  runFm: string
  serie: string
  nomAdm: string
  moneda: string
  fechaInf: Date
  valorCuota: number
}

// ─── Types ──────────────────────────────────────────────────────────

export interface ImportResult {
  fondosCreated: number
  fondosExisting: number
  dailyPricesUpserted: number
  historyUpserted: number
  fintualUpdated: number
  errors: number
  totalGroups: number
}

interface FondoRecord {
  id: string
  fo_run: number
  fm_serie: string
  nombre_fondo: string
}

interface FintualFundRef {
  id: string
  fintual_id: string
  run: string
  symbol: string
}

interface GroupedData {
  runFm: number
  serie: string
  nomAdm: string
  moneda: string
  dailyPrices: Array<{ fecha: string; valorCuota: number; rentDiaria: number | null }>
}

// ─── Helpers ────────────────────────────────────────────────────────

function extractRunNumeric(run: string): number {
  const cleaned = run.replace(/\./g, '').replace(/-.*$/, '')
  return parseInt(cleaned, 10)
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

// ─── Core import function ───────────────────────────────────────────

export async function importCMFRows(
  supabase: SupabaseClient,
  rows: CMFImportRow[]
): Promise<ImportResult> {
  const result: ImportResult = {
    fondosCreated: 0,
    fondosExisting: 0,
    dailyPricesUpserted: 0,
    historyUpserted: 0,
    fintualUpdated: 0,
    errors: 0,
    totalGroups: 0,
  }

  // 1. Group CMF data by fondo+serie
  const groups = groupCMFData(rows)
  result.totalGroups = groups.length

  // 2. Load existing fondos
  const existingFondos = await loadExistingFondos(supabase)

  // 3. Create missing fondos
  const toCreate: Array<{ fo_run: number; fm_serie: string; nombre_fondo: string; nombre_agf: string; moneda_funcional: string }> = []
  for (const g of groups) {
    const key = `${g.runFm}-${g.serie}`
    if (!existingFondos.has(key)) {
      toCreate.push({
        fo_run: g.runFm,
        fm_serie: g.serie,
        nombre_fondo: `${g.nomAdm} - ${g.serie}`,
        nombre_agf: g.nomAdm,
        moneda_funcional: g.moneda,
      })
    }
  }

  if (toCreate.length > 0) {
    for (const batch of chunk(toCreate, 500)) {
      const { data, error } = await supabase
        .from('fondos_mutuos')
        .upsert(batch, { onConflict: 'fo_run,fm_serie' })
        .select('id, fo_run, fm_serie, nombre_fondo')

      if (error) {
        result.errors++
        continue
      }
      if (data) {
        for (const row of data) {
          const key = `${row.fo_run}-${(row.fm_serie || '').toUpperCase()}`
          existingFondos.set(key, row)
          result.fondosCreated++
        }
      }
    }
  }
  result.fondosExisting = groups.length - toCreate.length

  // 4. Upsert daily prices (fondos_rentabilidades_diarias)
  const dailyRows: Array<{ fondo_id: string; fecha: string; valor_cuota: number; rent_diaria: number | null }> = []
  for (const g of groups) {
    const fondo = existingFondos.get(`${g.runFm}-${g.serie}`)
    if (!fondo) continue
    for (const dp of g.dailyPrices) {
      dailyRows.push({ fondo_id: fondo.id, fecha: dp.fecha, valor_cuota: dp.valorCuota, rent_diaria: dp.rentDiaria })
    }
  }

  for (const batch of chunk(dailyRows, 500)) {
    const { error } = await supabase
      .from('fondos_rentabilidades_diarias')
      .upsert(batch, { onConflict: 'fondo_id,fecha' })
    if (error) result.errors += batch.length
    else result.dailyPricesUpserted += batch.length
  }

  // 5. Upsert fund_cuota_history
  const historyRows: Array<{ fondo_id: string; fecha: string; valor_cuota: number; moneda: string; source: string }> = []
  for (const g of groups) {
    const fondo = existingFondos.get(`${g.runFm}-${g.serie}`)
    if (!fondo) continue
    for (const dp of g.dailyPrices) {
      historyRows.push({ fondo_id: fondo.id, fecha: dp.fecha, valor_cuota: dp.valorCuota, moneda: g.moneda || 'CLP', source: 'cmf_cartola' })
    }
  }

  for (const batch of chunk(historyRows, 500)) {
    const { error } = await supabase
      .from('fund_cuota_history')
      .upsert(batch, { onConflict: 'fondo_id,fecha,source' })
    if (error) result.errors += batch.length
    else result.historyUpserted += batch.length
  }

  // 6. Update fintual_funds.last_price (batched)
  const fintualRunMap = await loadFintualFundsRuns(supabase)
  const fintualUpdates: Array<{ id: string; last_price: number; last_price_date: string }> = []

  for (const g of groups) {
    const fintualFunds = fintualRunMap.get(String(g.runFm))
    if (!fintualFunds?.length) continue

    const sorted = [...g.dailyPrices].sort((a, b) => b.fecha.localeCompare(a.fecha))
    const latest = sorted[0]
    if (!latest) continue

    for (const ff of fintualFunds) {
      const symbolUpper = (ff.symbol || '').toUpperCase()
      if (symbolUpper.includes(g.serie) || fintualFunds.length === 1) {
        fintualUpdates.push({ id: ff.id, last_price: latest.valorCuota, last_price_date: latest.fecha })
      }
    }
  }

  // Batch update fintual_funds using Promise.all with concurrency limit
  const CONCURRENT = 10
  for (let i = 0; i < fintualUpdates.length; i += CONCURRENT) {
    const batch = fintualUpdates.slice(i, i + CONCURRENT)
    const results = await Promise.all(
      batch.map(u =>
        supabase.from('fintual_funds').update({ last_price: u.last_price, last_price_date: u.last_price_date }).eq('id', u.id)
      )
    )
    for (const r of results) {
      if (!r.error) result.fintualUpdated++
    }
  }

  return result
}

// ─── CMF content parser (header-based column mapping) ───────────

/**
 * Parse CMF cartola content using the header row to find columns.
 * Works with any column order — no hardcoded positions.
 *
 * Known CMF header:
 * RUN_ADM;NOM_ADM;RUN_FM;FECHA_INF;ACTIVO_TOT;MONEDA;PARTICIPES_INST;INVERSION_EN_FONDOS;SERIE;...;VALOR_CUOTA;...
 */
export function parseCMFContent(content: string): CMFImportRow[] {
  const lines = content.split(/\r?\n/)
  if (lines.length < 2) return []

  // Find header line
  let headerIdx = -1
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const upper = lines[i].toUpperCase()
    if (upper.includes('RUN_FM') || upper.includes('RUN_ADM')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) {
    // No header — fall back to legacy fixed-position parser
    return parseCMFContentLegacy(content)
  }

  const headers = lines[headerIdx].split(';').map(h => h.trim().toUpperCase())
  const col = (name: string) => headers.indexOf(name)

  const iRunFm = col('RUN_FM')
  const iFecha = col('FECHA_INF')
  const iNomAdm = col('NOM_ADM')
  const iSerie = col('SERIE')
  const iMoneda = col('MONEDA')
  const iValorCuota = col('VALOR_CUOTA')

  if (iRunFm === -1 || iFecha === -1 || iSerie === -1 || iValorCuota === -1) {
    console.warn('CMF parser: missing required columns. Headers:', headers.join(';'))
    return parseCMFContentLegacy(content)
  }

  const rows: CMFImportRow[] = []

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = lines[i].split(';')
    if (parts.length <= Math.max(iRunFm, iFecha, iSerie, iValorCuota)) continue

    const runFm = parts[iRunFm].trim()
    const fechaStr = parts[iFecha].trim()
    const nomAdm = iNomAdm >= 0 ? parts[iNomAdm].trim() : ''
    const serie = parts[iSerie].trim()
    const moneda = iMoneda >= 0 ? parts[iMoneda].trim() : '$'
    const valorCuota = parseFloat(parts[iValorCuota].replace(/,/g, '.').trim())

    if (!runFm || !serie || isNaN(valorCuota) || valorCuota <= 0) continue

    const fecha = parseCMFDate(fechaStr)
    if (!fecha) continue

    rows.push({ runFm, serie, nomAdm, moneda, fechaInf: fecha, valorCuota })
  }

  return rows
}

function parseCMFDate(s: string): Date | null {
  let d: Date
  if (s.includes('/')) {
    const [dd, mm, yyyy] = s.split('/')
    d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd))
  } else if (/^\d{8}$/.test(s)) {
    // YYYYMMDD format
    d = new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8)))
  } else {
    d = new Date(s)
  }
  return isNaN(d.getTime()) ? null : d
}

/** Legacy fixed-position parser for files without a recognizable header */
function parseCMFContentLegacy(content: string): CMFImportRow[] {
  const lines = content.split(/\r?\n/)
  const rows: CMFImportRow[] = []

  for (const line of lines) {
    const parts = line.split(';')
    if (parts.length < 6) continue

    const first = parts[0].trim()
    if (first === 'RUN_FM' || first === 'RUN' || first.startsWith('Fecha') || first === 'RUN_ADM') continue

    const runFm = parts[0].trim()
    const fechaStr = parts[1].trim()
    const nomAdm = parts[2].trim()
    const serie = parts[3].trim()
    const moneda = parts[4].trim()
    const valorCuota = parseFloat(parts[5].replace(/,/g, '.').trim())

    if (!runFm || !serie || isNaN(valorCuota) || valorCuota <= 0) continue

    const fecha = parseCMFDate(fechaStr)
    if (!fecha) continue

    rows.push({ runFm, serie, nomAdm, moneda, fechaInf: fecha, valorCuota })
  }

  return rows
}

// ─── Internal helpers ───────────────────────────────────────────────

function groupCMFData(rows: CMFImportRow[]): GroupedData[] {
  const groups = new Map<string, GroupedData>()

  for (const row of rows) {
    const runNum = extractRunNumeric(row.runFm)
    if (isNaN(runNum) || runNum === 0) continue

    const serie = row.serie.toUpperCase()
    const key = `${runNum}-${serie}`
    const fecha = formatDate(row.fechaInf)

    if (!groups.has(key)) {
      groups.set(key, { runFm: runNum, serie, nomAdm: row.nomAdm, moneda: row.moneda || 'CLP', dailyPrices: [] })
    }

    groups.get(key)!.dailyPrices.push({ fecha, valorCuota: row.valorCuota, rentDiaria: null })
  }

  // Calculate daily returns
  for (const group of Array.from(groups.values())) {
    group.dailyPrices.sort((a, b) => a.fecha.localeCompare(b.fecha))
    for (let i = 1; i < group.dailyPrices.length; i++) {
      const prev = group.dailyPrices[i - 1].valorCuota
      const curr = group.dailyPrices[i].valorCuota
      if (prev > 0) group.dailyPrices[i].rentDiaria = ((curr - prev) / prev) * 100
    }
  }

  return Array.from(groups.values())
}

async function loadExistingFondos(supabase: SupabaseClient): Promise<Map<string, FondoRecord>> {
  const map = new Map<string, FondoRecord>()
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('fondos_mutuos')
      .select('id, fo_run, fm_serie, nombre_fondo')
      .range(offset, offset + pageSize - 1)

    if (error || !data?.length) break
    for (const row of data) {
      map.set(`${row.fo_run}-${(row.fm_serie || '').toUpperCase()}`, row)
    }
    offset += pageSize
    if (data.length < pageSize) break
  }

  return map
}

async function loadFintualFundsRuns(supabase: SupabaseClient): Promise<Map<string, FintualFundRef[]>> {
  const map = new Map<string, FintualFundRef[]>()
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('fintual_funds')
      .select('id, fintual_id, run, symbol')
      .not('run', 'is', null)
      .range(offset, offset + pageSize - 1)

    if (error || !data?.length) break
    for (const row of data) {
      if (!row.run) continue
      const cleanRun = row.run.replace(/-[\dkK]$/i, '').trim()
      if (!map.has(cleanRun)) map.set(cleanRun, [])
      map.get(cleanRun)!.push(row)
    }
    offset += pageSize
    if (data.length < pageSize) break
  }

  return map
}
