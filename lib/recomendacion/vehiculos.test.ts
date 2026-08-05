import { describe, it, expect } from "vitest";
import { parseVehiculos, resolveVehiculo } from "./vehiculos";

describe("parseVehiculos", () => {
  it("null/undefined → todo fondos (retrocompat)", () => {
    expect(parseVehiculos(null)).toEqual({ rv: "fondos", rf: "fondos", alt: "fondos" });
    expect(parseVehiculos(undefined)).toEqual({ rv: "fondos", rf: "fondos", alt: "fondos" });
  });
  it("respeta valores válidos y descarta basura", () => {
    expect(parseVehiculos({ rv: "directo", rf: "etf", alt: "zzz" }))
      .toEqual({ rv: "directo", rf: "etf", alt: "fondos" });
  });
});

describe("resolveVehiculo", () => {
  const cfg = { rv: "directo", rf: "etf", alt: "fondos" } as const;
  it("mapea role → vehículo de su clase; cash → fondos", () => {
    expect(resolveVehiculo(cfg, "rv")).toBe("directo");
    expect(resolveVehiculo(cfg, "rf")).toBe("etf");
    expect(resolveVehiculo(cfg, "alt")).toBe("fondos");
    expect(resolveVehiculo(cfg, "cash")).toBe("fondos");
  });
  it("config nula → fondos", () => {
    expect(resolveVehiculo(null, "rv")).toBe("fondos");
  });
});
