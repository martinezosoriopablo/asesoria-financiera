// src/lib/risk/benchmark_map.ts

// -------------------------------------------------------------------
// Tipos comunes
// -------------------------------------------------------------------

export interface FundOption {
  id: string;
  name: string;
  provider: string;
  platform?: "Stonex" | "Allfunds" | "Otro";
  currency?: string;
  isin?: string;
}

// -------------------------------------------------------------------
// EQUITY
// -------------------------------------------------------------------

export type EquityBlockId =
  | "equity_chile"
  | "equity_latam_ex_chile"
  | "equity_usa"
  | "equity_europe"
  | "equity_asia_dev"
  | "equity_emergentes";

export interface EquityBenchmarkDefinition {
  id: EquityBlockId;
  label: string;
  region: string;
  indexName: string;
  indexProvider: string;
  indexCode?: string;
  compatibleFunds?: FundOption[];
}

export const EQUITY_BENCHMARKS: EquityBenchmarkDefinition[] = [
  {
    id: "equity_chile",
    label: "Acciones Chile",
    region: "Chile",
    indexName: "S&P IPSA TR CLP",
    indexProvider: "S&P Dow Jones Indices",
    indexCode: "IPSA",
    compatibleFunds: [
      {
        id: "eq_cl_fondo_local_1",
        name: "Fondo Acciones Chile A",
        provider: "Gestora Local",
        platform: "Allfunds",
        currency: "CLP",
        isin: "CL0000000001", // Fondo local chileno - ver catálogo CMF
      },
    ],
  },
  {
    id: "equity_latam_ex_chile",
    label: "Acciones LatAm ex Chile",
    region: "LatAm ex Chile",
    indexName: "MSCI EM Latin America NR USD",
    indexProvider: "MSCI",
    indexCode: "M1LAT",
    compatibleFunds: [
      {
        id: "eq_latam_fund_1",
        name: "BlackRock Latin American Fund",
        provider: "BlackRock",
        platform: "Stonex",
        currency: "USD",
        isin: "LU0399010613",
      },
    ],
  },
  {
    id: "equity_usa",
    label: "Acciones USA",
    region: "Estados Unidos",
    indexName: "MSCI USA NR USD",
    indexProvider: "MSCI",
    indexCode: "M1US",
    compatibleFunds: [
      {
        id: "eq_usa_vanguard",
        name: "Vanguard U.S. 500 Stock Index Fund",
        provider: "Vanguard",
        platform: "Stonex",
        currency: "USD",
        isin: "IE00B19Z9505",
      },
      {
        id: "eq_usa_jpm",
        name: "JPMorgan US Growth Fund",
        provider: "J.P. Morgan AM",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0073232471",
      },
    ],
  },
  {
    id: "equity_europe",
    label: "Acciones Europa",
    region: "Europa desarrollada",
    indexName: "MSCI Europe NR EUR",
    indexProvider: "MSCI",
    indexCode: "M1EU",
    compatibleFunds: [
      {
        id: "eq_eur_comgest",
        name: "Comgest Growth Europe",
        provider: "Comgest",
        platform: "Allfunds",
        currency: "EUR",
        isin: "LU0119750205",
      },
      {
        id: "eq_eur_mfs",
        name: "MFS Meridian European Value Fund",
        provider: "MFS",
        platform: "Allfunds",
        currency: "EUR",
        isin: "LU0256839274",
      },
    ],
  },
  {
    id: "equity_asia_dev",
    label: "Acciones Asia desarrollada",
    region: "Asia desarrollada (Japón, Australia, etc.)",
    indexName: "MSCI Pacific NR USD",
    indexProvider: "MSCI",
    indexCode: "M1PA",
    compatibleFunds: [
      {
        id: "eq_asia_jpm",
        name: "JPMorgan Asia Growth Fund",
        provider: "J.P. Morgan AM",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0169518387",
      },
    ],
  },
  {
    id: "equity_emergentes",
    label: "Acciones mercados emergentes",
    region: "Emergentes global",
    indexName: "MSCI Emerging Markets NR USD",
    indexProvider: "MSCI",
    indexCode: "M1EF",
    compatibleFunds: [
      {
        id: "eq_em_jpm",
        name: "JPMorgan Emerging Markets Equity Fund",
        provider: "J.P. Morgan AM",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0602539867",
      },
      {
        id: "eq_em_templeton",
        name: "Templeton Emerging Markets Fund",
        provider: "Franklin Templeton",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0040507039",
      },
    ],
  },
];

// -------------------------------------------------------------------
// RENTA FIJA
// -------------------------------------------------------------------

export type FixedIncomeBlockId =
  | "fi_chile_short"
  | "fi_chile_long"
  | "fi_global_ig"
  | "fi_global_hy"
  | "fi_inflation_linked";

export interface FixedIncomeBenchmarkDefinition {
  id: FixedIncomeBlockId;
  label: string;
  description: string;
  indexName: string;
  indexProvider: string;
  indexCode?: string;
  compatibleFunds?: FundOption[];
}

export const FIXED_INCOME_BENCHMARKS: FixedIncomeBenchmarkDefinition[] = [
  {
    id: "fi_chile_short",
    label: "Renta fija Chile corto plazo",
    description: "Bonos y depósitos en CLP/UF de corta duración.",
    indexName: "Índice bonos gobierno CLP 1–3 años (proxy)",
    indexProvider: "Mercado local",
    compatibleFunds: [
      {
        id: "fi_cl_short_fondo_1",
        name: "Fondo Deuda Local Corto Plazo",
        provider: "Gestora Local",
        platform: "Allfunds",
        currency: "CLP",
        isin: "CL0000000002", // Fondo local chileno - ver catálogo CMF
      },
    ],
  },
  {
    id: "fi_chile_long",
    label: "Renta fija Chile largo plazo",
    description: "Bonos gobierno y corporativos largo plazo CLP/UF.",
    indexName: "Índice bonos gobierno UF 5+ años (proxy)",
    indexProvider: "Mercado local",
    compatibleFunds: [
      {
        id: "fi_cl_long_fondo_1",
        name: "Fondo Renta Fija Largo Plazo UF",
        provider: "Gestora Local",
        platform: "Allfunds",
        currency: "CLP",
        isin: "CL0000000003", // Fondo local chileno - ver catálogo CMF
      },
    ],
  },
  {
    id: "fi_global_ig",
    label: "Renta fija global IG",
    description: "Bonos investment grade global (gobierno + corporativo).",
    indexName: "Bloomberg Global Aggregate TR USD (hedged o unhedged)",
    indexProvider: "Bloomberg",
    compatibleFunds: [
      {
        id: "fi_global_ig_pimco",
        name: "PIMCO GIS Income Fund",
        provider: "PIMCO",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0133806256",
      },
      {
        id: "fi_global_ig_capgroup",
        name: "Capital Group Global Bond Fund",
        provider: "Capital Group",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU1670720629",
      },
    ],
  },
  {
    id: "fi_global_hy",
    label: "High Yield global",
    description: "Bonos de alto rendimiento (high yield).",
    indexName: "Bloomberg Global High Yield TR USD",
    indexProvider: "Bloomberg",
    compatibleFunds: [
      {
        id: "fi_global_hy_robeco",
        name: "Robeco High Yield Bonds",
        provider: "Robeco",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0592907462",
      },
      {
        id: "fi_global_hy_trowe",
        name: "T. Rowe Price Global High Income Bond",
        provider: "T. Rowe Price",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0138643068",
      },
    ],
  },
  {
    id: "fi_inflation_linked",
    label: "Bonos ligados a inflación",
    description: "Soberanos indexados a inflación (TIPS / UF).",
    indexName: "Bloomberg Global Inflation-Linked TR",
    indexProvider: "Bloomberg",
    compatibleFunds: [
      {
        id: "fi_inflation_linked_ishares",
        name: "iShares Global Inflation-Linked Bond UCITS ETF",
        provider: "BlackRock",
        platform: "Stonex",
        currency: "USD",
        isin: "IE00B1FZS798",
      },
    ],
  },
];

// -------------------------------------------------------------------
// ALTERNATIVOS
// -------------------------------------------------------------------

export type AlternativeBlockId =
  | "alt_real_estate"
  | "alt_infrastructure"
  | "alt_others";

export interface AlternativeBenchmarkDefinition {
  id: AlternativeBlockId;
  label: string;
  description: string;
  indexName: string;
  indexProvider: string;
  indexCode?: string;
  compatibleFunds?: FundOption[];
}

export const ALTERNATIVE_BENCHMARKS: AlternativeBenchmarkDefinition[] = [
  {
    id: "alt_real_estate",
    label: "Real estate listado",
    description: "REITs globales o fondos inmobiliarios listados.",
    indexName: "FTSE EPRA Nareit Developed NR",
    indexProvider: "FTSE Russell",
    compatibleFunds: [
      {
        id: "alt_reit_janus",
        name: "Janus Henderson Global Property Equities",
        provider: "Janus Henderson",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0705260189",
      },
    ],
  },
  {
    id: "alt_infrastructure",
    label: "Infraestructura",
    description: "Infraestructura global listada (utilities, transporte, etc.).",
    indexName: "FTSE Global Core Infrastructure 50/50",
    indexProvider: "FTSE Russell",
    compatibleFunds: [
      {
        id: "alt_infra_dws",
        name: "DWS Invest Global Infrastructure",
        provider: "DWS",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU1434519846",
      },
    ],
  },
  {
    id: "alt_others",
    label: "Otros alternativos",
    description:
      "Estrategias alternativas diversas (multiestrategia, market neutral, etc.).",
    indexName: "HFRX Global Hedge Fund Index (proxy)",
    indexProvider: "HFR",
    compatibleFunds: [
      {
        id: "alt_otros_man",
        name: "Man AHL Trend Alternative",
        provider: "Man Group",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0599946893",
      },
      {
        id: "alt_otros_bsf",
        name: "BlackRock Strategic Funds - Global Event Driven",
        provider: "BlackRock",
        platform: "Allfunds",
        currency: "USD",
        isin: "LU0490817821",
      },
    ],
  },
];
