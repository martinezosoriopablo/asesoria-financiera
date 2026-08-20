import { describe, it, expect } from "vitest";
import { suggestFundCategory } from "./fund-category-suggest";

describe("suggestFundCategory", () => {
  it("RV + Chile/IPSA → Renta Variable Nacional", () => {
    expect(suggestFundCategory("Renta Variable", "ETF SINGULAR IPSA")).toBe("Renta Variable Nacional");
  });
  it("RV + S&P/USA → Renta Variable USA", () => {
    expect(suggestFundCategory("Renta Variable", "ETF SINGULAR S&P 500")).toBe("Renta Variable USA");
  });
  it("RV + Global/LATAM → Renta Variable Internacional", () => {
    expect(suggestFundCategory("Renta Variable", "FALCOM TACTICAL LATAM EQUITIES")).toBe("Renta Variable Internacional");
  });
  it("RF + Chile/Nacional → Renta Fija Nacional", () => {
    expect(suggestFundCategory("Renta Fija", "ETF SINGULAR CHILE CORPORATIVO")).toBe("Renta Fija Nacional");
  });
  it("RF + Global → Renta Fija Internacional", () => {
    expect(suggestFundCategory("Renta Fija", "GLOBAL CORPORATES")).toBe("Renta Fija Internacional");
  });
  it("Balanceado → Balanceado", () => {
    expect(suggestFundCategory("Balanceado", "ETF SINGULAR CORE 40/60")).toBe("Balanceado");
  });
  it("sin familia reconocible → null", () => {
    expect(suggestFundCategory("Otros", "algo raro")).toBeNull();
  });
});
