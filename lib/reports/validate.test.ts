import { describe, it, expect } from "vitest";
import { resolveUsos, validateReportInput, insumoNeedsTextWarning } from "./validate";
import { SEED_TYPES } from "./catalog";

const macro = SEED_TYPES.find((t) => t.id === "macro")!;
const diario = SEED_TYPES.find((t) => t.id === "diario")!;
const cartera = SEED_TYPES.find((t) => t.id === "cartera_modelo")!;

describe("resolveUsos", () => {
  it("uses type defaults when report usos is null", () => {
    expect(resolveUsos(null, macro.defaultUsos)).toEqual(["distribucion", "insumo_cartera"]);
  });
  it("empty array override means no usos (explicit)", () => {
    expect(resolveUsos([], macro.defaultUsos)).toEqual([]);
  });
  it("override wins when provided", () => {
    expect(resolveUsos(["distribucion"], macro.defaultUsos)).toEqual(["distribucion"]);
  });
});

describe("validateReportInput", () => {
  it("date-scoped requires report_date", () => {
    expect(validateReportInput(macro, { formatosPresentes: ["html"] })).toMatch(/report_date/);
  });
  it("period-scoped requires period in {am,pm}", () => {
    expect(validateReportInput(diario, { report_date: "2026-08-10", period: "xx", formatosPresentes: ["html"] })).toMatch(/am.*pm/i);
  });
  it("perfil-scoped requires valid perfil", () => {
    expect(validateReportInput(cartera, { report_date: "2026-08-10", perfil: "loco", formatosPresentes: ["json"] })).toMatch(/perfil/);
  });
  it("rejects a format not in the type's formatos", () => {
    expect(validateReportInput(cartera, { report_date: "2026-08-10", perfil: "moderado", formatosPresentes: ["pdf"] })).toMatch(/formato/i);
  });
  it("passes a valid input", () => {
    expect(validateReportInput(macro, { report_date: "2026-08-10", formatosPresentes: ["html"] })).toBeNull();
  });
});

describe("insumoNeedsTextWarning", () => {
  it("warns when insumo tagged but only pdf/mp3 present", () => {
    expect(insumoNeedsTextWarning(["insumo_cartera"], false, false)).toBe(true);
  });
  it("no warning when html present", () => {
    expect(insumoNeedsTextWarning(["insumo_cartera"], true, false)).toBe(false);
  });
  it("no warning when not an insumo", () => {
    expect(insumoNeedsTextWarning(["distribucion"], false, false)).toBe(false);
  });
});
