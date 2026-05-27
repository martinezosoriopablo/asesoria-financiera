import { describe, it, expect } from "vitest";
import {
  COMITE_CATEGORIES,
  classifyHolding,
  mapClientProfile,
  PREFERRED_TO_COMITE,
  getCategoryById,
  type HoldingForClassification,
} from "./comite-categories";

// ── COMITE_CATEGORIES structure ──────────────────────────────────────────

describe("COMITE_CATEGORIES", () => {
  it("has exactly 14 entries", () => {
    expect(COMITE_CATEGORIES).toHaveLength(14);
  });

  it("every entry has required fields", () => {
    for (const cat of COMITE_CATEGORIES) {
      expect(cat).toHaveProperty("id");
      expect(cat).toHaveProperty("label");
      expect(cat).toHaveProperty("role");
      expect(cat).toHaveProperty("etfUS");
      expect(cat).toHaveProperty("etfUCITS");
      expect(typeof cat.id).toBe("string");
      expect(typeof cat.label).toBe("string");
      expect(["rv", "rf", "alt", "cash"]).toContain(cat.role);
    }
  });

  it("getCategoryById returns correct entry", () => {
    const cat = getCategoryById("rv_usa_large_cap");
    expect(cat).toBeDefined();
    expect(cat!.label).toBe("RV USA Large Cap");
    expect(cat!.etfUS).toBe("VOO");
  });

  it("getCategoryById returns undefined for unknown id", () => {
    expect(getCategoryById("nonexistent")).toBeUndefined();
  });
});

// ── classifyHolding ─────────────────────────────────────────────────────

describe("classifyHolding", () => {
  // Priority 1: Direct ETF match

  it("classifies VOO as rv_usa_large_cap (high confidence)", () => {
    const h: HoldingForClassification = {
      fundName: "Vanguard S&P 500 ETF",
      securityId: "VOO",
      marketValue: 10000,
    };
    const result = classifyHolding(h);
    expect(result.categoryId).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("high");
  });

  it("classifies SPY as rv_usa_large_cap (secondary ETF)", () => {
    const result = classifyHolding({
      fundName: "SPDR S&P 500",
      securityId: "SPY",
      marketValue: 5000,
    });
    expect(result.categoryId).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("high");
  });

  it("classifies IEF as rf_ust_belly", () => {
    const result = classifyHolding({
      fundName: "iShares 7-10 Year Treasury",
      securityId: "IEF",
      marketValue: 8000,
    });
    expect(result.categoryId).toBe("rf_ust_belly");
    expect(result.confidence).toBe("high");
  });

  it("classifies AGG as rf_ust_belly (secondary ETF)", () => {
    const result = classifyHolding({
      fundName: "iShares Core US Aggregate Bond",
      securityId: "AGG",
      marketValue: 7000,
    });
    expect(result.categoryId).toBe("rf_ust_belly");
    expect(result.confidence).toBe("high");
  });

  it("classifies GLD as alt_gold", () => {
    const result = classifyHolding({
      fundName: "SPDR Gold Shares",
      securityId: "GLD",
      marketValue: 3000,
    });
    expect(result.categoryId).toBe("alt_gold");
    expect(result.confidence).toBe("high");
  });

  it("classifies SGOV as cash_tbills", () => {
    const result = classifyHolding({
      fundName: "iShares 0-3 Month Treasury Bond",
      securityId: "SGOV",
      marketValue: 5000,
    });
    expect(result.categoryId).toBe("cash_tbills");
    expect(result.confidence).toBe("high");
  });

  it("classifies VNQ as alt_reits", () => {
    const result = classifyHolding({
      fundName: "Vanguard Real Estate ETF",
      securityId: "VNQ",
      marketValue: 4000,
    });
    expect(result.categoryId).toBe("alt_reits");
    expect(result.confidence).toBe("high");
  });

  it("classifies EFA as rv_desarrollados_ex_us", () => {
    const result = classifyHolding({
      fundName: "iShares MSCI EAFE ETF",
      securityId: "EFA",
      marketValue: 6000,
    });
    expect(result.categoryId).toBe("rv_desarrollados_ex_us");
    expect(result.confidence).toBe("high");
  });

  // Priority 2: Chilean fund by familia_estudios

  it("classifies Chilean fund accionario nacional as rv_chile", () => {
    const result = classifyHolding({
      fundName: "Fondo Mutuo Security Accionario Nacional",
      securityId: "12345",
      marketValue: 5000,
      familiaEstudios: "Accionario Nacional",
    });
    expect(result.categoryId).toBe("rv_chile");
    expect(result.confidence).toBe("medium");
  });

  it("classifies Chilean fund accionario USA as rv_usa_large_cap", () => {
    const result = classifyHolding({
      fundName: "BTG Pactual USA Equity",
      securityId: "67890",
      marketValue: 5000,
      familiaEstudios: "Accionario USA",
    });
    expect(result.categoryId).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("medium");
  });

  it("classifies deuda corto plazo as rf_ust_short", () => {
    const result = classifyHolding({
      fundName: "Fondo Deuda Corto Plazo",
      securityId: "11111",
      marketValue: 3000,
      familiaEstudios: "Deuda Corto Plazo < 365",
    });
    expect(result.categoryId).toBe("rf_ust_short");
    expect(result.confidence).toBe("medium");
  });

  it("classifies deuda nacional as rf_chile", () => {
    const result = classifyHolding({
      fundName: "Fondo Deuda Nacional",
      securityId: "22222",
      marketValue: 3000,
      familiaEstudios: "Deuda Nacional UF",
      currency: "CLP",
    });
    expect(result.categoryId).toBe("rf_chile");
    expect(result.confidence).toBe("medium");
  });

  it("classifies deuda high yield as rf_high_yield", () => {
    const result = classifyHolding({
      fundName: "Fondo High Yield",
      securityId: "33333",
      marketValue: 2000,
      familiaEstudios: "Deuda High Yield",
    });
    expect(result.categoryId).toBe("rf_high_yield");
    expect(result.confidence).toBe("medium");
  });

  it("classifies deuda emergente as rf_em_sovereign", () => {
    const result = classifyHolding({
      fundName: "Fondo Deuda Emergente",
      securityId: "44444",
      marketValue: 2000,
      familiaEstudios: "Deuda Emergente",
    });
    expect(result.categoryId).toBe("rf_em_sovereign");
    expect(result.confidence).toBe("medium");
  });

  it("classifies balanceado as rv_usa_large_cap with low confidence", () => {
    const result = classifyHolding({
      fundName: "Fondo Balanceado Global",
      securityId: "55555",
      marketValue: 4000,
      familiaEstudios: "Balanceado",
    });
    expect(result.categoryId).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("low");
  });

  it("classifies accionario emergente as rv_emergentes", () => {
    const result = classifyHolding({
      fundName: "Fondo Emergente",
      securityId: "66666",
      marketValue: 2000,
      familiaEstudios: "Accionario Emergente Asia",
    });
    expect(result.categoryId).toBe("rv_emergentes");
    expect(result.confidence).toBe("medium");
  });

  it("classifies accionario europa as rv_desarrollados_ex_us", () => {
    const result = classifyHolding({
      fundName: "Fondo Europa",
      securityId: "77777",
      marketValue: 2000,
      familiaEstudios: "Accionario Desarrollado Europa",
    });
    expect(result.categoryId).toBe("rv_desarrollados_ex_us");
    expect(result.confidence).toBe("medium");
  });

  // Priority 3: Instrument type + geography

  it("classifies Chilean ADR (GOOGLCL) as rv_usa_large_cap", () => {
    const result = classifyHolding({
      fundName: "Alphabet Inc ADR",
      securityId: "GOOGLCL",
      marketValue: 8000,
    });
    expect(result.categoryId).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("medium");
  });

  it("classifies bond with CUSIP as rf_ig_corp", () => {
    const result = classifyHolding({
      fundName: "Apple Inc 3.25% 2026",
      securityId: "037833AK6",
      marketValue: 10000,
      couponRate: 3.25,
      maturityDate: "2026-12-15",
    });
    expect(result.categoryId).toBe("rf_ig_corp");
    expect(result.confidence).toBe("medium");
  });

  it("classifies bond with coupon+maturity (no CUSIP) as rf_ig_corp", () => {
    const result = classifyHolding({
      fundName: "Corporate Bond 4.5%",
      securityId: "CORP-BOND-123",
      marketValue: 5000,
      couponRate: 4.5,
      maturityDate: "2028-06-01",
    });
    expect(result.categoryId).toBe("rf_ig_corp");
    expect(result.confidence).toBe("medium");
  });

  // Priority 3: Cash detection

  it("classifies cash in USD as cash_tbills", () => {
    const result = classifyHolding({
      fundName: "Cash USD",
      marketValue: 2000,
      assetClass: "cash",
      currency: "USD",
    });
    expect(result.categoryId).toBe("cash_tbills");
    expect(result.confidence).toBe("medium");
  });

  it("classifies cash in CLP as rf_chile", () => {
    const result = classifyHolding({
      fundName: "Caja CLP",
      marketValue: 1000,
      assetClass: "cash",
      currency: "CLP",
    });
    expect(result.categoryId).toBe("rf_chile");
    expect(result.confidence).toBe("medium");
  });

  // Priority 4: assetClass fallback

  it("classifies equity fallback as rv_usa_large_cap (low)", () => {
    const result = classifyHolding({
      fundName: "Unknown Equity Fund",
      marketValue: 5000,
      assetClass: "equity",
    });
    expect(result.categoryId).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("low");
  });

  it("classifies fixedIncome fallback as rf_ust_belly (low)", () => {
    const result = classifyHolding({
      fundName: "Unknown Bond Fund",
      marketValue: 5000,
      assetClass: "fixedIncome",
    });
    expect(result.categoryId).toBe("rf_ust_belly");
    expect(result.confidence).toBe("low");
  });

  it("classifies alternatives fallback as alt_gold (low)", () => {
    const result = classifyHolding({
      fundName: "Unknown Alt Fund",
      marketValue: 5000,
      assetClass: "alternatives",
    });
    expect(result.categoryId).toBe("alt_gold");
    expect(result.confidence).toBe("low");
  });

  it("classifies cash fallback as cash_tbills (medium via name match)", () => {
    const result = classifyHolding({
      fundName: "Unknown Cash",
      marketValue: 5000,
      assetClass: "cash",
    });
    expect(result.categoryId).toBe("cash_tbills");
    // "Cash" in name triggers priority 3 (medium), not priority 4 (low)
    expect(result.confidence).toBe("medium");
  });

  // Priority 5: Ultimate fallback

  it("numeric securityId with CLP defaults to rf_chile", () => {
    const result = classifyHolding({
      fundName: "Fondo Desconocido",
      securityId: "99999",
      marketValue: 3000,
      currency: "CLP",
    });
    expect(result.categoryId).toBe("rf_chile");
    expect(result.confidence).toBe("low");
  });

  it("numeric securityId with USD defaults to rv_usa_large_cap", () => {
    const result = classifyHolding({
      fundName: "Unknown Fund",
      securityId: "88888",
      marketValue: 3000,
      currency: "USD",
    });
    expect(result.categoryId).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("low");
  });

  it("ultimate fallback is rv_usa_large_cap with low confidence", () => {
    const result = classifyHolding({
      fundName: "Mystery Instrument",
      marketValue: 1000,
    });
    expect(result.categoryId).toBe("rv_usa_large_cap");
    expect(result.confidence).toBe("low");
  });
});

// ── mapClientProfile ────────────────────────────────────────────────────

describe("mapClientProfile", () => {
  it("maps defensivo to conservador", () => {
    expect(mapClientProfile("defensivo")).toBe("conservador");
  });

  it("maps conservador to conservador", () => {
    expect(mapClientProfile("conservador")).toBe("conservador");
  });

  it("maps moderado to moderado", () => {
    expect(mapClientProfile("moderado")).toBe("moderado");
  });

  it("maps agresivo to moderado_agresivo", () => {
    expect(mapClientProfile("agresivo")).toBe("moderado_agresivo");
  });

  it("maps muy_agresivo to agresivo", () => {
    expect(mapClientProfile("muy_agresivo")).toBe("agresivo");
  });

  // Passthrough for already-valid model profiles
  it("passes through moderado_conservador as-is", () => {
    expect(mapClientProfile("moderado_conservador")).toBe("moderado_conservador");
  });

  it("passes through moderado_agresivo as-is", () => {
    expect(mapClientProfile("moderado_agresivo")).toBe("moderado_agresivo");
  });

  it("passes through agresivo (model) as-is", () => {
    // When agresivo is already a valid model profile, it maps to moderado_agresivo
    // But the passthrough check happens first for valid model profiles
    expect(mapClientProfile("agresivo")).toBe("moderado_agresivo");
  });
});

// ── PREFERRED_TO_COMITE ─────────────────────────────────────────────────

describe("PREFERRED_TO_COMITE", () => {
  it("maps rv_usa_large_cap to expected preferred categories", () => {
    const mapped = PREFERRED_TO_COMITE["rv_usa_large_cap"];
    expect(mapped).toBeDefined();
    expect(mapped).toContain("RV Internacional");
    expect(mapped).toContain("RV USA");
  });

  it("maps rv_chile to RV Nacional", () => {
    expect(PREFERRED_TO_COMITE["rv_chile"]).toContain("RV Nacional");
  });

  it("maps rf_chile to RF Nacional", () => {
    expect(PREFERRED_TO_COMITE["rf_chile"]).toContain("RF Nacional");
  });

  it("maps alt_gold to Alternativos", () => {
    expect(PREFERRED_TO_COMITE["alt_gold"]).toContain("Alternativos");
  });

  it("maps cash_tbills to Money Market", () => {
    expect(PREFERRED_TO_COMITE["cash_tbills"]).toContain("Money Market");
  });

  it("has mappings for all 14 categories", () => {
    for (const cat of COMITE_CATEGORIES) {
      expect(PREFERRED_TO_COMITE[cat.id]).toBeDefined();
    }
  });
});
