import { describe, it, expect } from "vitest";
import { roleToClase, defaultDecision } from "./resolve";
import type { ComiteColumn, MiFondoOption } from "./types";

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
  const miFondo: MiFondoOption = { fund_id: "f1", fund_run: 9226, ticker: null, nombre: "FM BCI USA", custodian_type: "agf", tac: 1.2, rent_12m: 8, isMapped: true };

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
