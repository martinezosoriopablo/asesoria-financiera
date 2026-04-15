/**
 * Bootstrap: populate `fondos_inversion` table from data/cmf/fondos-inversion.json
 * Run after applying migration 20260410_fondos_inversion.sql
 *
 *   npx tsx scripts/bootstrap-fondos-inversion.ts [--only-fires]
 */

import * as fs from 'fs'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config() // fallback to .env
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url || !serviceKey) {
  console.error('Missing SUPABASE env vars'); process.exit(1)
}
const supabase = createClient(url, serviceKey)

interface FIJson {
  rut: string
  nombre: string
  administradora: string
  tipo: 'FIRES' | 'FINRE'
  row: string
}

async function main() {
  const onlyFires = process.argv.includes('--only-fires')
  const raw: FIJson[] = JSON.parse(fs.readFileSync('data/cmf/fondos-inversion.json', 'utf-8'))
  const items = onlyFires ? raw.filter(f => f.tipo === 'FIRES') : raw
  console.log(`Bootstrapping ${items.length} fondos${onlyFires ? ' (only FIRES)' : ''}...`)

  const rows = items.map(f => ({
    rut: f.rut,
    nombre: f.nombre,
    administradora: f.administradora || null,
    tipo: f.tipo,
    cmf_row: f.row,
    activo: true,
  }))

  // Upsert in batches of 500
  const batchSize = 500
  let total = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase
      .from('fondos_inversion')
      .upsert(batch, { onConflict: 'rut' })
    if (error) {
      console.error(`Batch ${i}: ${error.message}`)
      process.exit(1)
    }
    total += batch.length
    console.log(`  Upserted ${total}/${rows.length}`)
  }

  // Summary
  const { count: firesCount } = await supabase
    .from('fondos_inversion').select('*', { count: 'exact', head: true }).eq('tipo', 'FIRES')
  const { count: finreCount } = await supabase
    .from('fondos_inversion').select('*', { count: 'exact', head: true }).eq('tipo', 'FINRE')

  console.log(`\nDB state:`)
  console.log(`  FIRES: ${firesCount}`)
  console.log(`  FINRE: ${finreCount}`)
}

main().catch(e => { console.error(e); process.exit(1) })
