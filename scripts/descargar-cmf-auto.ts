/**
 * CMF Cartola Diaria — Descarga 100% automática
 *
 * Usa HTTP + 2captcha (sin Puppeteer). Funciona en local, VPS o servidor.
 *
 * Usage:
 *   npx tsx scripts/descargar-cmf-auto.ts                    # ayer
 *   npx tsx scripts/descargar-cmf-auto.ts --dias 7           # últimos 7 días
 *   npx tsx scripts/descargar-cmf-auto.ts --inicio 01/04/2026 --termino 07/04/2026
 *   npx tsx scripts/descargar-cmf-auto.ts --no-importar      # solo descargar, no importar
 *   npx tsx scripts/descargar-cmf-auto.ts --cron             # modo cron (skip weekends, telegram)
 *
 * Requiere en .env.local:
 *   TWOCAPTCHA_API_KEY=...
 *   SUPABASE_SERVICE_ROLE_KEY=... (para importar)
 *   TELEGRAM_BOT_TOKEN=... (opcional, para notificaciones)
 *   TELEGRAM_CHAT_ID=... (opcional)
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { downloadCMFCartola } from '../lib/cmf-auto'
import { importCMFRows, parseCMFContent } from '../lib/cmf-import'
import { sendTelegram } from '../lib/telegram'

// ─── Config ─────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data', 'cmf')

// ─── CLI args ───────────────────────────────────────────────────────

interface CliArgs {
  inicio: string
  termino: string
  run: string
  importar: boolean
  cron: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}
  let importar = true
  let cron = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-importar') { importar = false; continue }
    if (args[i] === '--cron') { cron = true; continue }
    const key = args[i]?.replace(/^--/, '')
    const val = args[i + 1]
    if (key && val && !val.startsWith('--')) {
      parsed[key] = val
      i++
    }
  }

  function formatDDMMYYYY(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  const now = new Date()

  // Default: yesterday (today's data may not be available yet)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  if (parsed.dias) {
    const dias = parseInt(parsed.dias, 10)
    const desde = new Date(now.getTime() - dias * 24 * 60 * 60 * 1000)
    return { inicio: formatDDMMYYYY(desde), termino: formatDDMMYYYY(now), run: parsed.run ?? '', importar, cron }
  }

  return {
    inicio: parsed.inicio ?? formatDDMMYYYY(yesterday),
    termino: parsed.termino ?? formatDDMMYYYY(yesterday),
    run: parsed.run ?? '',
    importar,
    cron,
  }
}

// parseCMFContent is now imported from lib/cmf-import

// ─── Weekend / holiday check ────────────────────────────────────────

function isBusinessDay(date: Date): boolean {
  const day = date.getDay()
  if (day === 0 || day === 6) return false // Weekend

  // Chilean public holidays 2026 (fixed dates)
  const holidays2026 = [
    '2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01',
    '2026-05-21', '2026-06-29', '2026-07-16', '2026-08-15',
    '2026-09-18', '2026-09-19', '2026-10-12', '2026-11-01',
    '2026-12-08', '2026-12-25',
  ]
  const dateStr = date.toISOString().split('T')[0]
  return !holidays2026.includes(dateStr)
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const { inicio, termino, run, importar, cron } = parseArgs()
  const startTime = Date.now()

  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  CMF Cartola Diaria — Descarga Automática (2captcha)       ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`  Rango:    ${inicio} → ${termino}`)
  console.log(`  RUN:      ${run || '(todos)'}`)
  console.log(`  Importar: ${importar ? 'Sí' : 'No'}`)
  console.log(`  Modo:     ${cron ? 'Cron' : 'Manual'}`)
  console.log()

  // In cron mode, skip non-business days
  if (cron) {
    const now = new Date()
    // Check if yesterday was a business day
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    if (!isBusinessDay(yesterday)) {
      console.log('  Ayer no fue día hábil. Saltando.')
      return
    }
  }

  // Check env
  if (!process.env.TWOCAPTCHA_API_KEY) {
    console.error('ERROR: TWOCAPTCHA_API_KEY no configurada en .env.local')
    process.exit(1)
  }

  // Step 1: Download
  console.log('Descargando cartola CMF...')
  const result = await downloadCMFCartola({ inicio, termino, run })

  if (!result.success || !result.content) {
    const errorMsg = `CMF auto-sync falló: ${result.error}`
    console.error(errorMsg)

    if (cron) {
      await sendTelegram(`❌ <b>CMF Auto-Sync Falló</b>\n\n${result.error}\nRango: ${inicio} → ${termino}`)
    }

    process.exit(1)
  }

  console.log(`\nDescarga exitosa (${(result.captchaSolveMs || 0) / 1000}s captcha, intento ${result.attempt})`)

  // Step 2: Save file
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const filePath = path.join(DATA_DIR, result.filename || 'cartola_cmf.txt')
  fs.writeFileSync(filePath, result.content, 'latin1')
  console.log(`Archivo: ${filePath}`)

  // Step 3: Parse
  const rows = parseCMFContent(result.content)
  const fondos = new Set(rows.map(r => `${r.runFm}-${r.serie}`)).size
  console.log(`  Registros: ${rows.length}`)
  console.log(`  Fondos:    ${fondos}`)

  if (rows.length === 0) {
    const errorMsg = 'CMF auto-sync: archivo descargado pero sin registros válidos'
    console.error(errorMsg)
    if (cron) await sendTelegram(`⚠️ <b>CMF Auto-Sync</b>\n\n${errorMsg}`)
    process.exit(1)
  }

  // Step 4: Import to Supabase
  if (importar) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
      process.exit(1)
    }

    console.log('\nImportando a Supabase...')
    const supabase = createClient(supabaseUrl, supabaseKey)
    const importResult = await importCMFRows(supabase, rows)

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log()
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  Completado en ${elapsed}s`)
    console.log(`  Fondos nuevos:     ${importResult.fondosCreated}`)
    console.log(`  Precios diarios:   ${importResult.dailyPricesUpserted}`)
    console.log(`  Historial cuotas:  ${importResult.historyUpserted}`)
    console.log(`  Fintual updated:   ${importResult.fintualUpdated}`)
    if (importResult.errors > 0) {
      console.log(`  Errores:           ${importResult.errors}`)
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Telegram success notification
    if (cron) {
      await sendTelegram(
        `✅ <b>CMF Auto-Sync OK</b>\n\n` +
        `📅 ${inicio} → ${termino}\n` +
        `📊 ${importResult.dailyPricesUpserted} precios, ${fondos} fondos\n` +
        `🆕 ${importResult.fondosCreated} fondos nuevos\n` +
        `⏱ ${elapsed}s (captcha: ${((result.captchaSolveMs || 0) / 1000).toFixed(1)}s)`
      )
    }
  } else {
    console.log(`\nPara importar: npx tsx scripts/importar-cmf.ts --file "${filePath}"`)
  }
}

main().catch(async (err) => {
  console.error('Error fatal:', err)
  await sendTelegram(`❌ <b>CMF Auto-Sync Error Fatal</b>\n\n${err?.message || err}`).catch(() => {})
  process.exit(1)
})
