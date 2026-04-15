// scripts/sync-fintual.js
// Script para sincronizar fondos desde Fintual API

const FINTUAL_API = 'https://fintual.cl/api';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) return { data: [] };
        if (res.status === 429) {
          // Rate limited - wait longer
          const waitTime = 5000 * (i + 1);
          console.log(`  Rate limited, esperando ${waitTime/1000}s...`);
          await sleep(waitTime);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      if (text.startsWith('<!')) {
        // HTML response = rate limited
        await sleep(3000 * (i + 1));
        continue;
      }
      return JSON.parse(text);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
  return { data: [] };
}

async function syncFunds() {
  // Get all providers
  console.log('Obteniendo proveedores...');
  const providersData = await fetchWithRetry(FINTUAL_API + '/asset_providers');
  const providers = providersData.data;
  console.log('Total proveedores:', providers.length);

  // Filter Chilean AGFs
  const chileanKeywords = ['agf', 'bci', 'santander', 'itau', 'itaú', 'security', 'banchile',
    'larrainvial', 'larrain', 'sura', 'principal', 'scotiabank', 'credicorp', 'btg', 'bice',
    'fintual', 'bancoestado', 'compass', 'euroamerica', 'zurich', 'moneda', 'nevasa', 'scotia',
    'toesca', 'asset', 'chile', 'capital', 'vision', 'renta', 'inversiones'];

  const chileanProviders = providers.filter(p => {
    const name = p.attributes.name.toLowerCase();
    return chileanKeywords.some(k => name.includes(k));
  });

  console.log('AGFs chilenas:', chileanProviders.length);

  let totalFunds = 0;
  let totalSeries = 0;
  const allFunds = [];
  let providerCount = 0;

  for (const provider of chileanProviders) {
    providerCount++;
    try {
      // Get funds for this provider
      await sleep(1500); // Rate limit - conservative
      const fundsData = await fetchWithRetry(FINTUAL_API + '/asset_providers/' + provider.id + '/conceptual_assets');
      const funds = fundsData.data || [];

      for (const fund of funds) {
        totalFunds++;

        // Get series for this fund
        await sleep(800); // Rate limit
        const seriesData = await fetchWithRetry(FINTUAL_API + '/conceptual_assets/' + fund.id + '/real_assets');
        const series = seriesData.data || [];

        for (const serie of series) {
          totalSeries++;

          // Extract RUN from symbol
          let run = serie.attributes.run;
          if (!run && serie.attributes.symbol) {
            const match = serie.attributes.symbol.match(/(\d{4,6})/);
            if (match) run = match[1];
          }

          allFunds.push({
            fintual_id: serie.id,
            conceptual_asset_id: fund.id,
            provider_id: provider.id,
            provider_name: provider.attributes.name,
            fund_name: fund.attributes.name,
            serie_name: serie.attributes.name,
            symbol: serie.attributes.symbol || null,
            run: run || null,
            currency: serie.attributes.currency || 'CLP',
            last_price: serie.attributes.last_value || null,
            last_price_date: serie.attributes.last_day || null,
            expense_ratio: serie.attributes.expense_ratio || null
          });
        }
      }

      console.log(`[${providerCount}/${chileanProviders.length}] ${provider.attributes.name}: ${funds.length} fondos`);
    } catch (err) {
      console.error(`[${providerCount}/${chileanProviders.length}] Error con ${provider.attributes.name}:`, err.message);
    }
  }

  console.log('\n\nTotal fondos conceptuales:', totalFunds);
  console.log('Total series:', totalSeries);

  // Save to file for inspection
  const fs = require('fs');
  fs.writeFileSync('temp_fintual_funds.json', JSON.stringify(allFunds, null, 2));
  console.log('\nGuardado en temp_fintual_funds.json');

  // Show sample with expense_ratio
  const withExpenseRatio = allFunds.filter(f => f.expense_ratio !== null);
  console.log('\nFondos con expense_ratio:', withExpenseRatio.length);

  if (withExpenseRatio.length > 0) {
    console.log('\nEjemplo con costos:');
    console.log(JSON.stringify(withExpenseRatio[0], null, 2));
  }

  return allFunds;
}

syncFunds().catch(console.error);
