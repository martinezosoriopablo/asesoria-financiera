import { config } from 'dotenv';
config({ path: '.env.local' });

const token = process.env.BOLSA_SANTIAGO_API_TOKEN;
console.log('Token:', token?.substring(0, 10) + '...');

const base = 'https://apim-apistartupplus-dev.azure-api.net';

async function tryUrl(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Ocp-Apim-Subscription-Key': token },
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.text();
    if (res.status === 404) {
      return null;
    }
    console.log(`  ${url} → ${res.status}: ${body.substring(0, 300)}`);
    return res.status;
  } catch (e) {
    return null;
  }
}

async function main() {
  const products = [
    'api-free-trial', 'free-trial', 'api-renta-variable', 'renta-variable',
    'api-rv', 'api-freetrial', 'freetrial', 'api-bolsa', 'bolsa',
    'apifree', 'api-util', 'util',
  ];
  const endpoints = ['api/Util/Instrumentos', 'Util/Instrumentos', 'api/v1/Util/Instrumentos'];

  console.log('\nProbing product+endpoint combos...');
  for (const product of products) {
    for (const endpoint of endpoints) {
      const url = `${base}/${product}/${endpoint}`;
      const result = await tryUrl(url);
      if (result) {
        console.log(`  FOUND: ${product}/${endpoint} → ${result}`);
      }
    }
  }

  // Also try the server URL exactly as shown in screenshot page 9
  // The screenshot shows: https://apim-apistartupplus-dev.azure-api.net/api-servicio-de-consulta
  // with endpoints under that
  console.log('\nTrying api-servicio-de-consulta prefix with GET...');
  const svcBase = `${base}/api-servicio-de-consulta`;
  for (const endpoint of ['api/Util/Instrumentos', 'api/Util/ResumenAccion?NEMO=CFIBAIN11A&PERIODO=DI&numeroPagina=1', 'Util/Instrumentos']) {
    await tryUrl(`${svcBase}/${endpoint}`);
  }

  // Try POST instead of GET for the original endpoints
  console.log('\nTrying POST to api-servicio-de-consulta...');
  try {
    const res = await fetch(`${svcBase}/api/Util/Instrumentos`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': token, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    console.log(`  POST Instrumentos → ${res.status}: ${(await res.text()).substring(0, 300)}`);
  } catch (e) {
    console.log(`  POST failed: ${e.message}`);
  }

  // Check if there's a swagger/docs endpoint
  console.log('\nChecking for swagger/docs...');
  for (const path of ['/swagger', '/swagger/ui', '/docs', '/api-docs', '/openapi.json']) {
    await tryUrl(`${base}${path}`);
    await tryUrl(`${svcBase}${path}`);
  }
}

main().catch(e => console.error('Fatal:', e));
