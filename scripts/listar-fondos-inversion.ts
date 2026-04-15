/**
 * Scrapes CMF listings of Fondos de Inversión (FIRES + FINRE).
 * No captcha needed — plain HTML tables.
 * Output: JSON + CSV with RUT, name, administrator, type.
 */

import * as fs from 'fs'
import * as path from 'path'

interface FondoInversion {
  rut: string
  nombre: string
  administradora: string
  tipo: 'FIRES' | 'FINRE'
  row: string
}

const BASE = 'https://www.cmfchile.cl/institucional/mercados'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

async function fetchListing(tipo: 'FIRES' | 'FINRE'): Promise<FondoInversion[]> {
  const url = `${BASE}/consulta.php?mercado=V&Estado=VI&entidad=${tipo}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${tipo} returned ${res.status}`)
  const html = await res.text()

  const fondos: FondoInversion[] = []

  // Regex strategy: find <tr>...</tr> rows containing entidad.php?rut=X links
  // Each row has: RUT | entity name | status | administrator link
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const rows = html.match(rowRegex) || []

  for (const row of rows) {
    // Skip header rows
    if (!row.includes('entidad.php?') || !row.includes(`tipoentidad=${tipo}`)) continue

    // Extract RUT from URL param
    const rutMatch = row.match(/rut=(\d+)/)
    if (!rutMatch) continue
    const rut = rutMatch[1]

    // Extract row parameter (CMF internal rowid)
    const rowIdMatch = row.match(/row=([^&"]+)/)
    const rowId = rowIdMatch?.[1] || ''

    // Extract all <td>...</td> cell contents (both text and linked)
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
      m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    )
    if (cells.length < 3) continue

    // Column layout: [RUT_display, entity_name, administrator, status]
    const nombre = cells.find(c => /FONDO/i.test(c)) || ''
    if (!nombre) continue

    // Administrator: td that contains "ADMINISTRADORA" or AGF-like text
    const administradora = cells.find(c =>
      /ADMINISTRADORA|AGF|ASSET|CAPITAL|GESTI/i.test(c) && !/FONDO DE INVERSI/i.test(c)
    ) || ''

    fondos.push({ rut, nombre, administradora, tipo, row: rowId })
  }

  // Dedupe by RUT
  const seen = new Set<string>()
  return fondos.filter(f => {
    if (seen.has(f.rut)) return false
    seen.add(f.rut)
    return true
  })
}

async function main() {
  console.log('Descargando listado CMF fondos de inversión...\n')

  const [fires, finre] = await Promise.all([
    fetchListing('FIRES'),
    fetchListing('FINRE'),
  ])

  console.log(`  FIRES (Rescatables):    ${fires.length}`)
  console.log(`  FINRE (No Rescatables): ${finre.length}`)
  console.log(`  Total:                  ${fires.length + finre.length}\n`)

  const all = [...fires, ...finre].sort((a, b) => a.nombre.localeCompare(b.nombre))

  // Group by administrator
  const byAdm = new Map<string, FondoInversion[]>()
  for (const f of all) {
    const key = f.administradora || '(sin administradora)'
    if (!byAdm.has(key)) byAdm.set(key, [])
    byAdm.get(key)!.push(f)
  }

  const sortedAdm = [...byAdm.entries()].sort((a, b) => b[1].length - a[1].length)

  console.log('=== RESUMEN POR ADMINISTRADORA ===\n')
  for (const [adm, fondos] of sortedAdm) {
    console.log(`  ${fondos.length.toString().padStart(3)} - ${adm}`)
  }

  // Save JSON
  const outDir = path.join(process.cwd(), 'data', 'cmf')
  fs.mkdirSync(outDir, { recursive: true })
  const jsonPath = path.join(outDir, 'fondos-inversion.json')
  fs.writeFileSync(jsonPath, JSON.stringify(all, null, 2))
  console.log(`\nJSON guardado: ${jsonPath}`)

  // Save CSV
  const csvPath = path.join(outDir, 'fondos-inversion.csv')
  const csv = ['rut;tipo;nombre;administradora', ...all.map(f => `${f.rut};${f.tipo};"${f.nombre}";"${f.administradora}"`)].join('\n')
  fs.writeFileSync(csvPath, csv, 'utf-8')
  console.log(`CSV guardado:  ${csvPath}`)

  // Print sample
  console.log('\n=== PRIMEROS 10 FONDOS (alfabético) ===\n')
  all.slice(0, 10).forEach(f => {
    console.log(`  [${f.tipo}] ${f.rut.padEnd(6)} ${f.nombre.slice(0, 60)}`)
  })
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
