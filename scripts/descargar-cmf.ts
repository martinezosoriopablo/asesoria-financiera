/**
 * CMF Cartola Diaria - Descargador Semi-Automático
 *
 * Abre navegador, llena formulario automáticamente, usuario solo resuelve el CAPTCHA.
 * Detecta la descarga automáticamente y opcionalmente importa a Supabase.
 *
 * Usage:
 *   npx tsx scripts/descargar-cmf.ts                                    # hoy
 *   npx tsx scripts/descargar-cmf.ts --inicio 01/04/2026 --termino 07/04/2026
 *   npx tsx scripts/descargar-cmf.ts --dias 7                           # últimos 7 días
 *   npx tsx scripts/descargar-cmf.ts --importar                         # descarga + importa a Supabase
 *
 * Después de descargar, importar con:
 *   npx tsx scripts/importar-cmf.ts
 */

import puppeteer from 'puppeteer'
import * as fs from 'fs'
import * as path from 'path'
import { leerCartolaTxt, generarMetadata } from '../lib/cmf-cartola'

// ─── Config ──────────────────────────────────────────────────────────

const CMF_URL = 'https://www.cmfchile.cl/institucional/estadisticas/fondos_cartola_diaria.php'
const DATA_DIR = path.join(process.cwd(), 'data', 'cmf')

// ─── CLI args ────────────────────────────────────────────────────────

interface CliArgs {
  inicio: string
  termino: string
  run: string
  importar: boolean
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}
  let importar = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--importar') { importar = true; continue }
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

  if (parsed.dias) {
    const dias = parseInt(parsed.dias, 10)
    const desde = new Date(now.getTime() - dias * 24 * 60 * 60 * 1000)
    return { inicio: formatDDMMYYYY(desde), termino: formatDDMMYYYY(now), run: parsed.run ?? '', importar }
  }

  return {
    inicio: parsed.inicio ?? formatDDMMYYYY(now),
    termino: parsed.termino ?? formatDDMMYYYY(now),
    run: parsed.run ?? '',
    importar,
  }
}

// ─── Watch for downloaded file ───────────────────────────────────────

async function waitForDownload(downloadDir: string, timeoutMs: number): Promise<string | null> {
  const startFiles = new Set(fs.readdirSync(downloadDir))
  const start = Date.now()

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const currentFiles = fs.readdirSync(downloadDir)
      const newFiles = currentFiles.filter(
        (f) => !startFiles.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp') && !f.endsWith('.part')
      )
      if (newFiles.length > 0) {
        clearInterval(interval)
        resolve(path.join(downloadDir, newFiles[0]))
        return
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        resolve(null)
      }
    }, 500)
  })
}

// ─── Main download flow ─────────────────────────────────────────────

async function download(inicio: string, termino: string, run: string): Promise<string | null> {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmpDir = path.join(DATA_DIR, '.download-tmp')
  fs.mkdirSync(tmpDir, { recursive: true })

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1200, height: 800 },
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    const cdp = await page.createCDPSession()
    await cdp.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: path.resolve(tmpDir),
    })

    await page.goto(CMF_URL, { waitUntil: 'networkidle2', timeout: 30000 })

    // Auto-fill form fields
    await page.evaluate((vals: { inicio: string; termino: string; run: string }) => {
      const elInicio = document.querySelector<HTMLInputElement>('#txt_inicio')
      if (elInicio) { elInicio.value = vals.inicio; elInicio.dispatchEvent(new Event('change', { bubbles: true })) }

      const elTermino = document.querySelector<HTMLInputElement>('#txt_termino')
      if (elTermino) { elTermino.value = vals.termino; elTermino.dispatchEvent(new Event('change', { bubbles: true })) }

      if (vals.run) {
        const elRun = document.querySelector<HTMLInputElement>('#ffmm')
        if (elRun) elRun.value = vals.run
      }
    }, { inicio, termino, run })

    // Focus captcha input so user can type immediately
    await page.focus('#captcha').catch(() => {})

    console.log()
    console.log('  ┌─────────────────────────────────────────────────────┐')
    console.log('  │  Formulario llenado automáticamente.                │')
    console.log('  │                                                     │')
    console.log('  │  → Escribe el CAPTCHA y haz clic en GENERAR ARCHIVO │')
    console.log('  │  → La descarga se detectará automáticamente         │')
    console.log('  └─────────────────────────────────────────────────────┘')
    console.log()

    // Wait for download (5 min timeout)
    const downloaded = await waitForDownload(tmpDir, 5 * 60 * 1000)

    if (!downloaded) {
      console.error('  Timeout: no se detectó descarga en 5 minutos')
      return null
    }

    // Move to final location
    const timestamp = new Date().toISOString().split('T')[0]
    const finalPath = path.join(DATA_DIR, `cartola_cmf_${timestamp}.txt`)
    fs.renameSync(downloaded, finalPath)
    try { fs.rmdirSync(tmpDir) } catch { /* ok */ }

    return finalPath
  } finally {
    await browser.close()
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const { inicio, termino, run, importar } = parseArgs()

  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  CMF Cartola Diaria - Descarga                             ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`  Rango:    ${inicio} → ${termino}`)
  console.log(`  RUN:      ${run || '(todos)'}`)
  console.log(`  Importar: ${importar ? 'Sí' : 'No'}`)

  const filePath = await download(inicio, termino, run)

  if (!filePath) {
    console.error('\nNo se pudo descargar la cartola CMF.')
    process.exit(1)
  }

  console.log(`\nArchivo descargado: ${filePath}`)

  // Parse and show metadata
  try {
    const rows = leerCartolaTxt(filePath)
    const metadata = generarMetadata(rows, filePath)
    fs.writeFileSync(path.join(DATA_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2))

    console.log(`  Registros: ${metadata.cantidadRegistros}`)
    console.log(`  Fondos:    ${metadata.cantidadFondos}`)
    console.log(`  Rango:     ${metadata.rangoInicio} → ${metadata.rangoTermino}`)
  } catch (err) {
    console.warn('Error parseando:', err instanceof Error ? err.message : err)
  }

  // Auto-import
  if (importar) {
    console.log('\nImportando a Supabase...')
    const { execSync } = await import('child_process')
    try {
      execSync(`npx tsx scripts/importar-cmf.ts --file "${filePath}"`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      })
    } catch {
      console.error('Error en importación. Ejecutar manualmente:')
      console.error(`  npx tsx scripts/importar-cmf.ts --file "${filePath}"`)
    }
  } else {
    console.log(`\nPara importar: npx tsx scripts/importar-cmf.ts --file "${filePath}"`)
  }
}

main()
