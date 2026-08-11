import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = join(process.cwd(), "public");
const targets = [
  ...readdirSync(PUBLIC).filter((f) => /^global-.*\.html$/.test(f)).map((f) => join(PUBLIC, f)),
  ...readdirSync(join(PUBLIC, "en")).filter((f) => /^global-.*\.html$/.test(f)).map((f) => join(PUBLIC, "en", f)),
];

let changed = 0;
for (const file of targets) {
  let html = readFileSync(file, "utf8");

  // 1) Auth absoluto al dominio maestro (nav desktop + móvil). Orden: portal antes que login.
  html = html.replaceAll('href="/portal/login"', 'href="https://globalcompanies.cl/portal/login"');
  html = html.replaceAll('href="/login"', 'href="https://globalcompanies.cl/login"');

  // 2) Canonical que espeja el og:url ya existente (insertar una sola vez, antes del og:url).
  if (!/rel="canonical"/.test(html)) {
    const m = html.match(/<meta property="og:url" content="([^"]+)">/);
    if (m) {
      html = html.replace(m[0], `<link rel="canonical" href="${m[1]}">\n${m[0]}`);
    }
  }

  writeFileSync(file, html);
  changed++;
}
console.log(`Actualizados ${changed} archivos`);
