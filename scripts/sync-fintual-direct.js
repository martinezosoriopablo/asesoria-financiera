// scripts/sync-fintual-direct.js
// Sync directo a Supabase con los proveedores principales

require('dotenv').config({ path: '.env.local' });

const FINTUAL_API = 'https://fintual.cl/api';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Proveedores principales a sincronizar (los más importantes)
const MAIN_PROVIDERS = [
  'banchile', 'santander', 'bci', 'security', 'bice', 'scotia', 'sura',
  'principal', 'itau', 'btg', 'credicorp', 'larrainvial', 'larrain',
  'fintual', 'bancoestado', 'compass', 'zurich', 'moneda', 'toesca',
  'euroamerica', 'singular', 'aurus', 'nevasa'
];

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await sleep(2000); // Always wait before request
      const res = await fetch(url);
      if (res.status === 429) {
        console.log('  Rate limited, waiting 10s...');
        await sleep(10000);
        continue;
      }
      if (res.status === 404) return { data: [] };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      if (text.startsWith('<!')) {
        await sleep(5000);
        continue;
      }
      return JSON.parse(text);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(3000 * (i + 1));
    }
  }
  return { data: [] };
}

async function supabaseUpsert(records) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fintual_funds?on_conflict=fintual_id`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(records)
  });

  if (!res.ok) {
    const text = await res.text();
    // Ignore duplicate key errors
    if (text.includes('23505')) return;
    throw new Error(`Supabase error: ${text}`);
  }
}

async function syncMain() {
  console.log('=== SYNC FINTUAL → SUPABASE ===\n');

  // Get providers
  const providersData = await fetchWithRetry(FINTUAL_API + '/asset_providers');
  const providers = providersData.data || [];
  console.log('Total proveedores en Fintual:', providers.length);

  // Filter main providers
  const mainProviders = providers.filter(p => {
    const name = p.attributes.name.toLowerCase();
    return MAIN_PROVIDERS.some(k => name.includes(k));
  });

  console.log('Proveedores principales:', mainProviders.length);

  let totalSeries = 0;
  let insertedSeries = 0;

  for (let i = 0; i < mainProviders.length; i++) {
    const provider = mainProviders[i];
    console.log(`\n[${i+1}/${mainProviders.length}] ${provider.attributes.name}`);

    try {
      const fundsData = await fetchWithRetry(
        FINTUAL_API + '/asset_providers/' + provider.id + '/conceptual_assets'
      );
      const funds = fundsData.data || [];
      console.log(`  ${funds.length} fondos conceptuales`);

      const seriesRecords = [];

      for (const fund of funds) {
        const seriesData = await fetchWithRetry(
          FINTUAL_API + '/conceptual_assets/' + fund.id + '/real_assets'
        );
        const series = seriesData.data || [];

        for (const serie of series) {
          totalSeries++;

          // Extract RUN
          let run = serie.attributes.run;
          if (!run && serie.attributes.symbol) {
            const match = serie.attributes.symbol.match(/(\d{4,6})/);
            if (match) run = match[1];
          }

          // Handle weird last_price_date format (sometimes it's an object)
          let lastPriceDate = serie.attributes.last_day;
          let lastPrice = serie.attributes.last_value;

          // If last_day is an object, extract the date field
          if (typeof lastPriceDate === 'object' && lastPriceDate !== null) {
            lastPriceDate = lastPriceDate.date || null;
          }

          // Validate date format (YYYY-MM-DD)
          if (lastPriceDate && !/^\d{4}-\d{2}-\d{2}$/.test(lastPriceDate)) {
            lastPriceDate = null;
          }

          seriesRecords.push({
            fintual_id: serie.id,
            conceptual_asset_id: fund.id,
            provider_id: provider.id,
            provider_name: provider.attributes.name,
            fund_name: fund.attributes.name,
            serie_name: serie.attributes.name,
            symbol: serie.attributes.symbol || null,
            run: run || null,
            currency: serie.attributes.currency || 'CLP',
            last_price: typeof lastPrice === 'number' ? lastPrice : null,
            last_price_date: lastPriceDate || null,
            expense_ratio: serie.attributes.expense_ratio || null
          });
        }
      }

      // Insert batch to Supabase
      if (seriesRecords.length > 0) {
        // Insert in smaller batches
        for (let j = 0; j < seriesRecords.length; j += 50) {
          const batch = seriesRecords.slice(j, j + 50);
          try {
            await supabaseUpsert(batch);
            insertedSeries += batch.length;
          } catch (err) {
            console.log(`  Error inserting batch: ${err.message}`);
          }
        }
        console.log(`  ${seriesRecords.length} series → Supabase ✓`);
      }

    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log('Total series encontradas:', totalSeries);
  console.log('Series insertadas:', insertedSeries);
}

syncMain().catch(console.error);
