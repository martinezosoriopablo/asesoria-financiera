import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Find Heraldo's latest snapshot
const { data: clients } = await supabase.from('clients').select('id, nombre, apellido').ilike('nombre', '%Heraldo%').limit(1);
if (!clients || clients.length === 0) { console.log('No Heraldo found'); process.exit(); }
const cid = clients[0].id;
console.log('Client:', clients[0].nombre, clients[0].apellido, cid);

const { data: snap } = await supabase
  .from('portfolio_snapshots')
  .select('id, holdings')
  .eq('client_id', cid)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (!snap) { console.log('No snapshot'); process.exit(); }

console.log('\n=== Holdings de Heraldo ===');
for (const h of snap.holdings) {
  console.log(h.fundName, '| run:', h.securityId, '| serie:', h.serie, '| unitCost:', h.unitCost, '| costBasis:', h.costBasis);
}

// Now look up purchase dates for funds with unitCost
console.log('\n=== Buscando fechas de compra ===');
for (const h of snap.holdings) {
  const run = parseInt(h.securityId, 10);
  const serie = h.serie;
  const unitCost = h.unitCost;
  if (!run || !serie || !unitCost) continue;

  // Get fondo_id
  const { data: fondo } = await supabase
    .from('fondos_mutuos')
    .select('id')
    .eq('fo_run', run)
    .eq('fm_serie', serie)
    .limit(1)
    .single();

  if (!fondo) { console.log('\n' + h.fundName, '| fondo not found'); continue; }

  const tolerance = unitCost * 0.003; // 0.3% tolerance
  const { data: matches, error } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fecha, valor_cuota')
    .eq('fondo_id', fondo.id)
    .gte('valor_cuota', unitCost - tolerance)
    .lte('valor_cuota', unitCost + tolerance)
    .order('fecha', { ascending: true })
    .limit(5);

  console.log('\n' + h.fundName, '| unitCost:', unitCost);
  if (error) { console.log('  Error:', error.message); continue; }
  if (matches.length === 0) { console.log('  No match found in historical prices'); continue; }
  matches.forEach(r => console.log('  Match:', r.fecha, '| valor_cuota:', r.valor_cuota, '| diff:', (r.valor_cuota - unitCost).toFixed(4)));

  // Current price
  const { data: current } = await supabase
    .from('fondos_rentabilidades_diarias')
    .select('fecha, valor_cuota')
    .eq('fondo_id', fondo.id)
    .order('fecha', { ascending: false })
    .limit(1)
    .single();
  if (current) console.log('  Precio actual:', current.fecha, '| valor_cuota:', current.valor_cuota);
}
