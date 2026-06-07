const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://zysotxkelepvotzujhxe.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5c290eGtlbGVwdm90enVqaHhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjUyNjk3NCwiZXhwIjoyMDgyMTAyOTc0fQ.Ansi89kIfptszv0I3DzmPJdqrEpi7tLbckiobvw6QRM');

const clientId = '0f0e0931-977f-4e1f-b506-d3a120e06124';

async function main() {
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
    console.log(`\n--- Snapshot ${s.snapshot_date} (${s.custodian || '?'}, src=${s.source || '?'}) - ${h.length} holdings ---`);
    for (const hh of h) {
      const secId = (hh.securityId || 'NULL');
      const name = (hh.fundName || '').substring(0, 40);
      console.log(`  ${name.padEnd(42)} secId=${secId.padEnd(12)} qty=${String(hh.quantity).padStart(10)} mv=${String(hh.marketValue).padStart(12)} ccy=${(hh.currency || 'CLP').padEnd(4)} class=${hh.assetClass || '?'}`);
    }
  }

  // For the latest snapshot, simulate what historical-prices API would do
  const latest = snaps[0];
  console.log('\n=== Checking which holdings pass the internationalHoldings filter ===');
  const holdings = latest.holdings || [];
  for (const h of holdings) {
    const id = (h.securityId || '').trim().toUpperCase();
    if (!id || /^\d{1,6}$/.test(id) || (h.quantity || 0) <= 0) {
      if (/^\d{1,6}$/.test(id)) console.log(`  SKIP (CMF RUN): ${h.fundName} [${id}]`);
      continue;
    }

    let included = false;
    let reason = '';
    if (/^CFI/.test(id)) { included = true; reason = 'CFI*'; }
    else if (/^[A-Z]{3,10}CL$/.test(id)) { included = true; reason = 'Chilean ADR'; }
    else if (id.includes('.SN')) { included = true; reason = '.SN suffix'; }
    else if (/^[A-Z]{1,5}$/.test(id)) { included = true; reason = 'US ticker'; }
    else if (/^[A-Z0-9]{9}$/i.test(id)) { included = true; reason = '9-char CUSIP'; }

    const status = included ? 'INCLUDED' : 'EXCLUDED';
    console.log(`  ${status} (${reason || 'no match'}): ${h.fundName} [${id}]`);
  }

  // Check international_prices DB
  console.log('\n=== international_prices for mapped tickers ===');
  const tickers = [
    { label: 'DWS EODHD', t: 'LU0813337184.EUFUND' },
    { label: 'BNY EODHD', t: 'IE00BD5CTV53.EUFUND' },
    { label: 'BNY Yahoo', t: '0P00019BP0' },
    { label: 'Jupiter Yahoo', t: '0P00000ICR' },
    { label: 'UBAM EODHD', t: 'LU0029761532.EUFUND' },
    { label: 'UBAM Yahoo', t: '0P00000AZP' },
    // Also check if old CUSIPs were stored directly
    { label: 'DWS CUSIP', t: 'L2R330245' },
    { label: 'BNY CUSIP', t: 'G1R06N212' },
    { label: 'Jupiter CUSIP', t: 'G6016L337' },
    { label: 'UBAM CUSIP', t: 'L9381G101' },
  ];
  for (const { label, t } of tickers) {
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
      console.log(`  ${label.padEnd(16)} (${t.padEnd(25)}): ${String(count).padStart(4)} rows, latest: ${latest[0].price_date} = ${latest[0].close_price}`);
    } else {
      console.log(`  ${label.padEnd(16)} (${t.padEnd(25)}):    0 rows`);
    }
  }
}

main().catch(console.error);
