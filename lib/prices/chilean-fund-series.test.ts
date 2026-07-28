import { describe, it, expect } from "vitest";
import { isChileanRun, getChileanFundSeries } from "./chilean-fund-series";

// Mock encadenable: ignora los filtros y resuelve a { data } por tabla.
function makeSupabase(tables: Record<string, unknown[]>) {
  const builder = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "limit"]) b[m] = () => b;
    (b as { then: unknown }).then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data: rows });
    return b;
  };
  return { from: (t: string) => builder(tables[t] || []) } as never;
}

describe("isChileanRun", () => {
  it("reconoce RUN numérico de 3-6 dígitos, rechaza tickers y CUSIP/ISIN", () => {
    expect(isChileanRun("9226")).toBe(true);
    expect(isChileanRun("VOO")).toBe(false);
    expect(isChileanRun("123456789")).toBe(false); // largo CUSIP
    expect(isChileanRun("IE00BD5CTV53")).toBe(false); // ISIN
  });
});

describe("getChileanFundSeries", () => {
  it("FM: mapea fo_run→id→serie de valor_cuota", async () => {
    const sb = makeSupabase({
      fondos_mutuos: [{ id: "fm1" }],
      fondos_rentabilidades_diarias: [
        { fecha: "2026-01-31", valor_cuota: 100 },
        { fecha: "2026-02-28", valor_cuota: 110 },
      ],
    });
    expect(await getChileanFundSeries(sb, "9226", "2026-01-01", "2026-03-01")).toEqual([
      { date: "2026-01-31", price: 100 },
      { date: "2026-02-28", price: 110 },
    ]);
  });

  it("FI: si no es FM, cae a rut→id→valor_libro", async () => {
    const sb = makeSupabase({
      fondos_mutuos: [],
      fondos_inversion: [{ id: "fi1" }],
      fondos_inversion_precios: [{ fecha: "2026-01-31", valor_libro: 50 }],
    });
    expect(await getChileanFundSeries(sb, "12345", "2026-01-01", "2026-03-01")).toEqual([
      { date: "2026-01-31", price: 50 },
    ]);
  });

  it("sin datos → vacío", async () => {
    const sb = makeSupabase({ fondos_mutuos: [], fondos_inversion: [] });
    expect(await getChileanFundSeries(sb, "999", "2026-01-01", "2026-03-01")).toEqual([]);
  });

  it("filtra precios <= 0", async () => {
    const sb = makeSupabase({
      fondos_mutuos: [{ id: "fm1" }],
      fondos_rentabilidades_diarias: [
        { fecha: "2026-01-31", valor_cuota: 0 },
        { fecha: "2026-02-28", valor_cuota: 110 },
      ],
    });
    expect(await getChileanFundSeries(sb, "9226", "2026-01-01", "2026-03-01")).toEqual([
      { date: "2026-02-28", price: 110 },
    ]);
  });
});
