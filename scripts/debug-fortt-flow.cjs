const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Find Fortt
  const { data: all } = await sb.from('clients').select('id, name');
  const fortt = (all || []).filter(c => c.name.toLowerCase().includes('fort'));
  console.log('Fortt matches:', fortt);
  if (fortt.length === 0) {
    console.log('First 10 clients:');
    (all || []).slice(0, 10).forEach(c => console.log(' ', c.id, c.name));
    return;
  }

  const clientId = fortt[0].id;

  // Get snapshots
  const { data: snaps } = await sb
    .from('portfolio_snapshots')
    .select('id, snapshot_date, total_value, holdings, source, custodian')
    .eq('client_id', clientId)
    .neq('source', 'api-prices')
    .order('snapshot_date', { ascending: false })
    .limit(3);

  for (const s of snaps || []) {
    const h = s.holdings || [];
    console.log(`\n--- Snapshot ${s.snapshot_date} (${s.custodian || '?'}) - ${h.length} holdings ---`);
    for (const hh of h) {
      const secId = (hh.securityId || 'NULL');
      console.log(`  ${(hh.fundName || '').substring(0,40).padEnd(42)} secId=${secId.padEnd(12)} qty=${hh.quantity} mv=${hh.marketValue} ccy=${hh.currency || 'CLP'} class=${hh.assetClass || '?'}`);
    }
  }

  // Check international_prices for the mapped tickers
  console.log('\n=== international_prices check ===');
  const tickers = [
    'LU0813337184.EUFUND', 'IE00BD5CTV53.EUFUND',
    '0P00000ICR', 'LU0029761532.EUFUND', '0P00000AZP',
    'L2R330245', 'G1R06N212', 'G6016L337', 'L9381G101'
  ];
  for (const t of tickers) {
    const { count } = await sb
      .from('international_prices')
      .select('*', { count: 'exact', head: true })
      .eq('ticker', t);
    if (count > 0) {
      const { data: latest } = await sb
        .from('international_prices')
        .select('price_date, close_price')
        .eq('ticker', t)
        .order('price_date', { ascending: false })
        .limit(1);
      console.log(`  ${t.padEnd(25)} ${count} rows, latest: ${latest[0].price_date} = ${latest[0].close_price}`);
    } else {
      console.log(`  ${t.padEnd(25)} 0 rows`);
    }
  }
}

main().catch(console.error);
