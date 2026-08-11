import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = join(process.cwd(), "public");
const files = [
  ...readdirSync(PUBLIC).filter((f) => /^global-.*\.html$/.test(f)).map((f) => join(PUBLIC, f)),
  ...readdirSync(join(PUBLIC, "en")).filter((f) => /^global-.*\.html$/.test(f)).map((f) => join(PUBLIC, "en", f)),
];

describe("marketing HTML — listo para dominios", () => {
  it("encuentra 12 páginas", () => {
    expect(files.length).toBe(12);
  });

  for (const file of files) {
    const html = readFileSync(file, "utf8");

    it(`${file}: sin links de auth root-relativos`, () => {
      expect(html).not.toMatch(/href="\/login"/);
      expect(html).not.toMatch(/href="\/portal\/login"/);
    });

    it(`${file}: auth apunta a globalcompanies.cl`, () => {
      expect(html).toContain('href="https://globalcompanies.cl/login"');
      expect(html).toContain('href="https://globalcompanies.cl/portal/login"');
    });

    it(`${file}: canonical espeja el og:url`, () => {
      const og = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
      expect(og).toBeTruthy();
      expect(html).toContain(`<link rel="canonical" href="${og}">`);
    });
  }
});
