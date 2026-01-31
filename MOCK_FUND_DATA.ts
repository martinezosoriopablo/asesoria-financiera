// EJEMPLO DE DATOS MOCK PARA TESTING SIN SUBIR PDF
// Úsalo temporalmente mientras configuras el Claude API

export const MOCK_FUND_DATA = {
  nombre: "Morgan Stanley Global Brands Fund",
  manager: "William Lock",
  experiencia_anos: 33,
  aum: 20200000000, // $20.2B
  benchmark: "MSCI World Net Index",
  alpha: -6.73,
  beta: 0.78,
  sharpe_ratio: null,
  tracking_error: 6.94,
  information_ratio: -1.40,
  r_squared: 0.76,
  expense_ratio: 1.84,
  dividend_yield: 1.31,
  inception_date: "30 Oct 2000",
  retornos: {
    "1y": { fondo: 3.34, benchmark: 15.68 },
    "3y": { fondo: 8.82, benchmark: 18.50 },
    "5y": { fondo: 5.73, benchmark: 12.89 },
    "10y": { fondo: 9.63, benchmark: 11.65 },
  },
  sectors: {
    fondo: {
      "Financiero": 25.59,
      "Tecnología": 24.63,
      "Consumo Estable": 13.94,
      "Industrial": 13.33,
      "Salud": 12.80,
      "Consumo Discrecional": 4.52,
      "Comunicación": 3.37,
      "Efectivo": 1.76,
    },
    benchmark: {
      "Tecnología": 26.28,
      "Financiero": 17.19,
      "Salud": 9.32,
      "Industrial": 11.29,
      "Consumo Discrecional": 10.35,
      "Comunicación": 8.50,
      "Consumo Estable": 5.72,
      "Energía": 3.54,
      "Materiales": 3.26,
      "Inmobiliario": 1.98,
      "Servicios Públicos": 2.57,
    },
  },
  holdings: [
    { ticker: "MSFT", name: "Microsoft Corp", fondo: 8.46, benchmark: 4.58 },
    { ticker: "SAP", name: "SAP SE", fondo: 7.66, benchmark: 0.36 },
    { ticker: "V", name: "Visa Inc", fondo: 6.53, benchmark: 0.77 },
    { ticker: "OR", name: "L'Oréal S.A.", fondo: 5.26, benchmark: 0.14 },
    { ticker: "AJG", name: "Arthur J Gallagher & Co.", fondo: 3.94, benchmark: 0.10 },
    { ticker: "KO", name: "Coca-Cola Co.", fondo: 3.81, benchmark: 0.36 },
    { ticker: "RELX", name: "RELX Plc", fondo: 3.76, benchmark: 0.11 },
    { ticker: "PG", name: "Procter & Gamble", fondo: 3.51, benchmark: 0.47 },
    { ticker: "AON", name: "Aon plc", fondo: 3.43, benchmark: 0.10 },
    { ticker: "GOOGL", name: "Alphabet Inc", fondo: 3.37, benchmark: 2.93 },
  ],
  historical: generateHistoricalData(),
  active_share: 87.02,
  num_posiciones: 33,
};

// Genera datos históricos sintéticos basados en los retornos
function generateHistoricalData() {
  const data = [];
  const monthsBack = 60; // 5 años de datos mensuales
  const today = new Date();

  // Retorno anualizado de 5 años
  const fondoReturn = 5.73 / 100; // 5.73% anual
  const benchmarkReturn = 12.89 / 100; // 12.89% anual

  // Calcular retorno mensual
  const fondoMonthlyReturn = Math.pow(1 + fondoReturn, 1 / 12) - 1;
  const benchmarkMonthlyReturn = Math.pow(1 + benchmarkReturn, 1 / 12) - 1;

  let fondoValue = 100;
  let benchmarkValue = 100;

  for (let i = monthsBack; i >= 0; i--) {
    const date = new Date(today);
    date.setMonth(date.getMonth() - i);

    // Agregar volatilidad aleatoria
    const fondoVolatility = (Math.random() - 0.5) * 0.04; // ±2%
    const benchmarkVolatility = (Math.random() - 0.5) * 0.03; // ±1.5%

    fondoValue *= 1 + fondoMonthlyReturn + fondoVolatility;
    benchmarkValue *= 1 + benchmarkMonthlyReturn + benchmarkVolatility;

    data.push({
      date: date.toISOString().split("T")[0],
      fondo: parseFloat(fondoValue.toFixed(2)),
      benchmark: parseFloat(benchmarkValue.toFixed(2)),
    });
  }

  return data;
}

// ============================================
// CÓMO USAR ESTOS DATOS MOCK
// ============================================

/*
OPCIÓN 1: Para testing rápido sin API

En AnalizadorFondos.tsx, agrega un botón:

<button 
  onClick={() => setFundData(MOCK_FUND_DATA)}
  className="px-6 py-3 bg-purple-600 text-white rounded-xl"
>
  Cargar Ejemplo Morgan Stanley
</button>


OPCIÓN 2: Para development mientras configuras API

En analyze-fund-route.ts, retorna mock data temporalmente:

export async function POST(request: NextRequest) {
  // Comentar la llamada real a Claude
  // ...
  
  // Retornar mock data
  return NextResponse.json(MOCK_FUND_DATA);
}


OPCIÓN 3: Como fallback si Claude API falla

En analyze-fund-route.ts, catch block:

catch (error) {
  console.error("Error:", error);
  // Retornar mock data como fallback
  return NextResponse.json(MOCK_FUND_DATA);
}

*/

// ============================================
// TESTING CON DATOS REALES
// ============================================

/*
Una vez que tengas Claude API configurado:

1. Sube el PDF de Morgan Stanley que proporcionaste
2. Compara el output de Claude vs estos datos mock
3. Ajusta el prompt de Claude si es necesario
4. Elimina el botón de mock data

Los datos mock están basados en el PDF real que subiste,
así que deberían coincidir bastante bien.
*/
