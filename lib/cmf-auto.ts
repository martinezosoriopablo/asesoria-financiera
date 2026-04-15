/**
 * CMF Cartola Diaria — Automatic download via HTTP + 2captcha
 *
 * No Puppeteer needed. Uses plain fetch with session cookies:
 * 1. GET page → extract PHPSESSID cookie
 * 2. GET captcha image → send to 2captcha
 * 3. POST validate captcha → sets session flag
 * 4. POST form → download .txt file
 *
 * Works on Vercel serverless, local, or VPS.
 */

import { Solver } from '2captcha-ts'

// ─── Types ──────────────────────────────────────────────────────���───

export interface CMFDownloadOptions {
  inicio: string  // DD/MM/YYYY
  termino: string // DD/MM/YYYY
  run?: string    // Optional: filter by fund RUN
  maxRetries?: number
}

export interface CMFDownloadResult {
  success: boolean
  content?: string       // Raw file content (latin-1 decoded)
  filename?: string
  captchaSolveMs?: number
  error?: string
  attempt?: number
}

// ─── Constants ──────────────────────────────────────────────────────

const CMF_BASE = 'https://www.cmfchile.cl'
const CMF_PAGE = `${CMF_BASE}/institucional/estadisticas/fondos_cartola_diaria.php`
const CAPTCHA_IMAGE = `${CMF_BASE}/sitio/biblioteca/captcha2/captcha.php`
const CAPTCHA_VALIDATE = `${CMF_BASE}/sitio/biblioteca/captcha2/captcha.php`
const CMF_DOWNLOAD = `${CMF_BASE}/institucional/estadisticas/cfm_download.php`

// ─── Core download function ─────────────────────────────────────────

export async function downloadCMFCartola(options: CMFDownloadOptions): Promise<CMFDownloadResult> {
  const apiKey = process.env.TWOCAPTCHA_API_KEY
  if (!apiKey) {
    return { success: false, error: 'TWOCAPTCHA_API_KEY no configurada' }
  }

  const maxRetries = options.maxRetries ?? 3

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`  Intento ${attempt}/${maxRetries}...`)

    try {
      const result = await attemptDownload(apiKey, options)
      if (result.success) {
        result.attempt = attempt
        return result
      }

      console.warn(`  Intento ${attempt} falló: ${result.error}`)

      // Don't retry if CMF simply has no data for the date range
      if (result.error?.includes('Sin información') || result.error?.includes('no tiene datos')) {
        return result
      }

      // Wait before retry (except last attempt)
      if (attempt < maxRetries) {
        console.log('  Esperando 5s antes de reintentar...')
        await sleep(5000)
      }
    } catch (err: any) {
      const msg = err?.cause?.code || err?.code || err?.message || String(err)
      console.error(`  Intento ${attempt} error: ${msg}`)
    }
  }

  return { success: false, error: `Falló después de ${maxRetries} intentos` }
}

// ─── Single download attempt ────────────────────────────────────────

async function attemptDownload(
  apiKey: string,
  options: CMFDownloadOptions
): Promise<CMFDownloadResult> {

  // Step 1: Visit page to establish PHP session
  console.log('  [1/5] Estableciendo sesión PHP...')
  const pageRes = await fetch(CMF_PAGE, {
    headers: browserHeaders(),
    redirect: 'follow',
  })

  if (!pageRes.ok) {
    return { success: false, error: `CMF page returned ${pageRes.status}` }
  }

  // Extract session cookie
  const cookies = extractCookies(pageRes)
  const sessionCookie = cookies.find(c => c.startsWith('PHPSESSID='))
  if (!sessionCookie) {
    // Some servers use different cookie names — grab all
    console.log('  Cookies:', cookies.join('; '))
  }
  const cookieHeader = cookies.join('; ')
  console.log(`  Sesión establecida (${cookies.length} cookies)`)

  // Step 2: Fetch captcha image
  console.log('  [2/5] Descargando imagen captcha...')
  const captchaUrl = `${CAPTCHA_IMAGE}?rand=${Math.floor(Math.random() * 32768)}`
  const captchaRes = await fetch(captchaUrl, {
    headers: { ...browserHeaders(), Cookie: cookieHeader, Referer: CMF_PAGE },
  })

  if (!captchaRes.ok) {
    return { success: false, error: `Captcha image returned ${captchaRes.status}` }
  }

  const captchaBuffer = Buffer.from(await captchaRes.arrayBuffer())
  const captchaBase64 = captchaBuffer.toString('base64')
  console.log(`  Captcha descargado: ${captchaBuffer.length} bytes`)

  // Step 3: Send to 2captcha for solving
  console.log('  [3/5] Enviando a 2captcha...')
  const solveStart = Date.now()

  const solver = new Solver(apiKey)
  let captchaText: string

  try {
    const solution = await solver.imageCaptcha({
      body: captchaBase64,
      numeric: 0,        // 0 = any characters
      min_len: 4,
      max_len: 8,
    })
    captchaText = solution.data?.trim() || ''
  } catch (err: any) {
    return { success: false, error: `2captcha error: ${err?.message || err}` }
  }

  const solveMs = Date.now() - solveStart
  console.log(`  Captcha resuelto: "${captchaText}" (${(solveMs / 1000).toFixed(1)}s)`)

  if (!captchaText || captchaText.length < 3) {
    return { success: false, error: `2captcha returned invalid solution: "${captchaText}"` }
  }

  // Step 4: Validate captcha via AJAX POST (same as the page's valida() function)
  console.log('  [4/5] Validando captcha...')
  const validateRes = await fetch(CAPTCHA_VALIDATE, {
    method: 'POST',
    headers: {
      ...browserHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
      Referer: CMF_PAGE,
    },
    body: `accion=valida&valor=${encodeURIComponent(captchaText)}`,
  })

  const validateResult = (await validateRes.text()).trim()
  if (validateResult !== '1') {
    return {
      success: false,
      error: `Captcha validation failed (response: "${validateResult}")`,
      captchaSolveMs: solveMs,
    }
  }
  console.log('  Captcha validado OK')

  // Step 5: Submit form to download
  // Include hidden referer fields that the page's JavaScript sets
  console.log('  [5/5] Descargando cartola...')
  const formBody = new URLSearchParams({
    txt_inicio: options.inicio,
    txt_termino: options.termino,
    ffmm: options.run || '%',
    captcha: captchaText,
    HTTP_REFERER: CMF_PAGE,
    HTTP_REFERER_PREV: CMF_PAGE,
  })

  const downloadRes = await fetch(CMF_DOWNLOAD, {
    method: 'POST',
    headers: {
      ...browserHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
      Referer: CMF_PAGE,
    },
    body: formBody.toString(),
    redirect: 'follow',
  })

  if (!downloadRes.ok) {
    return { success: false, error: `Download returned ${downloadRes.status}`, captchaSolveMs: solveMs }
  }

  // Read response as buffer, decode as latin-1
  const downloadBuffer = Buffer.from(await downloadRes.arrayBuffer())
  const content = new TextDecoder('latin1').decode(downloadBuffer)

  // Check for known CMF error responses
  // Note: content is latin-1 decoded, so "ó" may appear as various encodings
  const trimmed = content.trim()
  if (trimmed.length < 50 && (trimmed.includes('Sin informaci') || trimmed.includes('Sin informacion'))) {
    return {
      success: false,
      error: 'CMF no tiene datos para el rango de fechas solicitado (Sin información). Puede ser fin de semana o feriado.',
      captchaSolveMs: solveMs,
    }
  }

  if (content.includes('Error 1') || content.includes('<!DOCTYPE') || content.includes('<html')) {
    const errorSnippet = content.substring(0, 200).replace(/<[^>]+>/g, '').trim()
    return {
      success: false,
      error: `CMF returned error page: ${errorSnippet}`,
      captchaSolveMs: solveMs,
    }
  }

  // Verify it looks like CMF data (semicolon-separated with RUN)
  const lines = content.split('\n').filter(l => l.trim().length > 0)
  if (lines.length < 2 || !content.includes(';')) {
    return {
      success: false,
      error: `Response doesn't look like CMF data (${lines.length} lines, ${downloadBuffer.length} bytes). Content: "${content.substring(0, 100)}"`,
      captchaSolveMs: solveMs,
    }
  }

  // Remove debug logs for production
  const today = new Date().toISOString().split('T')[0]
  return {
    success: true,
    content,
    filename: `cartola_cmf_${today}.txt`,
    captchaSolveMs: solveMs,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function browserHeaders(): Record<string, string> {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
  }
}

function extractCookies(response: Response): string[] {
  const cookies: string[] = []
  // getSetCookie() is available in Node 18+
  const setCookieHeaders = response.headers.getSetCookie?.() || []
  for (const header of setCookieHeaders) {
    // Extract just the cookie name=value part (before ;)
    const cookiePart = header.split(';')[0].trim()
    if (cookiePart) cookies.push(cookiePart)
  }

  // Fallback: try raw header
  if (cookies.length === 0) {
    const raw = response.headers.get('set-cookie')
    if (raw) {
      // Multiple cookies may be comma-separated (older spec)
      for (const part of raw.split(/,(?=[^;]*=)/)) {
        const cookiePart = part.split(';')[0].trim()
        if (cookiePart) cookies.push(cookiePart)
      }
    }
  }

  return cookies
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
