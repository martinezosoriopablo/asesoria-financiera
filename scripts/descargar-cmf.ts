/**
 * CMF Cartola Diaria Downloader
 *
 * Opens a browser window for the user to manually solve the captcha,
 * then downloads the fund data file and saves it to data/cmf/.
 *
 * Usage:
 *   npx tsx scripts/descargar-cmf.ts
 *   npx tsx scripts/descargar-cmf.ts --inicio 01/03/2026 --termino 31/03/2026
 *   npx tsx scripts/descargar-cmf.ts --run 1234 (specific fund RUN)
 */

import puppeteer from 'puppeteer'
import * as fs from 'fs'
import * as path from 'path'
import { leerCartolaTxt, generarMetadata } from '../lib/cmf-cartola'

// ─── Config ──────────────────────────────────────────────────────────

const CMF_URL =
  'https://www.cmfchile.cl/institucional/estadisticas/fondos_cartola_diaria.php'
const DATA_DIR = path.join(process.cwd(), 'data', 'cmf')
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes to solve captcha + download

// ─── CLI args ────────────────────────────────────────────────────────

function parseArgs(): { inicio: string; termino: string; run: string } {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '')
    const val = args[i + 1]
    if (key && val) parsed[key] = val
  }

  // Default: last 30 days
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  function formatDDMMYYYY(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  return {
    inicio: parsed.inicio ?? formatDDMMYYYY(thirtyDaysAgo),
    termino: parsed.termino ?? formatDDMMYYYY(now),
    run: parsed.run ?? '',
  }
}

// ─── Watch for downloaded file ───────────────────────────────────────

async function waitForDownload(
  downloadDir: string,
  timeoutMs: number
): Promise<string | null> {
  const startFiles = new Set(fs.readdirSync(downloadDir))
  const start = Date.now()

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const currentFiles = fs.readdirSync(downloadDir)
      const newFiles = currentFiles.filter(
        (f) =>
          !startFiles.has(f) &&
          !f.endsWith('.crdownload') &&
          !f.endsWith('.tmp') &&
          !f.endsWith('.part')
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
    }, 1000)
  })
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const { inicio, termino, run } = parseArgs()

  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║  CMF Cartola Diaria - Descargador                   ║')
  console.log('╠══════════════════════════════════════════════════════╣')
  console.log(`║  Rango: ${inicio} → ${termino}`)
  console.log(`║  RUN fondo: ${run || '(todos)'}`)
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log()

  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true })

  // Create a temp download directory
  const tmpDownloadDir = path.join(DATA_DIR, '.download-tmp')
  fs.mkdirSync(tmpDownloadDir, { recursive: true })

  console.log('Abriendo navegador...')
  const browser = await puppeteer.launch({
    headless: false, // User needs to see and solve captcha
    defaultViewport: { width: 1200, height: 800 },
    args: ['--no-sandbox'],
  })

  const page = await browser.newPage()

  // Configure download behavior
  const cdpSession = await page.createCDPSession()
  await cdpSession.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: tmpDownloadDir,
  })

  try {
    console.log('Navegando a CMF...')
    await page.goto(CMF_URL, { waitUntil: 'networkidle2', timeout: 30000 })

    // Fill in the date fields
    console.log('Pre-llenando fechas...')

    // Clear and type start date
    await page.evaluate((val: string) => {
      const el = document.querySelector<HTMLInputElement>('#txt_inicio')
      if (el) {
        el.value = val
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, inicio)

    // Clear and type end date
    await page.evaluate((val: string) => {
      const el = document.querySelector<HTMLInputElement>('#txt_termino')
      if (el) {
        el.value = val
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, termino)

    // Fill fund RUN if specified
    if (run) {
      await page.evaluate((val: string) => {
        const el = document.querySelector<HTMLInputElement>('#ffmm')
        if (el) {
          el.value = val
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, run)
    }

    console.log()
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  Por favor resuelve el CAPTCHA en el navegador')
    console.log('  y haz clic en "GENERAR ARCHIVO".')
    console.log('  Esperando descarga...')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log()

    // Wait for the file to appear
    const downloadedFile = await waitForDownload(
      tmpDownloadDir,
      DOWNLOAD_TIMEOUT_MS
    )

    if (!downloadedFile) {
      console.error(
        'Timeout: no se detectó ninguna descarga en 5 minutos.'
      )
      process.exit(1)
    }

    console.log(`Archivo descargado: ${path.basename(downloadedFile)}`)

    // Move to final location with a timestamped name
    const timestamp = new Date().toISOString().split('T')[0]
    const finalName = `cartola_cmf_${timestamp}.txt`
    const finalPath = path.join(DATA_DIR, finalName)

    fs.renameSync(downloadedFile, finalPath)
    console.log(`Movido a: ${finalPath}`)

    // Parse and generate metadata
    console.log('Parseando archivo...')
    try {
      const rows = leerCartolaTxt(finalPath)
      const metadata = generarMetadata(rows, finalPath)

      const metadataPath = path.join(DATA_DIR, 'metadata.json')
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

      console.log()
      console.log('Metadata:')
      console.log(`  Rango:     ${metadata.rangoInicio} → ${metadata.rangoTermino}`)
      console.log(`  Fondos:    ${metadata.cantidadFondos}`)
      console.log(`  Registros: ${metadata.cantidadRegistros}`)
      console.log(`  Archivo:   ${metadata.archivo}`)
    } catch (err) {
      console.warn('No se pudo parsear el archivo descargado:', err)
      console.warn('El archivo fue guardado de todas formas en:', finalPath)
    }

    // Cleanup temp dir
    try {
      fs.rmdirSync(tmpDownloadDir)
    } catch {
      // ignore if not empty
    }

    console.log()
    console.log('Listo.')
  } catch (err) {
    console.error('Error:', err)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
