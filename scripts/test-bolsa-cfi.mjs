import { config } from 'dotenv';
config({ path: '.env.local' });

const BOLSA_SANTIAGO_BASE_URL = "https://startup.bolsadesantiago.com/api/consulta";
const API_TOKEN = process.env.BOLSA_SANTIAGO_API_TOKEN;

console.log('Token exists:', !!API_TOKEN);
console.log('Token length:', API_TOKEN?.length);

async function makeRequest(endpoint, body = {}) {
  const url = `${BOLSA_SANTIAGO_BASE_URL}${endpoint}`;
  console.log('Calling:', url);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    console.log('Status:', response.status, response.statusText);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fetch error:', error.message);
    return null;
  }
}

// Test 1: Resumen accion
console.log('\n=== Test 1: getResumenAccion CFIBAIN11A ===');
const resumen = await makeRequest("/TickerOnDemand/getResumenAccion", { Nemo: "CFIBAIN11A" });
console.log(JSON.stringify(resumen, null, 2));

// Test 2: Historical prices (last 30 days)
const to = new Date().toISOString().split("T")[0];
const fromD = new Date(Date.now() - 30*24*60*60*1000).toISOString().split("T")[0];
const [y1,m1,d1] = fromD.split('-');
const [y2,m2,d2] = to.split('-');
console.log('\n=== Test 2: getPointHistGAT CFIBAIN11A ===');
console.log('From:', `${d1}-${m1}-${y1}`, 'To:', `${d2}-${m2}-${y2}`);
const hist = await makeRequest("/TickerOnDemand/getPointHistGAT", {
  Nemo: "CFIBAIN11A",
  FechaDesde: `${d1}-${m1}-${y1}`,
  FechaHasta: `${d2}-${m2}-${y2}`,
  TipoVal: "ALL",
});
if (hist?.listaResult) {
  console.log('Got', hist.listaResult.length, 'price points');
  if (hist.listaResult.length > 0) {
    console.log('First:', JSON.stringify(hist.listaResult[0]));
    console.log('Last:', JSON.stringify(hist.listaResult[hist.listaResult.length - 1]));
  }
} else {
  console.log('No listaResult. Full response:', JSON.stringify(hist, null, 2));
}

// Test 3: Try alternative endpoint
console.log('\n=== Test 3: getSerieHistorica CFIBAIN11A ===');
const hist2 = await makeRequest("/ClienteHistorico/getSerieHistorica", {
  Nemo: "CFIBAIN11A",
  FechaDesde: `${d1}-${m1}-${y1}`,
  FechaHasta: `${d2}-${m2}-${y2}`,
});
if (hist2?.listaResult) {
  console.log('Got', hist2.listaResult.length, 'price points');
  if (hist2.listaResult.length > 0) {
    console.log('First:', JSON.stringify(hist2.listaResult[0]));
    console.log('Last:', JSON.stringify(hist2.listaResult[hist2.listaResult.length - 1]));
  }
} else {
  console.log('No listaResult. Full response:', JSON.stringify(hist2, null, 2));
}
