import { describe, it, expect } from "vitest";
import { detectCurrencyFromName, assetTypeToClass, classifyFund } from "./classify";

describe("detectCurrencyFromName", () => {
  it("returns USD for dollar-related keywords", () => {
    expect(detectCurrencyFromName("Fondo USD Global")).toBe("USD");
    expect(detectCurrencyFromName("Dollar Reserve")).toBe("USD");
    expect(detectCurrencyFromName("Fondo Dolar")).toBe("USD");
    expect(detectCurrencyFromName("US Equity Fund")).toBe("USD");
    expect(detectCurrencyFromName("Fondo (US) Growth")).toBe("USD");
    expect(detectCurrencyFromName("EEUU Large Cap")).toBe("USD");
    expect(detectCurrencyFromName("USA Bond Fund")).toBe("USD");
    expect(detectCurrencyFromName("Global Allocation")).toBe("USD");
    expect(detectCurrencyFromName("International Equity")).toBe("USD");
  });

  it("returns EUR for euro-related keywords", () => {
    expect(detectCurrencyFromName("Fondo EUR Renta Fija")).toBe("EUR");
    expect(detectCurrencyFromName("Euro Bond Fund")).toBe("EUR");
    expect(detectCurrencyFromName("Europa Equity")).toBe("EUR");
    expect(detectCurrencyFromName("European Growth")).toBe("EUR");
  });

  it("returns UF for UF-related keywords", () => {
    expect(detectCurrencyFromName("Fondo UF Deposito")).toBe("UF");
    expect(detectCurrencyFromName("Renta Fija (UF)")).toBe("UF");
    expect(detectCurrencyFromName("UF Corporate Bond")).toBe("UF");
  });

  it("returns CLP for peso/chile-related keywords", () => {
    expect(detectCurrencyFromName("Fondo CLP Liquidez")).toBe("CLP");
    expect(detectCurrencyFromName("Peso Money Market")).toBe("CLP");
    expect(detectCurrencyFromName("Chile Equity")).toBe("CLP");
    expect(detectCurrencyFromName("Local Bond Fund")).toBe("CLP");
    expect(detectCurrencyFromName("Nacional Renta Fija")).toBe("CLP");
  });

  it("defaults to USD when no keyword matches", () => {
    expect(detectCurrencyFromName("Fondo Accionario XYZ")).toBe("USD");
    expect(detectCurrencyFromName("")).toBe("USD");
  });
});

describe("assetTypeToClass", () => {
  it("maps bond to fixedIncome", () => {
    expect(assetTypeToClass("bond")).toBe("fixedIncome");
  });

  it("maps cash to cash", () => {
    expect(assetTypeToClass("cash")).toBe("cash");
  });

  it("maps etf to equity", () => {
    expect(assetTypeToClass("etf")).toBe("equity");
  });

  it("maps stock to equity", () => {
    expect(assetTypeToClass("stock")).toBe("equity");
  });

  it("returns null for fund (fallthrough to classifyFund)", () => {
    expect(assetTypeToClass("fund")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(assetTypeToClass(undefined)).toBeNull();
  });
});

describe("classifyFund", () => {
  it("detects money market / cash funds", () => {
    expect(classifyFund("Money Market Reserve")).toBe("cash");
    expect(classifyFund("Fondo Liquidez Diaria")).toBe("cash");
    expect(classifyFund("Cash Management")).toBe("cash");
    expect(classifyFund("Disponible CLP")).toBe("cash");
  });

  it("detects fixed income funds", () => {
    expect(classifyFund("Renta Fija Corporativa")).toBe("fixedIncome");
    expect(classifyFund("Fixed Income Global")).toBe("fixedIncome");
    expect(classifyFund("Bond Fund USD")).toBe("fixedIncome");
    expect(classifyFund("Fondo Bono Soberano")).toBe("fixedIncome");
    expect(classifyFund("Deuda Emergente")).toBe("fixedIncome");
    expect(classifyFund("High Yield Fund")).toBe("fixedIncome");
    expect(classifyFund("Depósito a Plazo")).toBe("fixedIncome");
  });

  it("detects balanced funds", () => {
    expect(classifyFund("Balanced Growth")).toBe("balanced");
    expect(classifyFund("Fondo Balanceado")).toBe("balanced");
    expect(classifyFund("Multi-Asset Strategy")).toBe("balanced");
    expect(classifyFund("Moderado CLP")).toBe("balanced");
  });

  it("detects alternative funds", () => {
    expect(classifyFund("Real Estate REIT")).toBe("alternatives");
    expect(classifyFund("Fondo Inmobiliario")).toBe("alternatives");
    expect(classifyFund("Private Equity Fund")).toBe("alternatives");
    expect(classifyFund("Hedge Fund Strategy")).toBe("alternatives");
    expect(classifyFund("Commodity Tracker")).toBe("alternatives");
  });

  it("defaults to equity for unrecognized names", () => {
    expect(classifyFund("Fondo Accionario XYZ")).toBe("equity");
    expect(classifyFund("Growth Tech Fund")).toBe("equity");
  });
});
