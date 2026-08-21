// lib/portfolio/group-by-custodian.test.ts
import { describe, it, expect } from "vitest";
import { groupByCustodian } from "./group-by-custodian";

interface H { src?: string | null; clp: number; }
const src = (h: H) => h.src;
const val = (h: H) => h.clp;

describe("groupByCustodian", () => {
  it("agrupa y calcula % sobre el total", () => {
    const r = groupByCustodian<H>(
      [{ src: "Banchile AGF", clp: 60 }, { src: "Security AGF", clp: 40 }],
      src, val
    );
    expect(r).toEqual([
      { custodio: "Banchile AGF", valorCLP: 60, pct: 60 },
      { custodio: "Security AGF", valorCLP: 40, pct: 40 },
    ]);
  });
  it("unifica tildes/casing ('Itaú' == 'Itau')", () => {
    const r = groupByCustodian<H>(
      [{ src: "Itaú AGF", clp: 30 }, { src: "ITAU agf", clp: 70 }],
      src, val
    );
    expect(r).toHaveLength(1);
    expect(r[0].valorCLP).toBe(100);
    expect(r[0].custodio).toBe("Itaú AGF"); // conserva el primer nombre "bonito"
  });
  it("source vacío/null → grupo 'Sin custodio'", () => {
    const r = groupByCustodian<H>([{ src: null, clp: 50 }, { src: "  ", clp: 50 }], src, val);
    expect(r).toEqual([{ custodio: "Sin custodio", valorCLP: 100, pct: 100 }]);
  });
  it("ordena por valor descendente", () => {
    const r = groupByCustodian<H>(
      [{ src: "A", clp: 10 }, { src: "B", clp: 90 }],
      src, val
    );
    expect(r.map((g) => g.custodio)).toEqual(["B", "A"]);
  });
  it("lista vacía → []", () => {
    expect(groupByCustodian<H>([], src, val)).toEqual([]);
  });
});
