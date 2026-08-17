import { describe, it, expect } from "vitest";
import { formatFieldValue } from "./itemDisplay";
import type { FieldDef } from "./schemas";

const F = (partial: Partial<FieldDef>): FieldDef => ({ key: "x", label: "X", type: "text", ...partial } as FieldDef);

describe("formatFieldValue", () => {
  it("money: muestra 'monto moneda' desde key_monto/key_moneda", () => {
    const f = F({ key: "prima", type: "money" });
    expect(formatFieldValue(f, { prima_monto: 4.5, prima_moneda: "UF" })).toBe("4,5 UF");
  });
  it("money: null cuando no hay monto", () => {
    expect(formatFieldValue(F({ key: "prima", type: "money" }), { prima_monto: null })).toBeNull();
  });
  it("select: muestra el label de la opción", () => {
    const f = F({ key: "regimen", type: "select", options: [{ value: "A", label: "Régimen A" }] });
    expect(formatFieldValue(f, { regimen: "A" })).toBe("Régimen A");
  });
  it("switch: Sí/No", () => {
    expect(formatFieldValue(F({ key: "se_arrienda", type: "switch" }), { se_arrienda: true })).toBe("Sí");
    expect(formatFieldValue(F({ key: "se_arrienda", type: "switch" }), { se_arrienda: false })).toBe("No");
  });
  it("text/number vacío -> null", () => {
    expect(formatFieldValue(F({ key: "compania", type: "text" }), { compania: "" })).toBeNull();
    expect(formatFieldValue(F({ key: "compania", type: "text" }), {})).toBeNull();
    expect(formatFieldValue(F({ key: "compania", type: "text" }), { compania: "MetLife" })).toBe("MetLife");
  });
});
