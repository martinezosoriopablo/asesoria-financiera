import { describe, it, expect, vi, afterEach } from "vitest";
import { discoverFromCmfPage } from "./cmf-fichas";

function mockFetchHtml(html: string) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => html })));
}
afterEach(() => vi.unstubAllGlobals());

describe("discoverFromCmfPage", () => {
  // Regresión: los FI FINRE (no rescatables) usan tipoentidad=FINRE y el mismo
  // formato verFolleto('id','serie','rutAdmin') que FIRES. Antes se ignoraban.
  it("parsea folletos de un FI FINRE (no rescatable)", async () => {
    mockFetchHtml(`<a onclick="verFolleto('501','A','76081215')">A</a>
                   <a onclick="verFolleto('502','B','76081215')">B</a>`);
    const r = await discoverFromCmfPage(10639, "FINRE");
    expect(r).toEqual({ rutAdmin: "76081215", series: ["A", "B"] });
  });

  it("parsea folletos de un FI FIRES (rescatable)", async () => {
    mockFetchHtml(`verFolleto('123','LV','76081215')`);
    const r = await discoverFromCmfPage(7127, "FIRES");
    expect(r).toEqual({ rutAdmin: "76081215", series: ["LV"] });
  });

  it("devuelve null cuando no hay folletos", async () => {
    mockFetchHtml(`<html>sin folletos aqui</html>`);
    expect(await discoverFromCmfPage(10651, "FINRE")).toBeNull();
  });
});
