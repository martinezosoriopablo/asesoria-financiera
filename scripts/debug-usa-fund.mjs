import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clients } = await sb.from('clients').select('id, nombre, apellido').ilike('nombre', '%heraldo%').limit(1);
if (!clients?.length) { console.log('No Heraldo'); process.exit(); }
const cid = clients[0].id;
console.log('Client:', clients[0].nombre, clients[0].apellido, cid);

const { data: snaps } = await sb.from('portfolio_snapshots').select('id, holdings, created_at')
  .eq('client_id', cid).order('created_at', { ascending: false }).limit(1);
if (!snaps?.length) { console.log('No snapshot'); process.exit(); }

const holdings = snaps[0].holdings;
console.log('\n=== All holdings ===');
for (const h of holdings) {
  console.log(`  ${h.fundName} | serie=${h.serie} | run=${h.securityId} | qty=${h.quantity} | mktVal=${h.marketValue} | unitCost=${h.unitCost} | costBasis=${h.costBasis} | currency=${h.currency}`);
}

// Find USA-related fund
console.log('\n=== USA/EEUU funds detail ===');
for (const h of holdings) {
  const n = (h.fundName || '').toLowerCase();
  if (n.includes('eeuu') || n.includes('usa') || n.includes('acciones') || n.includes('equity') || n.includes('estados')) {
    console.log(JSON.stringify(h, null, 2));

    // Check its price history
    if (h.securityId) {
      const run = parseInt(h.securityId, 10);
      const { data: fondos } = await sb.from('fondos_mutuos').select('id, fo_run, fm_serie, nombre_fondo, moneda_funcional')
        .eq('fo_run', run).eq('fm_serie', h.serie || 'B');
      console.log('\nDB fondo match:', JSON.stringify(fondos, null, 2));

      if (fondos?.length) {
        const fid = fondos[0].id;
        // Last 20 prices
        const { data: prices } = await sb.from('fondos_rentabilidades_diarias')
          .select('fecha, valor_cuota')
          .eq('fondo_id', fid)
          .order('fecha', { ascending: false })
          .limit(20);
        console.log('\nLast 20 prices:');
        for (const p of (prices || [])) {
          console.log(`  ${p.fecha}: ${p.valor_cuota}`);
        }

        // Check for suspicious jumps (USD/CLP mix)
        if (prices?.length >= 2) {
          console.log('\nPrice ratio analysis (detecting CLP/USD jumps):');
          for (let i = 0; i < prices.length - 1; i++) {
            const ratio = prices[i].valor_cuota / prices[i+1].valor_cuota;
            if (ratio > 2 || ratio < 0.5) {
              console.log(`  JUMP: ${prices[i+1].fecha} (${prices[i+1].valor_cuota}) -> ${prices[i].fecha} (${prices[i].valor_cuota}) ratio=${ratio.toFixed(2)}`);
            }
          }
        }
      }
    }
  }
}
