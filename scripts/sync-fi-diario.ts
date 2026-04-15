/**
 * Daily sync of all 152 FIRES fondos de inversión.
 *
 *   npx tsx scripts/sync-fi-diario.ts                    # Full run (152 funds)
 *   npx tsx scripts/sync-fi-diario.ts --limit 3          # Test run (first 3 active funds)
 *   npx tsx scripts/sync-fi-diario.ts --rut 9212         # Single fund
 *   npx tsx scripts/sync-fi-diario.ts --days 30          # Custom date range (default 7)
 *   npx tsx scripts/sync-fi-diario.ts --continue-on-error
 *
 * Cost: ~$2.99/1000 reCAPTCHA v2 solves → ~$0.45 for 152 funds.
 * Rate: ~40s per fund (captcha solve dominated) → ~100 min for full sync.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()
import { createClient } from '@supabase/supabase-js'
import { scrapeFIPrices } from '../lib/cmf-fi-auto'
import { importFIRows } from '../lib/cmf-fi-import'

interface Args {
  limit?: number
  rut?: string
  days: number
  continueOnError: boolean
}

function parseArgs(): Args {
  const args: Args = { days: 7, continueOnError: false }
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--limit') args.limit = parseInt(a[++i], 10)
    else if (a[i] === '--rut') args.rut = a[++i]
    else if (a[i] === '--days') args.days = parseInt(a[++i], 10)
    else if (a[i] === '--continue-on-error') args.continueOnError = true
  }
  return args
}

function fmt(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60}s`
}

async function main() {
  const args = parseArgs()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Date range
  const hasta = new Date()
  const desde = new Date()
  desde.setDate(desde.getDate() - args.days)

  // Fetch target fondos from catalog
  let query = supabase
    .from('fondos_inversion')
    .select('id, rut, nombre, cmf_row, tipo')
    .eq('tipo', 'FIRES')
    .eq('activo', true)
    .order('nombre')

  if (args.rut) query = query.eq('rut', args.rut)
  const { data: fondos, error } = await query
  if (error || !fondos) {
    console.error('Error fetching catalog:', error?.message)
    process.exit(1)
  }

  const targets = args.limit ? fondos.slice(0, args.limit) : fondos
  console.log(`CMF FI sync: ${targets.length} fondos | rango ${desde.toISOString().slice(0, 10)} → ${hasta.toISOString().slice(0, 10)}`)
  console.log(`Costo estimado 2captcha: ~$${(targets.length * 0.00299).toFixed(3)}`)
  console.log('')

  const t0 = Date.now()
  const stats = {
    ok: 0,
    empty: 0,
    failed: 0,
    totalRows: 0,
    totalCaptchaMs: 0,
  }
  const failures: Array<{ rut: string; nombre: string; error: string }> = []

  for (let i = 0; i < targets.length; i++) {
    const f = targets[i]
    const prefix = `[${i + 1}/${targets.length}]`
    process.stdout.write(`${prefix} ${f.rut.padEnd(5)} ${f.nombre.slice(0, 55).padEnd(55)} `)

    const tFund = Date.now()
    try {
      const scrapeRes = await scrapeFIPrices({
        rut: f.rut,
        cmfRow: f.cmf_row,
        tipo: 'FIRES',
        desde,
        hasta,
        maxRetries: 2,
      })

      if (!scrapeRes.success) {
        stats.failed++
        failures.push({ rut: f.rut, nombre: f.nombre, error: scrapeRes.error || 'unknown' })
        console.log(`FAIL ${scrapeRes.error}`)
        await supabase
          .from('fondos_inversion')
          .update({ ultimo_sync: new Date().toISOString(), ultimo_sync_ok: false, ultimo_sync_error: scrapeRes.error })
          .eq('id', f.id)
        if (!args.continueOnError) break
        continue
      }

      stats.totalCaptchaMs += scrapeRes.captchaSolveMs || 0
      const rows = scrapeRes.rows || []

      const importRes = await importFIRows(f.rut, rows, supabase)
      if (importRes.error) {
        stats.failed++
        failures.push({ rut: f.rut, nombre: f.nombre, error: importRes.error })
        console.log(`IMPORT_FAIL ${importRes.error}`)
        if (!args.continueOnError) break
        continue
      }

      if (rows.length === 0) {
        stats.empty++
        console.log(`(empty) ${fmt(Date.now() - tFund)}`)
      } else {
        stats.ok++
        stats.totalRows += importRes.rowsUpserted
        console.log(`OK ${importRes.rowsUpserted} rows, ${importRes.seriesDetected.length} series, ${fmt(Date.now() - tFund)}`)
      }
    } catch (e: any) {
      stats.failed++
      const msg = e?.message || String(e)
      failures.push({ rut: f.rut, nombre: f.nombre, error: msg })
      console.log(`ERROR ${msg}`)
      if (!args.continueOnError) break
    }

    // Small pause between funds (courtesy to CMF + reduces rate limits)
    if (i < targets.length - 1) {
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  const totalMs = Date.now() - t0
  console.log('')
  console.log(`=== Resumen (${fmt(totalMs)}) ===`)
  console.log(`  OK:         ${stats.ok}`)
  console.log(`  Empty:      ${stats.empty}`)
  console.log(`  Failed:     ${stats.failed}`)
  console.log(`  Total rows: ${stats.totalRows}`)
  console.log(`  Captcha avg: ${stats.ok + stats.empty > 0 ? Math.round(stats.totalCaptchaMs / (stats.ok + stats.empty)) : 0}ms`)

  if (failures.length) {
    console.log('\n=== Failures ===')
    failures.forEach(f => console.log(`  ${f.rut}  ${f.nombre.slice(0, 50)}  ${f.error}`))
  }

  process.exit(stats.failed > 0 && !args.continueOnError ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
