// Audit: recalculate Fortt's portfolio returns from scratch and compare
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://zysotxkelepvotzujhxe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5c290eGtlbGVwdm90enVqaHhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjUyNjk3NCwiZXhwIjoyMDgyMTAyOTc0fQ.Ansi89kIfptszv0I3DzmPJdqrEpi7tLbckiobvw6QRM'
);

const clientId = '0f0e0931-977f-4e1f-b506-d3a120e06124'; // Felipe Fortt

async function main() {
  // 1. Get latest snapshot
  const { data: snaps } = await sb
    .from('portfolio_snapshots')
    .select('*')
    .eq('client_id', clientId)
    .neq('source', 'api-prices')
    .order('snapshot_date', { ascending: false })
    .limit(2);

  const latest = snaps[0];
  console.log(`\n=== Snapshot: ${latest.snapshot_date} ===`);
  console.log(`Total value (stored): ${latest.total_value?.toLocaleString()}`);

  const holdings = latest.holdings || [];

  // 2. Get current exchange rates
  const usdRes = await fetch('https://mindicador.cl/api/dolar');
  const usdJson = await usdRes.json();
  const usdRate = usdJson.serie[0].valor;

  const ufRes = await fetch('https://mindicador.cl/api/uf');
  const ufJson = await ufRes.json();
  const ufRate = ufJson.serie[0].valor;

  console.log(`\nCurrent rates: USD=${usdRate}, UF=${ufRate}`);

  // 3. Get CMF prices for Chilean funds
  console.log('\n=== Chilean Fund Prices (CMF) ===');
  const chileanFunds = holdings.filter(h => /^\d{3,6}$/.test((h.securityId || '').trim()));

  for (const h of chileanFunds) {
    const run = parseInt(h.securityId.trim());
    const { data: fondo } = await sb
      .from('vw_fondos_completo')
      .select('fo_run, fm_serie, nombre_fondo, moneda_funcional, valor_cuota')
      .eq('fo_run', run)
      .limit(10);

    // Find matching serie
    const serie = h.serie || '';
    const match = fondo?.find(f => f.fm_serie === serie) || fondo?.[0];

    if (match) {
      const cartolaPrice = h.quantity > 0 ? h.marketValue / h.quantity : 0;
      const currentPrice = match.valor_cuota;
      const isUSD = match.moneda_funcional === 'USD' || h.currency === 'USD';

      let cartolaValueCLP, currentValueCLP;
      if (isUSD) {
        // Need historical USD rate at snapshot date
        cartolaValueCLP = h.marketValue * usdRate; // approximation with current rate for now
        currentValueCLP = currentPrice * h.quantity * usdRate;
      } else {
        cartolaValueCLP = h.marketValue;
        currentValueCLP = currentPrice * h.quantity;
      }

      const returnPct = cartolaPrice > 0 ? ((currentPrice / cartolaPrice) - 1) * 100 : 0;

      console.log(`\n  ${h.fundName?.substring(0, 50)}`);
      console.log(`    RUN=${run} Serie=${serie} Qty=${h.quantity}`);
      console.log(`    Cartola price: ${cartolaPrice.toFixed(4)} | CMF price: ${currentPrice?.toFixed(4)} | ${match.moneda_funcional || 'CLP'}`);
      console.log(`    Return (price only): ${returnPct.toFixed(2)}%`);
      console.log(`    Cartola MV: ${h.marketValue.toLocaleString()} | Current MV: ${(currentPrice * h.quantity).toLocaleString()}`);
      if (isUSD) {
        console.log(`    CLP values → Cartola: ${cartolaValueCLP?.toLocaleString()} | Current: ${currentValueCLP?.toLocaleString()}`);
      }
    } else {
      console.log(`\n  ${h.fundName}: RUN ${run} NOT FOUND in CMF`);
    }
  }

  // 4. International holdings - get current prices
  console.log('\n\n=== International Holdings ===');

  const INTL_MAP = {
    L2R330245: { eodhd: 'LU0813337184.EUFUND', yahoo: null, name: 'DWS LatAm' },
    G1R06N212: { eodhd: 'IE00BD5CTV53.EUFUND', yahoo: '0P00019BP0', name: 'BNY HY' },
    G6016L337: { eodhd: null, yahoo: '0P00000ICR', name: 'Jupiter' },
    L9381G101: { eodhd: 'LU0029761532.EUFUND', yahoo: '0P00000AZP', name: 'UBAM' },
  };

  const intlHoldings = holdings.filter(h => {
    const id = (h.securityId || '').trim().toUpperCase();
    return INTL_MAP[id];
  });

  for (const h of intlHoldings) {
    const id = h.securityId.trim().toUpperCase();
    const mapping = INTL_MAP[id];
    const ticker = mapping.eodhd || mapping.yahoo;

    // Get latest price from DB
    const { data: prices } = await sb
      .from('international_prices')
      .select('price_date, close_price')
      .eq('ticker', ticker)
      .order('price_date', { ascending: false })
      .limit(1);

    const cartolaPrice = h.quantity > 0 ? h.marketValue / h.quantity : 0;
    const currentPrice = prices?.[0]?.close_price;
    const priceDate = prices?.[0]?.price_date;

    const returnPct = cartolaPrice > 0 && currentPrice ? ((currentPrice / cartolaPrice) - 1) * 100 : null;

    const cartolaValueUSD = h.marketValue;
    const currentValueUSD = currentPrice ? currentPrice * h.quantity : null;
    const cartolaValueCLP = cartolaValueUSD * usdRate;
    const currentValueCLP = currentValueUSD ? currentValueUSD * usdRate : null;

    console.log(`\n  ${h.fundName?.substring(0, 50)}`);
    console.log(`    CUSIP=${id} Ticker=${ticker} Qty=${h.quantity}`);
    console.log(`    Cartola price (USD): ${cartolaPrice.toFixed(4)} | DB price: ${currentPrice?.toFixed(4) || 'N/A'} (${priceDate || 'N/A'})`);
    console.log(`    Return (USD price only): ${returnPct?.toFixed(2) || 'N/A'}%`);
    console.log(`    USD → Cartola: $${cartolaValueUSD.toLocaleString()} | Current: $${currentValueUSD?.toLocaleString() || 'N/A'}`);
    console.log(`    CLP → Cartola: $${Math.round(cartolaValueCLP).toLocaleString()} | Current: $${currentValueCLP ? Math.round(currentValueCLP).toLocaleString() : 'N/A'}`);
  }

  // 5. ETFs and stocks
  console.log('\n\n=== Chilean ETFs & Stocks ===');
  const clHoldings = holdings.filter(h => {
    const id = (h.securityId || '').trim().toUpperCase();
    return /^CFI/.test(id) || /^[A-Z]{3,10}CL$/.test(id);
  });

  for (const h of clHoldings) {
    const id = h.securityId.trim().toUpperCase();
    let yahooTicker;
    if (/^CFIETF/.test(id)) yahooTicker = id + '.SN';
    else if (/^CFI/.test(id)) yahooTicker = id + '.SN';
    else if (/CL$/.test(id)) yahooTicker = id.replace(/CL$/, '') + 'CL.SN';

    // Get latest price from international_prices
    const { data: prices } = await sb
      .from('international_prices')
      .select('price_date, close_price')
      .eq('ticker', yahooTicker || id)
      .order('price_date', { ascending: false })
      .limit(1);

    const cartolaPrice = h.quantity > 0 ? h.marketValue / h.quantity : 0;
    const currentPrice = prices?.[0]?.close_price;
    const priceDate = prices?.[0]?.price_date;

    const returnPct = cartolaPrice > 0 && currentPrice ? ((currentPrice / cartolaPrice) - 1) * 100 : null;

    console.log(`\n  ${(h.fundName || id).substring(0, 50)}`);
    console.log(`    SecId=${id} Yahoo=${yahooTicker || '?'} Qty=${h.quantity}`);
    console.log(`    Cartola: ${cartolaPrice.toFixed(2)} | DB: ${currentPrice?.toFixed(2) || 'N/A'} (${priceDate || 'N/A'})`);
    console.log(`    Return: ${returnPct?.toFixed(2) || 'N/A'}%`);
    console.log(`    Cartola MV: $${h.marketValue.toLocaleString()} CLP`);
  }

  // 6. Portfolio totals
  console.log('\n\n=== Portfolio Summary ===');
  let totalCartolaCLP = 0;
  let totalCurrentCLP = 0;

  for (const h of holdings) {
    const mv = h.marketValue || 0;
    if (h.currency === 'USD') {
      totalCartolaCLP += mv * usdRate;
    } else {
      totalCartolaCLP += mv;
    }
  }
  console.log(`Total cartola (CLP, approx): $${Math.round(totalCartolaCLP).toLocaleString()}`);
  console.log(`Stored total_value: $${latest.total_value?.toLocaleString()}`);
  console.log(`Snapshot date: ${latest.snapshot_date}`);
  console.log(`Days since snapshot: ${Math.round((Date.now() - new Date(latest.snapshot_date).getTime()) / 86400000)}`);
}

main().catch(console.error);
