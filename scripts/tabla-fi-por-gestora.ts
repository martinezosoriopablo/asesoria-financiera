import * as fs from 'fs'

const fondos = JSON.parse(fs.readFileSync('data/cmf/fondos-inversion.json', 'utf-8'))

const byAdm = new Map<string, { fires: number; finre: number }>()
for (const f of fondos) {
  const key = f.administradora || '(sin adm)'
  if (!byAdm.has(key)) byAdm.set(key, { fires: 0, finre: 0 })
  const e = byAdm.get(key)!
  if (f.tipo === 'FIRES') e.fires++
  else e.finre++
}

const rows = [...byAdm.entries()].map(([adm, c]) => ({
  adm,
  fires: c.fires,
  finre: c.finre,
  total: c.fires + c.finre,
}))
rows.sort((a, b) => b.total - a.total)

function shortName(name: string): string {
  return name
    .replace(/ADMINISTRADORA GENERAL DE FONDOS/gi, '')
    .replace(/S\.A\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const col1 = 50
console.log('')
console.log('ADMINISTRADORA'.padEnd(col1) + ' | FIRES | FINRE | TOTAL')
console.log('-'.repeat(col1) + '-+-------+-------+------')

for (const r of rows) {
  const name = shortName(r.adm).slice(0, col1)
  console.log(
    name.padEnd(col1) +
      ' | ' +
      String(r.fires).padStart(5) +
      ' | ' +
      String(r.finre).padStart(5) +
      ' | ' +
      String(r.total).padStart(5)
  )
}

console.log('-'.repeat(col1) + '-+-------+-------+------')
const totF = rows.reduce((s, r) => s + r.fires, 0)
const totN = rows.reduce((s, r) => s + r.finre, 0)
console.log(
  'TOTAL'.padEnd(col1) +
    ' | ' +
    String(totF).padStart(5) +
    ' | ' +
    String(totN).padStart(5) +
    ' | ' +
    String(totF + totN).padStart(5)
)
console.log('')
console.log(`Total gestoras: ${rows.length}`)
