import { describe, it, expect } from "vitest";
import { normalizeHost, resolveHostRoute } from "./host-routing";

describe("normalizeHost", () => {
  it("lowercases, strips port and www", () => {
    expect(normalizeHost("WWW.GlobalWealth.cl:3000")).toBe("globalwealth.cl");
  });
  it("handles null", () => {
    expect(normalizeHost(null)).toBe("");
  });
});

describe("resolveHostRoute", () => {
  it("passes through non-root paths", () => {
    expect(resolveHostRoute("globalwealth.cl", "/login")).toEqual({ kind: "pass" });
  });
  it("rewrites each division host at root", () => {
    expect(resolveHostRoute("globalwealth.cl", "/")).toEqual({ kind: "rewrite", path: "/global-wealth.html" });
    expect(resolveHostRoute("globalplanning.cl", "/")).toEqual({ kind: "rewrite", path: "/global-planning.html" });
    expect(resolveHostRoute("globalmarkets.cl", "/")).toEqual({ kind: "rewrite", path: "/global-markets.html" });
    expect(resolveHostRoute("globalpropierties.cl", "/")).toEqual({ kind: "rewrite", path: "/global-properties.html" });
    expect(resolveHostRoute("globalcorporates.cl", "/")).toEqual({ kind: "rewrite", path: "/global-corporate.html" });
    expect(resolveHostRoute("globalcompanies.cl", "/")).toEqual({ kind: "rewrite", path: "/global-companies.html" });
  });
  it("treats www the same as apex", () => {
    expect(resolveHostRoute("www.globalmarkets.cl", "/")).toEqual({ kind: "rewrite", path: "/global-markets.html" });
  });
  it("301-redirects the property alias", () => {
    expect(resolveHostRoute("globalproperty.cl", "/")).toEqual({ kind: "redirect", url: "https://globalpropierties.cl/" });
    expect(resolveHostRoute("www.globalproperty.cl", "/")).toEqual({ kind: "redirect", url: "https://globalpropierties.cl/" });
  });
  it("falls back to master home for unknown host", () => {
    expect(resolveHostRoute("asesoria-financiera.vercel.app", "/")).toEqual({ kind: "rewrite", path: "/global-companies.html" });
    expect(resolveHostRoute("localhost", "/")).toEqual({ kind: "rewrite", path: "/global-companies.html" });
  });
});
