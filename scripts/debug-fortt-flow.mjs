import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1. Find Fortt's client ID
const { data: clients } = await supabase
  .from('clients')
  .select('id, name')
  .ilike('name', '%fortt%');

console.log('=== Fortt client ===');
console.log(clients);

if (!clients?.length) { console.log('No client found'); process.exit(1); }
const clientId = clients[0].id;

// 2. Get latest snapshot
const { data: snapshots } = await supabase
  .from('portfolio_snapshots')
  .select('id, snapshot_date, total_value, holdings, source, custodian')
  .eq('client_id', clientId)
  .order('snapshot_date', { ascending: false })
  .limit(3);

console.log('\n=== Snapshots ===');
for (const s of snapshots || []) {
  const holdings = s.holdings || [];
  console.log(`\n${s.snapshot_date} (${s.custodian || 'unknown'}) - ${holdings.length} holdings, total: ${s.total_value}`);
  for (const h of holdings) {
    console.log(`  ${(h.fundName || '').padEnd(45)} | secId: ${(h.securityId || 'NULL').padEnd(12)} | qty: ${h.quantity} | mv: ${h.marketValue} | ccy: ${h.currency || 'CLP'} | class: ${h.assetClass || '?'}`);
  }
}

// 3. Check which holdings are international (CUSIP-like)
const latest = snapshots?.[0];
if (!latest) process.exit(1);

console.log('\n=== Price resolution simulation ===');
const holdings = latest.holdings || [];
for (const h of holdings) {
  const secId = (h.securityId || '').trim();
  const name = (h.fundName || '').trim();

  // Simulate resolveSource logic for international funds
  const INTL_MAP = {
    L2R330245: { eodhd: 'LU0813337184.EUFUND', yahoo: null },
    G1R06N212: { eodhd: 'IE00BD5CTV53.EUFUND', yahoo: '0P00019BP0' },
    G6016L337: { eodhd: null, yahoo: '0P00000ICR' },
    L9381G101: { eodhd: 'LU0029761532.EUFUND', yahoo: '0P00000AZP' },
  };

  const mapping = INTL_MAP[secId.toUpperCase()];
  if (mapping) {
    console.log(`\n${name} (${secId}):`);
    console.log(`  → MAPPED to eodhd=${mapping.eodhd}, yahoo=${mapping.yahoo}`);

    // Check DB for stored prices
    const ticker = mapping.eodhd || mapping.yahoo;
    if (ticker) {
      const { data: prices, count } = await supabase
        .from('international_prices')
        .select('price_date, close_price', { count: 'exact' })
        .eq('ticker', ticker)
        .order('price_date', { ascending: false })
        .limit(3);
      console.log(`  DB (${ticker}): ${count || 0} rows`, prices?.slice(0, 2));
    }
  } else if (/^\d{3,6}$/.test(secId)) {
    // CMF fund - check price
    const { data: fondo } = await supabase
      .from('fondos_mutuos')
      .select('nombre_fondo, moneda_funcional')
      .eq('fo_run', parseInt(secId))
      .limit(1);
    const precio = fondo?.[0];
    console.log(`\n${name} (RUN ${secId}): ${precio?.nombre_fondo || 'NOT FOUND'} [${precio?.moneda_funcional || '?'}]`);
  }
}
