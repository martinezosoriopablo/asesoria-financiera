/**
 * Importar datos CMF Cartola Diaria a Supabase
 *
 * Lee el archivo .txt descargado de CMF y:
 * 1. Crea fondos nuevos en fondos_mutuos (si no existen)
 * 2. Inserta valores cuota diarios en fondos_rentabilidades_diarias
 * 3. Inserta historial en fund_cuota_history (source: 'cmf_cartola')
 * 4. Actualiza fintual_funds.last_price cuando el RUN coincide
 *
 * Usage:
 *   npx tsx scripts/importar-cmf.ts
 *   npx tsx scripts/importar-cmf.ts --file data/cmf/cartola_cmf_2026-04-07.txt
 *   npx tsx scripts/importar-cmf.ts --dry-run
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import {
  leerCartolaTxt,
  getLatestCartolaFile,
  generarMetadata,
  type CMFCartolaRow,
} from '../lib/cmf-cartola'

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

function parseArgs(): { file: string | null; dryRun: boolean } {
  const args = process.argv.slice(2)
  let file: string | null = null
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      file = args[++i]
    } else if (args[i] === '--dry-run') {
      dryRun = true
    }
  }

  return { file, dryRun }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function normalizeRun(run: string): string {
  return run.replace(/\./g, '').replace(/-/g, '').toUpperCase()
}

function extractRunNumeric(run: string): number {
  // "76.XXX.XXX-K" → numeric part only (no DV)
  const cleaned = run.replace(/\./g, '').replace(/-.*$/, '')
  return parseInt(cleaned, 10)
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

// Batch an array into chunks
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

// ─── Step 1: Load existing fondos_mutuos into memory ─────────────────

interface FondoRecord {
  id: string
  fo_run: number
  fm_serie: string
  nombre_fondo: string
}

async function loadExistingFondos(): Promise<Map<string, FondoRecord>> {
  const map = new Map<string, FondoRecord>()
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('fondos_mutuos')
      .select('id, fo_run, fm_serie, nombre_fondo')
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error('Error loading fondos_mutuos:', error.message)
      break
    }
    if (!data || data.length === 0) break

    for (const row of data) {
      const key = `${row.fo_run}-${(row.fm_serie || '').toUpperCase()}`
      map.set(key, row)
    }

    offset += pageSize
    if (data.length < pageSize) break
  }

  return map
}

// ─── Step 2: Load existing fintual_funds RUN mapping ─────────────────

interface FintualFundRef {
  id: string
  fintual_id: string
  run: string
  symbol: string
}

async function loadFintualFundsRuns(): Promise<Map<string, FintualFundRef[]>> {
  const map = new Map<string, FintualFundRef[]>()
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('fintual_funds')
      .select('id, fintual_id, run, symbol')
      .not('run', 'is', null)
      .range(offset, offset + pageSize - 1)

    if (error) break
    if (!data || data.length === 0) break

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

// ─── Step 3: Group CMF rows by fondo+serie and date ──────────────────

interface GroupedData {
  runFm: number
  serie: string
  nomAdm: string
  moneda: string
  dailyPrices: Array<{ fecha: string; valorCuota: number; rentDiaria: number | null }>
}

function groupCMFData(rows: CMFCartolaRow[]): GroupedData[] {
  const groups = new Map<string, GroupedData>()

  for (const row of rows) {
    const runNum = extractRunNumeric(row.runFm)
    if (isNaN(runNum) || runNum === 0) continue

    const serie = row.serie.toUpperCase()
    const key = `${runNum}-${serie}`
    const fecha = formatDate(row.fechaInf)

    if (!groups.has(key)) {
      groups.set(key, {
        runFm: runNum,
        serie,
        nomAdm: row.nomAdm,
        moneda: row.moneda || 'CLP',
        dailyPrices: [],
      })
    }

    groups.get(key)!.dailyPrices.push({
      fecha,
      valorCuota: row.valorCuota,
      rentDiaria: null, // Will be calculated below
    })
  }

  // Sort prices by date and calculate daily returns
  for (const group of groups.values()) {
    group.dailyPrices.sort((a, b) => a.fecha.localeCompare(b.fecha))
    for (let i = 1; i < group.dailyPrices.length; i++) {
      const prev = group.dailyPrices[i - 1].valorCuota
      const curr = group.dailyPrices[i].valorCuota
      if (prev > 0) {
        group.dailyPrices[i].rentDiaria = ((curr - prev) / prev) * 100
      }
    }
  }

  return Array.from(groups.values()) as GroupedData[]
}

// ─── Step 4: Create missing fondos_mutuos ────────────────────────────

async function createMissingFondos(
  groups: GroupedData[],
  existingFondos: Map<string, FondoRecord>,
  dryRun: boolean
): Promise<{ created: number; skipped: number }> {
  const toCreate: Array<{ fo_run: number; fm_serie: string; nombre_fondo: string; nombre_agf: string; moneda_funcional: string }> = []

  for (const g of groups) {
    const key = `${g.runFm}-${g.serie}`
    if (existingFondos.has(key)) continue

    toCreate.push({
      fo_run: g.runFm,
      fm_serie: g.serie,
      nombre_fondo: `${g.nomAdm} - ${g.serie}`,
      nombre_agf: g.nomAdm,
      moneda_funcional: g.moneda,
    })
  }

  if (toCreate.length === 0) return { created: 0, skipped: groups.length }

  if (dryRun) {
    console.log(`  [DRY RUN] Crearía ${toCreate.length} fondos nuevos en fondos_mutuos`)
    return { created: 0, skipped: groups.length }
  }

  let created = 0
  for (const batch of chunk(toCreate, 500)) {
    const { data, error } = await supabase
      .from('fondos_mutuos')
      .upsert(batch, { onConflict: 'fo_run,fm_serie' })
      .select('id, fo_run, fm_serie, nombre_fondo')

    if (error) {
      console.error(`  Error creando fondos: ${error.message}`)
      continue
    }

    if (data) {
      for (const row of data) {
        const key = `${row.fo_run}-${(row.fm_serie || '').toUpperCase()}`
        existingFondos.set(key, row)
        created++
      }
    }
  }

  return { created, skipped: groups.length - toCreate.length }
}

// ─── Step 5: Upsert daily prices ─────────────────────────────────────

async function upsertDailyPrices(
  groups: GroupedData[],
  existingFondos: Map<string, FondoRecord>,
  dryRun: boolean
): Promise<{ upserted: number; errors: number }> {
  const allRows: Array<{
    fondo_id: string
    fecha: string
    valor_cuota: number
    rent_diaria: number | null
  }> = []

  for (const g of groups) {
    const key = `${g.runFm}-${g.serie}`
    const fondo = existingFondos.get(key)
    if (!fondo) continue

    for (const dp of g.dailyPrices) {
      allRows.push({
        fondo_id: fondo.id,
        fecha: dp.fecha,
        valor_cuota: dp.valorCuota,
        rent_diaria: dp.rentDiaria,
      })
    }
  }

  if (allRows.length === 0) return { upserted: 0, errors: 0 }

  if (dryRun) {
    console.log(`  [DRY RUN] Insertaría ${allRows.length} registros en fondos_rentabilidades_diarias`)
    return { upserted: 0, errors: 0 }
  }

  let upserted = 0
  let errors = 0

  for (const batch of chunk(allRows, 500)) {
    const { error } = await supabase
      .from('fondos_rentabilidades_diarias')
      .upsert(batch, { onConflict: 'fondo_id,fecha' })

    if (error) {
      console.error(`  Error upsert rentabilidades: ${error.message}`)
      errors += batch.length
    } else {
      upserted += batch.length
    }
  }

  return { upserted, errors }
}

// ─── Step 6: Upsert fund_cuota_history ───────────────────────────────

async function upsertCuotaHistory(
  groups: GroupedData[],
  existingFondos: Map<string, FondoRecord>,
  dryRun: boolean
): Promise<{ upserted: number; errors: number }> {
  const allRows: Array<{
    fondo_id: string
    fecha: string
    valor_cuota: number
    moneda: string
    source: string
  }> = []

  for (const g of groups) {
    const key = `${g.runFm}-${g.serie}`
    const fondo = existingFondos.get(key)
    if (!fondo) continue

    for (const dp of g.dailyPrices) {
      allRows.push({
        fondo_id: fondo.id,
        fecha: dp.fecha,
        valor_cuota: dp.valorCuota,
        moneda: g.moneda || 'CLP',
        source: 'cmf_cartola',
      })
    }
  }

  if (allRows.length === 0) return { upserted: 0, errors: 0 }

  if (dryRun) {
    console.log(`  [DRY RUN] Insertaría ${allRows.length} registros en fund_cuota_history`)
    return { upserted: 0, errors: 0 }
  }

  let upserted = 0
  let errors = 0

  for (const batch of chunk(allRows, 500)) {
    const { error } = await supabase
      .from('fund_cuota_history')
      .upsert(batch, { onConflict: 'fondo_id,fecha,source' })

    if (error) {
      console.error(`  Error upsert cuota_history: ${error.message}`)
      errors += batch.length
    } else {
      upserted += batch.length
    }
  }

  return { upserted, errors }
}

// ─── Step 7: Update fintual_funds.last_price ─────────────────────────

async function updateFintualFundsPrice(
  groups: GroupedData[],
  fintualRunMap: Map<string, FintualFundRef[]>,
  dryRun: boolean
): Promise<{ updated: number }> {
  let updated = 0

  for (const g of groups) {
    const runStr = String(g.runFm)
    const fintualFunds = fintualRunMap.get(runStr)
    if (!fintualFunds || fintualFunds.length === 0) continue

    // Get the most recent price for this group
    const sorted = [...g.dailyPrices].sort((a, b) => b.fecha.localeCompare(a.fecha))
    const latest = sorted[0]
    if (!latest) continue

    // Match by serie in symbol
    for (const ff of fintualFunds) {
      const symbolUpper = (ff.symbol || '').toUpperCase()
      if (symbolUpper.includes(g.serie) || fintualFunds.length === 1) {
        if (dryRun) {
          console.log(`  [DRY RUN] Actualizaría fintual_funds ${ff.fintual_id}: $${latest.valorCuota} (${latest.fecha})`)
        } else {
          const { error } = await supabase
            .from('fintual_funds')
            .update({
              last_price: latest.valorCuota,
              last_price_date: latest.fecha,
            })
            .eq('id', ff.id)

          if (!error) updated++
        }
      }
    }
  }

  return { updated }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const { file, dryRun } = parseArgs()
  const startTime = Date.now()

  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║  CMF Cartola Diaria → Supabase Importer             ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  if (dryRun) console.log('  MODO: dry-run (sin escritura)')
  console.log()

  // 1. Find and parse file
  const filepath = file || getLatestCartolaFile()
  if (!filepath) {
    console.error('No se encontró archivo CMF. Usa --file o descarga primero con:')
    console.error('  npx tsx scripts/descargar-cmf.ts')
    process.exit(1)
  }

  console.log(`Leyendo: ${filepath}`)
  const rows = leerCartolaTxt(filepath)
  const metadata = generarMetadata(rows, filepath)
  console.log(`  Registros: ${metadata.cantidadRegistros}`)
  console.log(`  Fondos:    ${metadata.cantidadFondos}`)
  console.log(`  Rango:     ${metadata.rangoInicio} → ${metadata.rangoTermino}`)
  console.log()

  // 2. Group data
  console.log('Agrupando datos por fondo+serie...')
  const groups = groupCMFData(rows)
  console.log(`  ${groups.length} combinaciones fondo-serie`)
  console.log()

  // 3. Load existing data
  console.log('Cargando fondos existentes de Supabase...')
  const existingFondos = await loadExistingFondos()
  console.log(`  ${existingFondos.size} fondos en fondos_mutuos`)

  const fintualRunMap = await loadFintualFundsRuns()
  console.log(`  ${fintualRunMap.size} RUNs en fintual_funds`)
  console.log()

  // 4. Create missing fondos
  console.log('Paso 1/4: Creando fondos nuevos...')
  const { created, skipped } = await createMissingFondos(groups, existingFondos, dryRun)
  console.log(`  Creados: ${created} | Ya existían: ${skipped}`)
  console.log()

  // 5. Upsert daily prices
  console.log('Paso 2/4: Insertando precios diarios (fondos_rentabilidades_diarias)...')
  const daily = await upsertDailyPrices(groups, existingFondos, dryRun)
  console.log(`  Upserted: ${daily.upserted} | Errores: ${daily.errors}`)
  console.log()

  // 6. Upsert cuota history
  console.log('Paso 3/4: Insertando historial cuotas (fund_cuota_history)...')
  const history = await upsertCuotaHistory(groups, existingFondos, dryRun)
  console.log(`  Upserted: ${history.upserted} | Errores: ${history.errors}`)
  console.log()

  // 7. Update fintual_funds cache
  console.log('Paso 4/4: Actualizando fintual_funds.last_price...')
  const fintual = await updateFintualFundsPrice(groups, fintualRunMap, dryRun)
  console.log(`  Actualizados: ${fintual.updated}`)
  console.log()

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Completado en ${elapsed}s`)
  console.log(`  Fondos nuevos:        ${created}`)
  console.log(`  Precios diarios:      ${daily.upserted}`)
  console.log(`  Historial cuotas:     ${history.upserted}`)
  console.log(`  fintual_funds update: ${fintual.updated}`)
  if (daily.errors + history.errors > 0) {
    console.log(`  Errores totales:      ${daily.errors + history.errors}`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
