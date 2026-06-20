import { describe, it, expect } from "vitest";

// Test the mapScoreToLabel logic directly
describe("Risk score label mapping", () => {
  function mapScoreToLabel(score: number): string {
    if (score < 20) return "Defensivo";
    if (score < 40) return "Conservador";
    if (score < 60) return "Moderado";
    if (score < 80) return "Agresivo";
    return "Muy Agresivo";
  }

  it("returns Defensivo for scores below 20", () => {
    expect(mapScoreToLabel(0)).toBe("Defensivo");
    expect(mapScoreToLabel(19)).toBe("Defensivo");
  });

  it("returns Conservador for scores 20-39", () => {
    expect(mapScoreToLabel(20)).toBe("Conservador");
    expect(mapScoreToLabel(39)).toBe("Conservador");
  });

  it("returns Moderado for scores 40-59", () => {
    expect(mapScoreToLabel(40)).toBe("Moderado");
    expect(mapScoreToLabel(59)).toBe("Moderado");
  });

  it("returns Agresivo for scores 60-79", () => {
    expect(mapScoreToLabel(60)).toBe("Agresivo");
    expect(mapScoreToLabel(79)).toBe("Agresivo");
  });

  it("returns Muy Agresivo for scores 80+", () => {
    expect(mapScoreToLabel(80)).toBe("Muy Agresivo");
    expect(mapScoreToLabel(100)).toBe("Muy Agresivo");
  });
});
