/**
 * Persistence layer for CMF Fondos de Inversión scraped data.
 * Takes FIPriceRow[] from the scraper and upserts into fondos_inversion_precios.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { FIPriceRow } from './cmf-fi-auto'

export interface FIImportResult {
  fondoRut: string
  fondoId: string | null
  rowsParsed: number
  rowsUpserted: number
  seriesDetected: string[]
  error?: string
}

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE env vars')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Upsert scraped rows for a single fondo (identified by rut).
 * Computes rent_diaria from previous day's valor_libro per serie.
 */
export async function importFIRows(
  rut: string,
  rows: FIPriceRow[],
  client?: SupabaseClient
): Promise<FIImportResult> {
  const supabase = client ?? getClient()
  const result: FIImportResult = {
    fondoRut: rut,
    fondoId: null,
    rowsParsed: rows.length,
    rowsUpserted: 0,
    seriesDetected: [],
  }

  // 1. Look up fondo_id
  const { data: fondo, error: lookupErr } = await supabase
    .from('fondos_inversion')
    .select('id, series_detectadas')
    .eq('rut', rut)
    .maybeSingle()

  if (lookupErr || !fondo) {
    result.error = `Fondo rut=${rut} not in catalog: ${lookupErr?.message || 'not found'}`
    return result
  }

  result.fondoId = fondo.id

  if (rows.length === 0) {
    // Still mark sync OK if no rows (e.g., weekend / holiday)
    await supabase
      .from('fondos_inversion')
      .update({ ultimo_sync: new Date().toISOString(), ultimo_sync_ok: true, ultimo_sync_error: null })
      .eq('id', fondo.id)
    return result
  }

  // 2. Detect all series and update catalog
  const seriesSet = new Set(rows.map(r => r.serie).filter(Boolean))
  result.seriesDetected = [...seriesSet].sort()

  // Merge with existing
  const existingSeries = new Set((fondo.series_detectadas as string[] | null) || [])
  for (const s of seriesSet) existingSeries.add(s)
  const mergedSeries = [...existingSeries].sort()

  // 3. Compute rent_diaria: fetch previous valor_libro per serie from DB (if any)
  // We fetch the most recent existing row per serie that's strictly before min(rows.fecha)
  const minFecha = rows.reduce((m, r) => (r.fecha < m ? r.fecha : m), rows[0].fecha)
  const { data: prevPrices } = await supabase
    .from('fondos_inversion_precios')
    .select('serie, fecha, valor_libro')
    .eq('fondo_id', fondo.id)
    .lt('fecha', minFecha)
    .order('fecha', { ascending: false })

  const prevBySerie = new Map<string, number>()
  if (prevPrices) {
    for (const p of prevPrices) {
      if (!prevBySerie.has(p.serie)) {
        prevBySerie.set(p.serie, Number(p.valor_libro))
      }
    }
  }

  // Sort rows by (serie, fecha asc) so we can compute daily returns in order
  const sorted = [...rows].sort((a, b) => {
    if (a.serie !== b.serie) return a.serie.localeCompare(b.serie)
    return a.fecha.localeCompare(b.fecha)
  })

  const dbRows = sorted.map(r => {
    const prev = prevBySerie.get(r.serie)
    let rent: number | null = null
    if (prev != null && prev > 0) {
      rent = ((r.valorLibro - prev) / prev) * 100
    }
    prevBySerie.set(r.serie, r.valorLibro) // update for next iteration
    return {
      fondo_id: fondo.id,
      serie: r.serie,
      fecha: r.fecha,
      moneda: r.moneda ?? null,
      valor_libro: r.valorLibro,
      valor_economico: r.valorEconomico ?? null,
      patrimonio_neto: r.patrimonioNeto ?? null,
      activo_total: r.activoTotal ?? null,
      n_aportantes: r.nAportantes ?? null,
      n_aportantes_institucionales: r.nAportantesInstitucionales ?? null,
      agencia: r.agencia ?? null,
      rent_diaria: rent,
    }
  })

  // 4. Upsert in batches
  const batchSize = 200
  for (let i = 0; i < dbRows.length; i += batchSize) {
    const batch = dbRows.slice(i, i + batchSize)
    const { error } = await supabase
      .from('fondos_inversion_precios')
      .upsert(batch, { onConflict: 'fondo_id,serie,fecha' })
    if (error) {
      result.error = `Upsert error: ${error.message}`
      // Mark sync failed
      await supabase
        .from('fondos_inversion')
        .update({
          ultimo_sync: new Date().toISOString(),
          ultimo_sync_ok: false,
          ultimo_sync_error: error.message,
        })
        .eq('id', fondo.id)
      return result
    }
    result.rowsUpserted += batch.length
  }

  // 5. Update catalog: series_detectadas + sync metadata
  await supabase
    .from('fondos_inversion')
    .update({
      series_detectadas: mergedSeries,
      ultimo_sync: new Date().toISOString(),
      ultimo_sync_ok: true,
      ultimo_sync_error: null,
    })
    .eq('id', fondo.id)

  return result
}
