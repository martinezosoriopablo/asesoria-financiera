/**
 * CMF Cartola Diaria Parser
 *
 * Parses the daily fund report file (.txt) published by CMF at:
 * https://www.cmfchile.cl/institucional/estadisticas/fondos_cartola_diaria.php
 *
 * The file is semicolon-separated, latin-1 encoded, and contains ALL
 * mutual funds registered in Chile with their daily quota values.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as iconv from 'iconv-lite'

// ─── Types ───────────────────────────────────────────────────────────

export interface CMFCartolaRow {
  runAdm: string
  nomAdm: string
  runFm: string
  fechaInf: Date
  activoTot: number
  moneda: string
  participesInst: number
  inversionEnFondos: number
  serie: string
  cuotasAportadas: number
  valorCuota: number
  patrimonioNeto: number
  numParticipes: number
  numParticipesInst: number
  fondoPen: string
  remFija: number
  remVariable: number
  gastosAfectos: number
  gastosNoAfectos: number
  comisionInversion: number
  comisionRescate: number
  factorAjuste: number
  factorReparto: number
}

export interface FondoInfo {
  runFm: string
  nomAdm: string
  series: string[]
  moneda: string
}

export interface RentabilidadResult {
  runFm: string
  serie: string
  periodos: {
    '1d': number | null
    '7d': number | null
    '30d': number | null
    '90d': number | null
    '365d': number | null
  }
  fechaBase: string
  valorCuotaActual: number
}

export interface CMFMetadata {
  fechaDescarga: string
  rangoInicio: string
  rangoTermino: string
  cantidadFondos: number
  cantidadRegistros: number
  archivo: string
}

// ─── Column mapping ──────────────────────────────────────────────────

const COLUMN_NAMES = [
  'RUN_ADM',
  'NOM_ADM',
  'RUN_FM',
  'FECHA_INF',
  'ACTIVO_TOT',
  'MONEDA',
  'PARTICIPES_INST',
  'INVERSION_EN_FONDOS',
  'SERIE',
  'CUOTAS_APORTADAS',
  'VALOR_CUOTA',
  'PATRIMONIO_NETO',
  'NUM_PARTICIPES',
  'NUM_PARTICIPES_INST',
  'FONDO_PEN',
  'REM_FIJA',
  'REM_VARIABLE',
  'GASTOS_AFECTOS',
  'GASTOS_NO_AFECTOS',
  'COMISION_INVERSION',
  'COMISION_RESCATE',
  'FACTOR_DE_AJUSTE',
  'FACTOR_DE_REPARTO',
] as const

// ─── Helpers ─────────────────────────────────────────────────────────

function parseNumber(val: string): number {
  if (!val || val.trim() === '') return 0
  // CMF uses comma as decimal separator in some cases
  const cleaned = val.trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseDateCMF(val: string): Date {
  const trimmed = val.trim()
  // Format: DD/MM/YYYY or DD-MM-YYYY
  const match = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]))
  }
  // Fallback: try ISO
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) {
    throw new Error(`Cannot parse date: "${trimmed}"`)
  }
  return d
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function normalizeRun(run: string): string {
  // Remove dots and dashes, keep DV (digito verificador)
  return run.trim().replace(/\./g, '').replace(/-/g, '').toUpperCase()
}

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Reads and parses a CMF cartola .txt file.
 * The file is semicolon-separated with latin-1 encoding.
 */
export function leerCartolaTxt(filepath: string): CMFCartolaRow[] {
  const absolutePath = path.resolve(filepath)
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`)
  }

  const buffer = fs.readFileSync(absolutePath)
  const content = iconv.decode(buffer, 'latin1')
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '')

  if (lines.length < 2) {
    throw new Error('File has no data rows')
  }

  // First line is the header — validate it
  const header = lines[0].split(';').map((h) => h.trim().toUpperCase())
  const valorCuotaIdx = header.indexOf('VALOR_CUOTA')
  if (valorCuotaIdx === -1) {
    // Try without underscores (some files use spaces)
    const altHeader = lines[0]
      .split(';')
      .map((h) => h.trim().toUpperCase().replace(/\s+/g, '_'))
    const altIdx = altHeader.indexOf('VALOR_CUOTA')
    if (altIdx === -1) {
      throw new Error(
        `Invalid header: VALOR_CUOTA column not found. Header: ${lines[0].substring(0, 200)}`
      )
    }
  }

  const rows: CMFCartolaRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(';')
    if (fields.length < 11) continue // skip malformed rows

    try {
      const row: CMFCartolaRow = {
        runAdm: fields[0]?.trim() ?? '',
        nomAdm: fields[1]?.trim() ?? '',
        runFm: fields[2]?.trim() ?? '',
        fechaInf: parseDateCMF(fields[3] ?? ''),
        activoTot: parseNumber(fields[4] ?? ''),
        moneda: fields[5]?.trim() ?? '',
        participesInst: parseNumber(fields[6] ?? ''),
        inversionEnFondos: parseNumber(fields[7] ?? ''),
        serie: fields[8]?.trim() ?? '',
        cuotasAportadas: parseNumber(fields[9] ?? ''),
        valorCuota: parseNumber(fields[10] ?? ''),
        patrimonioNeto: parseNumber(fields[11] ?? ''),
        numParticipes: parseNumber(fields[12] ?? ''),
        numParticipesInst: parseNumber(fields[13] ?? ''),
        fondoPen: fields[14]?.trim() ?? '',
        remFija: parseNumber(fields[15] ?? ''),
        remVariable: parseNumber(fields[16] ?? ''),
        gastosAfectos: parseNumber(fields[17] ?? ''),
        gastosNoAfectos: parseNumber(fields[18] ?? ''),
        comisionInversion: parseNumber(fields[19] ?? ''),
        comisionRescate: parseNumber(fields[20] ?? ''),
        factorAjuste: parseNumber(fields[21] ?? ''),
        factorReparto: parseNumber(fields[22] ?? ''),
      }

      // Skip rows with zero or invalid valor cuota
      if (row.valorCuota > 0) {
        rows.push(row)
      }
    } catch {
      // Skip rows that fail to parse (e.g. bad dates)
      console.warn(`CMF cartola: skipping row ${i + 1}: parse error`)
    }
  }

  console.log(`CMF cartola: parsed ${rows.length} valid rows from ${lines.length - 1} data lines`)
  return rows
}

/**
 * Filters rows by fund RUN and optionally by serie.
 * RUN comparison is normalized (no dots/dashes).
 */
export function getValorCuota(
  rows: CMFCartolaRow[],
  runFm: string,
  serie?: string
): CMFCartolaRow[] {
  const normalizedRun = normalizeRun(runFm)

  return rows.filter((row) => {
    const rowRun = normalizeRun(row.runFm)
    if (rowRun !== normalizedRun) return false
    if (serie && row.serie.toUpperCase() !== serie.toUpperCase()) return false
    return true
  })
}

/**
 * Returns a pivot table: fecha x serie with valor_cuota values
 * for a given fund RUN.
 */
export function pivotValorCuota(
  rows: CMFCartolaRow[],
  runFm: string
): { fecha: string; [serie: string]: string | number }[] {
  const filtered = getValorCuota(rows, runFm)

  // Collect all series
  const seriesSet = new Set<string>()
  filtered.forEach((r) => seriesSet.add(r.serie))
  const series = Array.from(seriesSet).sort()

  // Group by date
  const dateMap = new Map<string, Map<string, number>>()
  filtered.forEach((r) => {
    const dateStr = formatDate(r.fechaInf)
    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, new Map())
    }
    dateMap.get(dateStr)!.set(r.serie, r.valorCuota)
  })

  // Build pivot rows sorted by date
  const result: { fecha: string; [serie: string]: string | number }[] = []
  const sortedDates = Array.from(dateMap.keys()).sort()

  for (const fecha of sortedDates) {
    const row: { fecha: string; [serie: string]: string | number } = { fecha }
    const serieValues = dateMap.get(fecha)!
    for (const s of series) {
      row[s] = serieValues.get(s) ?? 0
    }
    result.push(row)
  }

  return result
}

/**
 * Returns a list of unique funds with their admin name, series, and currency.
 */
export function getTodosFondos(rows: CMFCartolaRow[]): FondoInfo[] {
  const fondoMap = new Map<
    string,
    { nomAdm: string; series: Set<string>; moneda: string }
  >()

  for (const row of rows) {
    const key = normalizeRun(row.runFm)
    if (!fondoMap.has(key)) {
      fondoMap.set(key, {
        nomAdm: row.nomAdm,
        series: new Set(),
        moneda: row.moneda,
      })
    }
    fondoMap.get(key)!.series.add(row.serie)
  }

  return Array.from(fondoMap.entries())
    .map(([runFm, info]) => ({
      runFm,
      nomAdm: info.nomAdm,
      series: Array.from(info.series).sort(),
      moneda: info.moneda,
    }))
    .sort((a, b) => a.nomAdm.localeCompare(b.nomAdm))
}

/**
 * Calculates return (rentabilidad) for a fund/serie over multiple periods.
 * Uses the most recent date available as the base date.
 */
export function calcularRentabilidad(
  rows: CMFCartolaRow[],
  runFm: string,
  serie: string,
  periodosDias: number[] = [1, 7, 30, 90, 365]
): RentabilidadResult | null {
  const filtered = getValorCuota(rows, runFm, serie)
  if (filtered.length === 0) return null

  // Sort by date descending
  const sorted = [...filtered].sort(
    (a, b) => b.fechaInf.getTime() - a.fechaInf.getTime()
  )

  const latest = sorted[0]
  const baseDate = latest.fechaInf
  const baseCuota = latest.valorCuota

  // Build date→cuota lookup
  const dateMap = new Map<string, number>()
  sorted.forEach((r) => {
    const key = formatDate(r.fechaInf)
    if (!dateMap.has(key)) {
      dateMap.set(key, r.valorCuota)
    }
  })

  // Calculate returns for each period
  const periodos: Record<string, number | null> = {}
  const periodLabels = ['1d', '7d', '30d', '90d', '365d']
  const defaultPeriodos = [1, 7, 30, 90, 365]
  const usePeriodos = periodosDias.length > 0 ? periodosDias : defaultPeriodos

  for (let i = 0; i < usePeriodos.length; i++) {
    const dias = usePeriodos[i]
    const label = periodLabels[i] ?? `${dias}d`

    // Find the closest available date to the target
    const targetDate = new Date(baseDate)
    targetDate.setDate(targetDate.getDate() - dias)

    // Search within a ±3 day window for the closest data point
    let pastCuota: number | null = null
    for (let offset = 0; offset <= 3; offset++) {
      const checkDate = new Date(targetDate)
      checkDate.setDate(checkDate.getDate() - offset)
      const val = dateMap.get(formatDate(checkDate))
      if (val) {
        pastCuota = val
        break
      }
      if (offset > 0) {
        // Check forward too
        const checkDateFwd = new Date(targetDate)
        checkDateFwd.setDate(checkDateFwd.getDate() + offset)
        const valFwd = dateMap.get(formatDate(checkDateFwd))
        if (valFwd) {
          pastCuota = valFwd
          break
        }
      }
    }

    if (pastCuota && pastCuota > 0) {
      periodos[label] = ((baseCuota - pastCuota) / pastCuota) * 100
    } else {
      periodos[label] = null
    }
  }

  return {
    runFm: normalizeRun(runFm),
    serie,
    periodos: {
      '1d': periodos['1d'] ?? null,
      '7d': periodos['7d'] ?? null,
      '30d': periodos['30d'] ?? null,
      '90d': periodos['90d'] ?? null,
      '365d': periodos['365d'] ?? null,
    },
    fechaBase: formatDate(baseDate),
    valorCuotaActual: baseCuota,
  }
}

// ─── Metadata ────────────────────────────────────────────────────────

/**
 * Generates metadata for a parsed cartola file.
 */
export function generarMetadata(
  rows: CMFCartolaRow[],
  filepath: string
): CMFMetadata {
  const dates = rows.map((r) => r.fechaInf.getTime())
  const fondos = new Set(rows.map((r) => normalizeRun(r.runFm)))

  return {
    fechaDescarga: new Date().toISOString(),
    rangoInicio: formatDate(new Date(Math.min(...dates))),
    rangoTermino: formatDate(new Date(Math.max(...dates))),
    cantidadFondos: fondos.size,
    cantidadRegistros: rows.length,
    archivo: path.basename(filepath),
  }
}

// ─── File discovery ──────────────────────────────────────────────────

/**
 * Returns the most recent CMF cartola file in data/cmf/ directory.
 */
export function getLatestCartolaFile(
  cmfDir: string = path.join(process.cwd(), 'data', 'cmf')
): string | null {
  if (!fs.existsSync(cmfDir)) return null

  const files = fs
    .readdirSync(cmfDir)
    .filter((f) => f.endsWith('.txt') || f.endsWith('.csv'))
    .map((f) => ({
      name: f,
      path: path.join(cmfDir, f),
      mtime: fs.statSync(path.join(cmfDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)

  return files.length > 0 ? files[0].path : null
}

/**
 * Loads metadata from the JSON sidecar file (if it exists).
 */
export function loadMetadata(
  cmfDir: string = path.join(process.cwd(), 'data', 'cmf')
): CMFMetadata | null {
  const metaPath = path.join(cmfDir, 'metadata.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  } catch {
    return null
  }
}
