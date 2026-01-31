import { describe, it, expect } from "vitest";

// Test the mapScoreToLabel logic directly
describe("Risk score label mapping", () => {
  function mapScoreToLabel(score: number): string {
    if (score < 20) return "Ultra Conservador";
    if (score < 35) return "Conservador";
    if (score < 50) return "Moderado";
    if (score < 70) return "Crecimiento";
    if (score < 85) return "Agresivo";
    return "Muy Agresivo";
  }

  it("returns Ultra Conservador for scores below 20", () => {
    expect(mapScoreToLabel(0)).toBe("Ultra Conservador");
    expect(mapScoreToLabel(19)).toBe("Ultra Conservador");
  });

  it("returns Conservador for scores 20-34", () => {
    expect(mapScoreToLabel(20)).toBe("Conservador");
    expect(mapScoreToLabel(34)).toBe("Conservador");
  });

  it("returns Moderado for scores 35-49", () => {
    expect(mapScoreToLabel(35)).toBe("Moderado");
    expect(mapScoreToLabel(49)).toBe("Moderado");
  });

  it("returns Crecimiento for scores 50-69", () => {
    expect(mapScoreToLabel(50)).toBe("Crecimiento");
    expect(mapScoreToLabel(69)).toBe("Crecimiento");
  });

  it("returns Agresivo for scores 70-84", () => {
    expect(mapScoreToLabel(70)).toBe("Agresivo");
    expect(mapScoreToLabel(84)).toBe("Agresivo");
  });

  it("returns Muy Agresivo for scores 85+", () => {
    expect(mapScoreToLabel(85)).toBe("Muy Agresivo");
    expect(mapScoreToLabel(100)).toBe("Muy Agresivo");
  });
});
