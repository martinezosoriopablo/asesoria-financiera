import { describe, it, expect } from "vitest";
import { roleToClase, defaultDecision, resolveMisFondos, deriveCartera, sumaPesos, buildUnresolvedRow, weightedMetrics, buildSectorVistaLookup } from "./resolve";
import type { ComiteColumn, MiFondoOption, RecomendacionRow } from "./types";

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
  const miFondo: MiFondoOption = { fund_id: "f1", fund_run: "9226", ticker: null, nombre: "FM BCI USA", custodian_type: "agf", tac: 1.2, rent_12m: 8, isMapped: true };

  it("AGF con mi fondo → usa el fondo", () => {
    const d = defaultDecision({ categoria: "rv_usa_large_cap", role: "rv", comite, misFondos: [miFondo], custodio: "agf" });
    expect(d.fuente).toBe("mi_fondo");
    expect(d.nombre).toBe("FM BCI USA");
    expect(d.custodian_type).toBe("agf");
    expect(d.porcentaje).toBe(22);
    expect(d.clase).toBe("Renta Variable");
  });

  it("AGF sin mi fondo → sin equivalente = caja (peso a decidir por el asesor)", () => {
    const d = defaultDecision({ categoria: "rv_usa_large_cap", role: "rv", comite, misFondos: [], custodio: "agf" });
    expect(d.fuente).toBe("caja");
    expect(d.ticker).toBeNull();
    expect(d.porcentaje).toBe(22);
  });

  it("internacional sin mi fondo → ETF del comité (US preferido)", () => {
    const d = defaultDecision({ categoria: "rv_usa_large_cap", role: "rv", comite, misFondos: [], custodio: "internacional" });
    expect(d.fuente).toBe("comite_etf");
    expect(d.ticker).toBe("VOO");
  });

  it("internacional con mi fondo → prioriza mi fondo", () => {
    const d = defaultDecision({ categoria: "rv_usa_large_cap", role: "rv", comite, misFondos: [miFondo], custodio: "internacional" });
    expect(d.fuente).toBe("mi_fondo");
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
