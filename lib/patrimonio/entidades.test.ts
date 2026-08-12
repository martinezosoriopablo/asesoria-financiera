import { describe, it, expect } from "vitest";
import { resolveTabla, pickAllowed, validateFor } from "./entidades";

describe("resolveTabla", () => {
  it("mapea entidades conocidas", () => {
    expect(resolveTabla("seguros")).toBe("client_seguros");
    expect(resolveTabla("inmuebles")).toBe("client_inmuebles");
    expect(resolveTabla("activos")).toBe("client_activos_financieros");
  });
  it("devuelve null para desconocidas", () => {
    expect(resolveTabla("naves")).toBeNull();
  });
});

describe("pickAllowed", () => {
  it("descarta columnas no permitidas (anti mass-assignment)", () => {
    const out = pickAllowed("seguros", { tipo: "vida", id: "x", client_id: "y", created_by: "z", hack: 1 });
    expect(out).toHaveProperty("tipo", "vida");
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("client_id");
    expect(out).not.toHaveProperty("created_by");
    expect(out).not.toHaveProperty("hack");
  });
  it("convierte string vacío a null (evita violar CHECK/tipo en DB)", () => {
    const out = pickAllowed("activos", { tipo: "apv", regimen: "", saldo_monto: 100 });
    expect(out.regimen).toBeNull();
    expect(out.saldo_monto).toBe(100);
  });
});

describe("validateFor", () => {
  it("enruta al validador correcto", () => {
    expect(validateFor("activos", { tipo: "afp", regimen: "A" }).ok).toBe(false);
    expect(validateFor("seguros", { tipo: "vida" }).ok).toBe(true);
  });
});
