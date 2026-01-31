// Base de datos de ETFs populares con datos reales
// Fuente: ETF.com, Morningstar, sitios oficiales
// Actualizado: Diciembre 2024

export const ETF_DATABASE: {
  [ticker: string]: {
    name: string;
    expenseRatio: number; // En porcentaje
    dividendYield: number; // En porcentaje
    category: string;
  };
} = {
  // S&P 500
  SPY: {
    name: "SPDR S&P 500 ETF Trust",
    expenseRatio: 0.09,
    dividendYield: 1.31,
    category: "Large Cap Blend",
  },
  VOO: {
    name: "Vanguard S&P 500 ETF",
    expenseRatio: 0.03,
    dividendYield: 1.30,
    category: "Large Cap Blend",
  },
  IVV: {
    name: "iShares Core S&P 500 ETF",
    expenseRatio: 0.03,
    dividendYield: 1.29,
    category: "Large Cap Blend",
  },

  // Total Market
  VTI: {
    name: "Vanguard Total Stock Market ETF",
    expenseRatio: 0.03,
    dividendYield: 1.34,
    category: "Large Cap Blend",
  },
  ITOT: {
    name: "iShares Core S&P Total U.S. Stock Market ETF",
    expenseRatio: 0.03,
    dividendYield: 1.32,
    category: "Large Cap Blend",
  },

  // Nasdaq / Tech
  QQQ: {
    name: "Invesco QQQ Trust",
    expenseRatio: 0.20,
    dividendYield: 0.52,
    category: "Large Cap Growth",
  },
  QQQM: {
    name: "Invesco NASDAQ 100 ETF",
    expenseRatio: 0.15,
    dividendYield: 0.51,
    category: "Large Cap Growth",
  },

  // Growth
  VUG: {
    name: "Vanguard Growth ETF",
    expenseRatio: 0.04,
    dividendYield: 0.58,
    category: "Large Cap Growth",
  },
  IWF: {
    name: "iShares Russell 1000 Growth ETF",
    expenseRatio: 0.19,
    dividendYield: 0.62,
    category: "Large Cap Growth",
  },

  // Value
  VTV: {
    name: "Vanguard Value ETF",
    expenseRatio: 0.04,
    dividendYield: 2.18,
    category: "Large Cap Value",
  },
  IWD: {
    name: "iShares Russell 1000 Value ETF",
    expenseRatio: 0.19,
    dividendYield: 2.05,
    category: "Large Cap Value",
  },

  // Small Cap
  IWM: {
    name: "iShares Russell 2000 ETF",
    expenseRatio: 0.19,
    dividendYield: 1.12,
    category: "Small Cap Blend",
  },
  VB: {
    name: "Vanguard Small-Cap ETF",
    expenseRatio: 0.05,
    dividendYield: 1.25,
    category: "Small Cap Blend",
  },

  // International
  VEA: {
    name: "Vanguard FTSE Developed Markets ETF",
    expenseRatio: 0.05,
    dividendYield: 3.02,
    category: "Foreign Large Blend",
  },
  IEFA: {
    name: "iShares Core MSCI EAFE ETF",
    expenseRatio: 0.07,
    dividendYield: 2.98,
    category: "Foreign Large Blend",
  },
  EFA: {
    name: "iShares MSCI EAFE ETF",
    expenseRatio: 0.32,
    dividendYield: 3.15,
    category: "Foreign Large Blend",
  },

  // Emerging Markets
  VWO: {
    name: "Vanguard FTSE Emerging Markets ETF",
    expenseRatio: 0.08,
    dividendYield: 3.25,
    category: "Diversified Emerging Mkts",
  },
  IEMG: {
    name: "iShares Core MSCI Emerging Markets ETF",
    expenseRatio: 0.09,
    dividendYield: 3.18,
    category: "Diversified Emerging Mkts",
  },
  EEM: {
    name: "iShares MSCI Emerging Markets ETF",
    expenseRatio: 0.68,
    dividendYield: 2.95,
    category: "Diversified Emerging Mkts",
  },

  // Bonds
  AGG: {
    name: "iShares Core U.S. Aggregate Bond ETF",
    expenseRatio: 0.03,
    dividendYield: 3.45,
    category: "Intermediate Core Bond",
  },
  BND: {
    name: "Vanguard Total Bond Market ETF",
    expenseRatio: 0.03,
    dividendYield: 3.52,
    category: "Intermediate Core Bond",
  },
  TLT: {
    name: "iShares 20+ Year Treasury Bond ETF",
    expenseRatio: 0.15,
    dividendYield: 4.12,
    category: "Long Government",
  },
  SHY: {
    name: "iShares 1-3 Year Treasury Bond ETF",
    expenseRatio: 0.15,
    dividendYield: 3.85,
    category: "Short Government",
  },

  // Sector - Technology
  XLK: {
    name: "Technology Select Sector SPDR Fund",
    expenseRatio: 0.10,
    dividendYield: 0.68,
    category: "Technology",
  },
  VGT: {
    name: "Vanguard Information Technology ETF",
    expenseRatio: 0.10,
    dividendYield: 0.62,
    category: "Technology",
  },

  // Sector - Healthcare
  XLV: {
    name: "Health Care Select Sector SPDR Fund",
    expenseRatio: 0.10,
    dividendYield: 1.35,
    category: "Health",
  },
  VHT: {
    name: "Vanguard Health Care ETF",
    expenseRatio: 0.10,
    dividendYield: 1.28,
    category: "Health",
  },

  // Sector - Financials
  XLF: {
    name: "Financial Select Sector SPDR Fund",
    expenseRatio: 0.10,
    dividendYield: 1.95,
    category: "Financial",
  },
  VFH: {
    name: "Vanguard Financials ETF",
    expenseRatio: 0.10,
    dividendYield: 1.88,
    category: "Financial",
  },

  // Sector - Energy
  XLE: {
    name: "Energy Select Sector SPDR Fund",
    expenseRatio: 0.10,
    dividendYield: 3.42,
    category: "Equity Energy",
  },
  VDE: {
    name: "Vanguard Energy ETF",
    expenseRatio: 0.10,
    dividendYield: 3.35,
    category: "Equity Energy",
  },

  // Sector - Real Estate
  VNQ: {
    name: "Vanguard Real Estate ETF",
    expenseRatio: 0.12,
    dividendYield: 3.85,
    category: "Real Estate",
  },
  IYR: {
    name: "iShares U.S. Real Estate ETF",
    expenseRatio: 0.40,
    dividendYield: 3.62,
    category: "Real Estate",
  },

  // Commodities
  GLD: {
    name: "SPDR Gold Shares",
    expenseRatio: 0.40,
    dividendYield: 0.00,
    category: "Commodities Precious Metals",
  },
  IAU: {
    name: "iShares Gold Trust",
    expenseRatio: 0.25,
    dividendYield: 0.00,
    category: "Commodities Precious Metals",
  },
  SLV: {
    name: "iShares Silver Trust",
    expenseRatio: 0.50,
    dividendYield: 0.00,
    category: "Commodities Precious Metals",
  },

  // Dividend
  VYM: {
    name: "Vanguard High Dividend Yield ETF",
    expenseRatio: 0.06,
    dividendYield: 2.85,
    category: "Large Cap Value",
  },
  SCHD: {
    name: "Schwab U.S. Dividend Equity ETF",
    expenseRatio: 0.06,
    dividendYield: 3.42,
    category: "Large Cap Value",
  },
  DVY: {
    name: "iShares Select Dividend ETF",
    expenseRatio: 0.38,
    dividendYield: 3.28,
    category: "Large Cap Value",
  },

  // ESG
  ESGU: {
    name: "iShares MSCI USA ESG Optimized ETF",
    expenseRatio: 0.15,
    dividendYield: 1.22,
    category: "Large Cap Blend",
  },
  VSGX: {
    name: "Vanguard ESG U.S. Stock ETF",
    expenseRatio: 0.09,
    dividendYield: 1.18,
    category: "Large Cap Blend",
  },

  // ARK Innovation
  ARKK: {
    name: "ARK Innovation ETF",
    expenseRatio: 0.75,
    dividendYield: 0.00,
    category: "Miscellaneous Sector",
  },
  ARKW: {
    name: "ARK Next Generation Internet ETF",
    expenseRatio: 0.75,
    dividendYield: 0.00,
    category: "Miscellaneous Sector",
  },
};

// Helper function para obtener datos del ETF
export function getETFData(ticker: string) {
  const upperTicker = ticker.toUpperCase();
  return ETF_DATABASE[upperTicker] || null;
}

// Helper function para buscar ETFs por categoría
export function getETFsByCategory(category: string) {
  return Object.entries(ETF_DATABASE)
    .filter(([_, data]) => data.category === category)
    .map(([ticker, data]) => ({ ticker, ...data }));
}

// Lista de todos los tickers disponibles
export const AVAILABLE_ETFS = Object.keys(ETF_DATABASE);

// Categorías disponibles
export const ETF_CATEGORIES = [
  "Large Cap Blend",
  "Large Cap Growth",
  "Large Cap Value",
  "Small Cap Blend",
  "Foreign Large Blend",
  "Diversified Emerging Mkts",
  "Intermediate Core Bond",
  "Long Government",
  "Short Government",
  "Technology",
  "Health",
  "Financial",
  "Equity Energy",
  "Real Estate",
  "Commodities Precious Metals",
  "Miscellaneous Sector",
];
