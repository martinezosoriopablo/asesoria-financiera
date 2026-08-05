import { describe, it, expect } from "vitest";
import { roleToClase, defaultDecision, resolveMisFondos, deriveCartera, sumaPesos, buildUnresolvedRow, weightedMetrics, buildSectorVistaLookup } from "./resolve";
import { resolveMisInstrumentos } from "./resolve";
import type { ComiteColumn, MiInstrumentoOption, RecomendacionRow } from "./types";

describe("roleToClase", () => {
  it("mapea roles del comité a la clase de cartera_recomendada", () => {
    expect(roleToClase("rv")).toBe("Renta Variable");
    expect(roleToClase("rf")).toBe("Renta Fija");
    expect(roleToClase("alt")).toBe("Alternativos");
    expect(roleToClase("cash")).toBe("Cash");
  });
});

describe("defaultDecision", () => {
  const comite: ComiteColumn = { etf_us: "VOO", etf_ucits: "CSPX", modelo_pct: 22, vista: "UW", conviction: "MEDIA" };
  const fondo: MiInstrumentoOption = { fund_id: "f1", fund_run: "9226", ticker: null, nombre: "FM BCI USA", custodian_type: "agf", tac: 1.2, rent_12m: 8, isMapped: true, tipo: "fund", origen: "preferido", sector: null, vista_comite: null, weight_pct: null };

  it("fondos: con fondo → mi_fondo", () => {
    const d = defaultDecision({ role: "rv", comite, opciones: [fondo], custodio: "agf", vehiculo: "fondos" });
    expect(d.fuente).toBe("mi_fondo");
    expect(d.nombre).toBe("FM BCI USA");
  });

  it("etf: opción etf → comite_etf", () => {
    const etf: MiInstrumentoOption = { fund_id: "etf:VOO", fund_run: null, ticker: "VOO", nombre: "VOO", custodian_type: "internacional", tac: null, rent_12m: null, isMapped: false, tipo: "etf", origen: "comite", sector: null, vista_comite: null, weight_pct: null };
    const d = defaultDecision({ role: "rv", comite, opciones: [etf], custodio: "internacional", vehiculo: "etf" });
    expect(d.fuente).toBe("comite_etf");
    expect(d.ticker).toBe("VOO");
  });

  it("directo: default = mantener lo actual (acción)", () => {
    const actual: MiInstrumentoOption = { fund_id: "hold:AAPL", fund_run: null, ticker: "AAPL", nombre: "Apple", custodian_type: "internacional", tac: null, rent_12m: null, isMapped: false, tipo: "stock", origen: "actual", sector: "technology", vista_comite: "OW", weight_pct: 12 };
    const d = defaultDecision({ role: "rv", comite, opciones: [actual], custodio: "internacional", vehiculo: "directo" });
    expect(d.fuente).toBe("accion");
    expect(d.nombre).toBe("Apple");
    expect(d.sector).toBe("technology");
  });

  it("directo sin opciones → caja (no cae a ETF)", () => {
    const d = defaultDecision({ role: "rv", comite, opciones: [], custodio: "internacional", vehiculo: "directo" });
    expect(d.fuente).toBe("caja");
  });

  it("fondos sin fondo + internacional → ETF del comité (fallback histórico)", () => {
    const d = defaultDecision({ role: "rv", comite, opciones: [], custodio: "internacional", vehiculo: "fondos" });
    expect(d.fuente).toBe("comite_etf");
    expect(d.ticker).toBe("VOO");
  });

  it("fondos sin fondo + AGF → caja", () => {
    const d = defaultDecision({ role: "rv", comite, opciones: [], custodio: "agf", vehiculo: "fondos" });
    expect(d.fuente).toBe("caja");
  });
});

describe("resolveMisFondos", () => {
  const funds = [
    { id: "f1", fund_run: "100", ticker: null, nombre: "AGF USA A", custodian_type: "agf" as const, category: "RV USA", tac: 1.5, rent_12m: 7 },
    { id: "f2", fund_run: "200", ticker: null, nombre: "AGF USA B", custodian_type: "agf" as const, category: "RV Internacional", tac: 0.9, rent_12m: 9 },
    { id: "f3", fund_run: "300", ticker: null, nombre: "Corredora Global", custodian_type: "corredora" as const, category: "RV Global", tac: 0.5, rent_12m: 10 },
  ];

  it("filtra por categoría del comité (PREFERRED_TO_COMITE) y por custodio, ordena mapped primero luego menor TAC", () => {
    const res = resolveMisFondos({
      categoria: "rv_usa_large_cap",
      custodios: ["agf"],
      preferredFunds: funds,
      mappings: [{ categoria: "rv_usa_large_cap", custodian_type: "agf", preferred_fund_id: "f1" }],
    });
    expect(res.map(f => f.fund_id)).toEqual(["f1", "f2"]); // f1 mapped primero; f3 excluido (corredora)
    expect(res[0].isMapped).toBe(true);
    expect(res[1].isMapped).toBe(false);
  });

  it("sin mapeo: solo sugeridos por categoría+custodio, ordenados por TAC", () => {
    const res = resolveMisFondos({ categoria: "rv_usa_large_cap", custodios: ["agf"], preferredFunds: funds, mappings: [] });
    expect(res.map(f => f.fund_id)).toEqual(["f2", "f1"]); // f2 menor TAC
  });

  it("custodio sin fondos → vacío", () => {
    const res = resolveMisFondos({ categoria: "rv_usa_large_cap", custodios: ["internacional"], preferredFunds: funds, mappings: [] });
    expect(res).toEqual([]);
  });

  it("matchea etiquetas largas del asesor contra códigos cortos del comité (Renta Variable USA ↔ RV USA)", () => {
    // Datos reales: advisor_preferred_funds.category usa etiquetas largas
    // ("Renta Variable USA"), no los códigos cortos ("RV USA") de PREFERRED_TO_COMITE.
    const longFunds = [
      { id: "L1", fund_run: "1", ticker: null, nombre: "AGF USA largo", custodian_type: "agf" as const, category: "Renta Variable USA", tac: 1.1, rent_12m: 6 },
      { id: "L2", fund_run: "2", ticker: null, nombre: "AGF Intl largo", custodian_type: "agf" as const, category: "Renta Variable Internacional", tac: 0.8, rent_12m: 7 },
      { id: "L3", fund_run: "3", ticker: null, nombre: "AGF RF largo", custodian_type: "agf" as const, category: "Renta Fija Internacional", tac: 0.5, rent_12m: 4 },
    ];
    // rv_usa_large_cap quiere ["RV Internacional","RV USA","RV Global"] → L1 (USA) + L2 (Internacional); L3 es RF, excluido.
    const res = resolveMisFondos({ categoria: "rv_usa_large_cap", custodios: ["agf"], preferredFunds: longFunds, mappings: [] });
    expect(res.map(f => f.fund_id).sort()).toEqual(["L1", "L2"]);

    // Y una categoría RF matchea la etiqueta larga "Renta Fija Internacional".
    const resRf = resolveMisFondos({ categoria: "rf_ig_corp", custodios: ["agf"], preferredFunds: longFunds, mappings: [] });
    expect(resRf.map(f => f.fund_id)).toEqual(["L3"]);
  });

  it("un FONDO tageado 'Chile' NO matchea ni rv_chile ni rf_chile (fallback de sleeve-label es solo para directo)", () => {
    // Antes de acotar el fallback a includeSleeveLabel=true, "Chile" colapsaba
    // contra el label de rv_chile/rf_chile (ambos quitan el prefijo de rol → "chile")
    // y un fondo tageado así aparecía en Mis Fondos para las DOS categorías.
    const chileFund = [
      { id: "c1", fund_run: "1", ticker: null, nombre: "Fondo Chile", custodian_type: "agf" as const, category: "Chile", tac: 1.0, rent_12m: 5 },
    ];
    expect(resolveMisFondos({ categoria: "rv_chile", custodios: ["agf"], preferredFunds: chileFund, mappings: [] })).toEqual([]);
    expect(resolveMisFondos({ categoria: "rf_chile", custodios: ["agf"], preferredFunds: chileFund, mappings: [] })).toEqual([]);
  });
});

describe("deriveCartera + sumaPesos", () => {
  const rows: RecomendacionRow[] = [
    { categoria: "rv_usa_large_cap", label: "RV USA Large Cap", role: "rv",
      comite: { etf_us: "VOO", etf_ucits: "CSPX", modelo_pct: 60, vista: null, conviction: null },
      misFondos: [], decision: { fuente: "comite_etf", ticker: "VOO", nombre: "VOO", clase: "Renta Variable", custodian_type: "internacional", porcentaje: 60 } },
    { categoria: "cash_tbills", label: "US T-Bills", role: "cash",
      comite: { etf_us: "SGOV", etf_ucits: "ERNS", modelo_pct: 40, vista: null, conviction: null },
      misFondos: [], decision: { fuente: "caja", ticker: null, nombre: "Caja", clase: "Cash", custodian_type: "agf", porcentaje: 40 } },
  ];

  it("deriveCartera produce una fila por decisión con instrumento real", () => {
    const cartera = deriveCartera(rows);
    expect(cartera).toEqual([
      { clase: "Renta Variable", ticker: "VOO", nombre: "VOO", porcentaje: 60 },
      { clase: "Cash", ticker: null, nombre: "Caja", porcentaje: 40 },
    ]);
  });

  it("sumaPesos suma los pesos de las decisiones", () => {
    expect(sumaPesos(rows)).toBe(100);
  });
});

describe("buildUnresolvedRow", () => {
  it("conserva una posición sin categoría con su peso y la marca sin_categoria", () => {
    const row = buildUnresolvedRow("categoria_rara", 7.5);
    expect(row.sin_categoria).toBe(true);
    expect(row.categoria).toBe("categoria_rara");
    expect(row.label).toBe("categoria_rara");
    expect(row.role).toBe("cash"); // sin rol conocido → cash (no infla RV/RF)
    expect(row.decision.fuente).toBe("caja");
    expect(row.decision.porcentaje).toBe(7.5);
    expect(row.comite.modelo_pct).toBe(7.5);
    expect(row.misFondos).toEqual([]);
  });
});

describe("weightedMetrics", () => {
  const mk = (fuente: "mi_fondo" | "caja", porcentaje: number, tac: number | null, rent: number | null): RecomendacionRow => ({
    categoria: "x", label: "x", role: "rv",
    comite: { etf_us: null, etf_ucits: null, modelo_pct: porcentaje, vista: null, conviction: null },
    misFondos: [],
    decision: { fuente, ticker: null, nombre: "n", clase: "Renta Variable", custodian_type: "agf", porcentaje, tac, rent_12m: rent },
  });

  it("pondera TAC/rent solo sobre las filas con dato y reporta cobertura", () => {
    const rows = [mk("mi_fondo", 60, 1.0, 8), mk("mi_fondo", 20, 2.0, 4), mk("caja", 20, null, null)];
    const r = weightedMetrics(rows);
    // TAC ponderado sobre 80%: (1.0*60 + 2.0*20)/80 = 1.25
    expect(r.tac).toBeCloseTo(1.25, 4);
    // rent ponderada sobre 80%: (8*60 + 4*20)/80 = 7
    expect(r.rent12m).toBeCloseTo(7, 4);
    expect(r.coverage).toBeCloseTo(0.8, 4); // 80 de 100
  });

  it("sin filas con dato → null y cobertura 0", () => {
    const r = weightedMetrics([mk("caja", 100, null, null)]);
    expect(r.tac).toBeNull();
    expect(r.rent12m).toBeNull();
    expect(r.coverage).toBe(0);
  });
});

describe("resolveMisInstrumentos", () => {
  const preferred = [
    { id: "f1", fund_run: "100", ticker: null, nombre: "AGF USA", custodian_type: "agf" as const, category: "RV USA", tac: 1.2, rent_12m: 7, instrument_type: "fund" as const, sector: null },
    { id: "s1", fund_run: null, ticker: "NVDA", nombre: "Nvidia", custodian_type: "internacional" as const, category: "RV USA", tac: null, rent_12m: null, instrument_type: "stock" as const, sector: "technology" },
    { id: "b1", fund_run: null, ticker: "912828XY9", nombre: "UST 2030", custodian_type: "internacional" as const, category: "UST belly", tac: null, rent_12m: null, instrument_type: "bond" as const, sector: null },
  ];
  const sectorVista = (s: string | null) => (s === "technology" ? "OW" : null);

  it("vehículo fondos → solo fondos preferidos (ignora acciones/bonos)", () => {
    const r = resolveMisInstrumentos({ sleeveId: "rv_usa_large_cap", role: "rv", vehiculo: "fondos", custodios: ["agf"], preferred, currentDirect: [], comiteEtfUs: "VOO", comiteEtfUcits: "CSPX", bondVista: null, sectorVista, mappings: [] });
    expect(r.map(o => o.fund_id)).toEqual(["f1"]);
    expect(r[0].tipo ?? "fund").toBe("fund");
  });

  it("vehículo etf → el ETF del comité", () => {
    const r = resolveMisInstrumentos({ sleeveId: "rv_usa_large_cap", role: "rv", vehiculo: "etf", custodios: ["internacional"], preferred, currentDirect: [], comiteEtfUs: "VOO", comiteEtfUcits: "CSPX", bondVista: null, sectorVista, mappings: [] });
    expect(r).toHaveLength(1);
    expect(r[0].ticker).toBe("VOO");
    expect(r[0].tipo).toBe("etf");
    expect(r[0].origen).toBe("comite");
  });

  it("vehículo directo RV → holdings actuales + acciones preferidas, tageadas con vista de sector", () => {
    const current = [{ ticker: "AAPL", nombre: "Apple", tipo: "stock" as const, sector: "technology", weight_pct: 12, custodian_type: "internacional" as const }];
    const r = resolveMisInstrumentos({ sleeveId: "rv_usa_large_cap", role: "rv", vehiculo: "directo", custodios: ["internacional"], preferred, currentDirect: current, comiteEtfUs: "VOO", comiteEtfUcits: "CSPX", bondVista: null, sectorVista, mappings: [] });
    // primero el actual (para "mantener"), luego la preferida
    expect(r.map(o => o.ticker)).toEqual(["AAPL", "NVDA"]);
    expect(r[0].origen).toBe("actual");
    expect(r[0].weight_pct).toBe(12);
    expect(r[0].vista_comite).toBe("OW");   // tech OW
    expect(r[1].origen).toBe("preferido");
    expect(r[1].vista_comite).toBe("OW");
  });

  it("vehículo directo RF → bonos, tageados con la vista de duración del sleeve", () => {
    const r = resolveMisInstrumentos({ sleeveId: "rf_ust_belly", role: "rf", vehiculo: "directo", custodios: ["internacional"], preferred, currentDirect: [], comiteEtfUs: "IEF", comiteEtfUcits: "IDTM", bondVista: "N", sectorVista, mappings: [] });
    expect(r.map(o => o.ticker)).toEqual(["912828XY9"]);
    expect(r[0].tipo).toBe("bond");
    expect(r[0].vista_comite).toBe("N");
  });
});

describe("buildSectorVistaLookup", () => {
  const sleeves = [
    { sector: "technology", region: "us", vista: "OW", conviction: "MEDIA", etf_us: "XLK" },
    { sector: "energy", region: "us", vista: "UW", conviction: "ALTA", etf_us: "XLE" },
  ];
  it("devuelve la vista del sector (case-insensitive)", () => {
    const look = buildSectorVistaLookup(sleeves);
    expect(look("technology")).toBe("OW");
    expect(look("Technology")).toBe("OW");
    expect(look("energy")).toBe("UW");
  });
  it("sector desconocido o null → null", () => {
    const look = buildSectorVistaLookup(sleeves);
    expect(look("healthcare")).toBeNull();
    expect(look(null)).toBeNull();
  });
  it("sleeves vacío → siempre null", () => {
    const look = buildSectorVistaLookup([]);
    expect(look("technology")).toBeNull();
  });
});
