import { describe, it, expect } from "vitest";
import { generateObservations, type ObservationInput } from "./observations";

function makeInput(overrides: Partial<ObservationInput> = {}): ObservationInput {
  return {
    allocation: {
      rv: { actual: 60, target: 60, delta: 0 },
      rf: { actual: 25, target: 25, delta: 0 },
      alt: { actual: 10, target: 10, delta: 0 },
      cash: { actual: 5, target: 5, delta: 0 },
    },
    holdings: [
      { name: "AAPL", weightPct: 10, confidence: "high" },
      { name: "MSFT", weightPct: 8, confidence: "high" },
      { name: "GOOGL", weightPct: 7, confidence: "high" },
    ],
    sectorBreakdown: [],
    ...overrides,
  };
}

describe("generateObservations", () => {
  it("returns empty for balanced portfolio", () => {
    const obs = generateObservations(makeInput());
    expect(obs.length).toBe(0);
  });

  it("detects zero allocation gap", () => {
    const obs = generateObservations(makeInput({
      allocation: {
        rv: { actual: 95, target: 60, delta: 35 },
        rf: { actual: 0, target: 25, delta: -25 },
        alt: { actual: 0, target: 10, delta: -10 },
        cash: { actual: 5, target: 5, delta: 0 },
      },
    }));
    const rfObs = obs.find((o) => o.text.includes("Renta Fija"));
    expect(rfObs).toBeDefined();
    expect(rfObs!.severity).toBe("alta");
  });

  it("detects concentration in top 3", () => {
    const obs = generateObservations(makeInput({
      holdings: [
        { name: "AAPL", weightPct: 25, confidence: "high" },
        { name: "MSFT", weightPct: 20, confidence: "high" },
        { name: "GOOGL", weightPct: 15, confidence: "high" },
      ],
    }));
    expect(obs.some((o) => o.text.includes("3 mayores posiciones"))).toBe(true);
  });

  it("detects single position > 15%", () => {
    const obs = generateObservations(makeInput({
      holdings: [
        { name: "AAPL", weightPct: 20, confidence: "high" },
        { name: "MSFT", weightPct: 5, confidence: "high" },
      ],
    }));
    expect(obs.some((o) => o.text.includes("AAPL"))).toBe(true);
  });

  it("detects low confidence holdings", () => {
    const obs = generateObservations(makeInput({
      holdings: [
        { name: "XYZ", weightPct: 5, confidence: "low" },
        { name: "ABC", weightPct: 3, confidence: "low" },
      ],
    }));
    expect(obs.some((o) => o.text.includes("confianza baja"))).toBe(true);
  });

  it("detects sector vs comite mismatch", () => {
    const obs = generateObservations(makeInput({
      sectorBreakdown: [
        { sector: "Technology", sleeveVista: "UW", deltaPp: 8 },
      ],
    }));
    expect(obs.some((o) => o.text.includes("Technology") && o.text.includes("Underweight"))).toBe(true);
  });

  it("sorts by severity (alta first)", () => {
    const obs = generateObservations(makeInput({
      allocation: {
        rv: { actual: 95, target: 60, delta: 35 },
        rf: { actual: 0, target: 25, delta: -25 },
        alt: { actual: 0, target: 10, delta: -10 },
        cash: { actual: 5, target: 5, delta: 0 },
      },
      holdings: [
        { name: "XYZ", weightPct: 5, confidence: "low" },
      ],
    }));
    expect(obs[0].severity).toBe("alta");
  });
});
