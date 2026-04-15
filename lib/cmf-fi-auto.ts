/**
 * CMF Fondos de Inversión — Automatic scrape via HTTP + 2captcha (reCAPTCHA v2)
 *
 * Flow per fondo:
 *   1. GET entidad.php?...&pestania=7 → cookie + sitekey
 *   2. Solve reCAPTCHA v2 via 2captcha
 *   3. POST busqueda_fecha form with date range + g-recaptcha-response
 *   4. Parse HTML table of valor cuota rows
 *
 * NOTE: reCAPTCHA v2 costs ~$2.99/1000 solves via 2captcha.
 * Full sync of 152 FIRES ≈ $0.45/day.
 */

import { Solver } from '2captcha-ts'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
const CMF_BASE = 'https://www.cmfchile.cl'
const ENTITY_URL = `${CMF_BASE}/institucional/mercados/entidad.php`
const RECAPTCHA_SITEKEY = '6LfZWCgTAAAAABsPQ9DDP2jmRaNqJQOfQmP0CD9u'

export interface FIScrapeOptions {
  rut: string              // Numeric RUT, e.g. "9212"
  cmfRow: string           // CMF internal row id, e.g. "AAAw+cAAhAABP4PAAi"
  tipo: 'FIRES' | 'FINRE'
  desde: Date              // Start date (inclusive)
  hasta: Date              // End date (inclusive)
  maxRetries?: number
}

export interface FIPriceRow {
  fecha: string            // YYYY-MM-DD
  serie: string            // e.g. 'A', 'AE', 'D', 'E', 'I'
  moneda?: string | null   // '$$' (CLP), 'US$' (USD)
  valorLibro: number
  valorEconomico?: number | null
  patrimonioNeto?: number | null
  activoTotal?: number | null
  nAportantes?: number | null
  nAportantesInstitucionales?: number | null
  agencia?: string | null
}

export interface FIScrapeResult {
  success: boolean
  rows?: FIPriceRow[]
  error?: string
  captchaSolveMs?: number
  attempt?: number
}

function buildEntityUrl(rut: string, cmfRow: string, tipo: 'FIRES' | 'FINRE'): string {
  const params = new URLSearchParams({
    auth: '', send: '', mercado: 'V', rut, grupo: '',
    tipoentidad: tipo, vig: 'VI', row: cmfRow,
    control: 'svs', pestania: '7',
  })
  return `${ENTITY_URL}?${params.toString()}`
}

function parseEntityCookies(res: Response): string {
  const raw = res.headers.get('set-cookie') || ''
  // Extract individual cookie pairs (name=value)
  const pairs: string[] = []
  for (const part of raw.split(/,(?=[^ ]+=)/)) {
    const kv = part.split(';')[0].trim()
    if (kv.includes('=')) pairs.push(kv)
  }
  return pairs.join('; ')
}

async function solveRecaptcha(apiKey: string, pageUrl: string): Promise<{ token: string; ms: number }> {
  const solver = new Solver(apiKey)
  const t0 = Date.now()
  const res = await solver.recaptcha({
    pageurl: pageUrl,
    googlekey: RECAPTCHA_SITEKEY,
  })
  return { token: res.data, ms: Date.now() - t0 }
}

function htmlDecode(s: string): string {
  return s.replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

function parseNumber(s: string): number | null {
  if (!s) return null
  const clean = s.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.\-]/g, '')
  if (!clean) return null
  const n = parseFloat(clean)
  return isNaN(n) ? null : n
}

function parseFecha(s: string): string | null {
  // CMF usually returns DD/MM/YYYY
  const m = s.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/**
 * Parse the result HTML returned by CMF after a valid POST.
 * Expected columns (verified on 2026-04-10 for Moneda Deuda Chile):
 *   Fecha | Serie | Moneda | Valor Libro | Valor Económico | Patrimonio Neto |
 *   Activo Total | N° de Aportantes | N° Aportantes Institucionales | Agencia
 * One row per (serie, fecha). Multiple series per fondo.
 */
export function parseFIResultHtml(html: string): FIPriceRow[] {
  const rows: FIPriceRow[] = []

  const tableMatches = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)]
  for (const t of tableMatches) {
    const tableHtml = t[1]
    const trs = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    if (trs.length < 2) continue

    // Headers: first tr with th or td cells
    const headerCells = [...trs[0][1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map(m => htmlDecode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().toLowerCase())

    // Must look like the FI result table
    if (!headerCells.some(h => /valor.*libro|valor.*econ/.test(h))) continue

    const find = (re: RegExp) => headerCells.findIndex(h => re.test(h))
    const iFecha = find(/fecha/)
    const iSerie = find(/^serie$|^serie\b/)
    const iMoneda = find(/moneda/)
    const iVLibro = find(/valor.*libro/)
    const iVEcon = find(/valor.*econ/)
    const iPatN = find(/patrimonio.*neto/)
    const iActT = find(/activo.*total/)
    const iNApo = find(/n.*aportantes$|n.*de.*aportantes(?!.*inst)/)
    const iNApoI = find(/n.*aportantes.*inst/)
    const iAgencia = find(/agencia/)

    if (iFecha < 0 || iVLibro < 0) continue

    for (let i = 1; i < trs.length; i++) {
      const tds = [...trs[i][1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map(m => htmlDecode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
      if (tds.length <= Math.max(iFecha, iVLibro)) continue

      const fecha = parseFecha(tds[iFecha])
      const valorLibro = parseNumber(tds[iVLibro])
      if (!fecha || valorLibro === null) continue

      rows.push({
        fecha,
        serie: iSerie >= 0 ? (tds[iSerie] || '') : '',
        moneda: iMoneda >= 0 ? (tds[iMoneda] || null) : null,
        valorLibro,
        valorEconomico: iVEcon >= 0 ? parseNumber(tds[iVEcon]) : null,
        patrimonioNeto: iPatN >= 0 ? parseNumber(tds[iPatN]) : null,
        activoTotal: iActT >= 0 ? parseNumber(tds[iActT]) : null,
        nAportantes: iNApo >= 0 ? parseNumber(tds[iNApo]) : null,
        nAportantesInstitucionales: iNApoI >= 0 ? parseNumber(tds[iNApoI]) : null,
        agencia: iAgencia >= 0 ? (tds[iAgencia] || null) : null,
      })
    }
    break
  }

  return rows
}

async function attemptScrape(apiKey: string, opts: FIScrapeOptions): Promise<FIScrapeResult> {
  const pageUrl = buildEntityUrl(opts.rut, opts.cmfRow, opts.tipo)

  // 1. GET entity page
  const getRes = await fetch(pageUrl, { headers: { 'User-Agent': UA } })
  if (!getRes.ok) {
    return { success: false, error: `GET entity ${getRes.status}` }
  }
  const cookie = parseEntityCookies(getRes)
  const html = await getRes.text()

  // Sanity check sitekey
  if (!html.includes(RECAPTCHA_SITEKEY)) {
    return { success: false, error: 'sitekey not found in page' }
  }

  // 2. Solve reCAPTCHA
  const { token, ms } = await solveRecaptcha(apiKey, pageUrl)

  // 3. POST form — date values must be zero-padded to match CMF <option value="01"> format
  // The `enviado=1` hidden field is required for server-side submit detection
  const pad = (n: number) => String(n).padStart(2, '0')
  const body = new URLSearchParams({
    enviado: '1',
    dia1: pad(opts.desde.getDate()),
    mes1: pad(opts.desde.getMonth() + 1),
    anio1: String(opts.desde.getFullYear()),
    dia2: pad(opts.hasta.getDate()),
    mes2: pad(opts.hasta.getMonth() + 1),
    anio2: String(opts.hasta.getFullYear()),
    'g-recaptcha-response': token,
    sub_consulta_fi: 'Consultar',
  })

  const postRes = await fetch(pageUrl, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'Referer': pageUrl,
    },
    body: body.toString(),
  })

  if (!postRes.ok) {
    return { success: false, error: `POST ${postRes.status}`, captchaSolveMs: ms }
  }

  const resultHtml = await postRes.text()

  // Debug dump (controlled by env var to avoid bloat in prod)
  if (process.env.CMF_FI_DEBUG_DUMP) {
    try {
      const fs = await import('fs')
      const path = `data/cmf/fi-debug-${opts.rut}-${Date.now()}.html`
      fs.writeFileSync(path, resultHtml)
      console.log(`  [debug] saved ${path} (${resultHtml.length} bytes)`)
    } catch {}
  }

  // Detect common error strings
  if (/captcha.*inv[áa]lid|recaptcha.*fall/i.test(resultHtml)) {
    return { success: false, error: 'captcha rejected', captchaSolveMs: ms }
  }
  if (/sin informaci[óo]n|no.*registra.*informaci[óo]n/i.test(resultHtml)) {
    return { success: true, rows: [], captchaSolveMs: ms }
  }

  const rows = parseFIResultHtml(resultHtml)
  return { success: true, rows, captchaSolveMs: ms }
}

export async function scrapeFIPrices(opts: FIScrapeOptions): Promise<FIScrapeResult> {
  const apiKey = process.env.TWOCAPTCHA_API_KEY
  if (!apiKey) return { success: false, error: 'TWOCAPTCHA_API_KEY no configurada' }

  const maxRetries = opts.maxRetries ?? 2
  let lastErr = 'unknown'

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await attemptScrape(apiKey, opts)
      if (res.success) { res.attempt = attempt; return res }
      lastErr = res.error || 'unknown'
      if (/captcha rejected/.test(lastErr) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      return { ...res, attempt }
    } catch (e: any) {
      lastErr = e?.message || String(e)
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 3000))
    }
  }

  return { success: false, error: `Falló después de ${maxRetries} intentos: ${lastErr}` }
}
