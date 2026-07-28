import { describe, it, expect } from "vitest";
import { needsRangeBackfill } from "./market-series";
import type { DailyPrice } from "@/lib/prices/types";

const p = (date: string): DailyPrice => ({ date, price: 100 });

describe("needsRangeBackfill", () => {
  it("caché vacía → true (hay que traer todo)", () => {
    expect(needsRangeBackfill([], "2026-04-01")).toBe(true);
  });

  it("caché que empieza en fromDate → false (cubre el inicio)", () => {
    expect(needsRangeBackfill([p("2026-04-01"), p("2026-05-02")], "2026-04-01")).toBe(false);
  });

  it("caché que empieza pocos días después (<=7) → false", () => {
    expect(needsRangeBackfill([p("2026-04-06")], "2026-04-01")).toBe(false);
  });

  it("caché parcial reciente (empieza 90 días tarde) → true (falta historia)", () => {
    // el caso B&B: rango desde abril pero caché solo desde fin de junio
    expect(needsRangeBackfill([p("2026-06-30"), p("2026-07-24")], "2026-04-01")).toBe(true);
  });

  it("caché que empieza ANTES de fromDate → false", () => {
    expect(needsRangeBackfill([p("2026-03-15")], "2026-04-01")).toBe(false);
  });

  it("usa la fecha más temprana aunque el array no esté ordenado", () => {
    expect(needsRangeBackfill([p("2026-07-24"), p("2026-06-30")], "2026-06-28")).toBe(false);
    expect(needsRangeBackfill([p("2026-07-24"), p("2026-06-30")], "2026-04-01")).toBe(true);
  });
});
