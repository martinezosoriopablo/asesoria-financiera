import { describe, it, expect } from "vitest";
import { SEED_TYPES, requiredScopeFields } from "./catalog";

describe("catalog", () => {
  it("has the 10 curated types", () => {
    expect(SEED_TYPES.map((t) => t.id).sort()).toEqual([
      "arbol_decision", "asset_allocation", "cartera_modelo", "cierre_mensual",
      "diario", "macro", "rf", "rv", "sectorial", "seleccion_acciones",
    ]);
  });

  it("cartera_modelo is json-only, perfil-scoped, no usos", () => {
    const c = SEED_TYPES.find((t) => t.id === "cartera_modelo")!;
    expect(c.scopeKey).toBe("perfil");
    expect(c.formatos).toEqual(["json"]);
    expect(c.defaultUsos).toEqual([]);
  });

  it("requiredScopeFields maps each scope key", () => {
    expect(requiredScopeFields("date")).toEqual(["report_date"]);
    expect(requiredScopeFields("period")).toEqual(["report_date", "period"]);
    expect(requiredScopeFields("month")).toEqual(["period"]);
    expect(requiredScopeFields("perfil")).toEqual(["report_date", "perfil"]);
  });
});
