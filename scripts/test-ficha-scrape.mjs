// Batch test: scrape fichas from CMF for multiple AGFs
// Usage: node scripts/test-ficha-scrape.mjs

import { extractText } from "unpdf";

const tests = [
  { run: 10225, serie: "A",          rut: "96966250", agf: "BTG" },
  { run: 8600,  serie: "B",          rut: "91999000", agf: "Security" },
  { run: 8090,  serie: "ADC",        rut: "96667040", agf: "Banchile" },
  { run: 8304,  serie: "AHORROSIST", rut: "96634320", agf: "Scotia" },
];

async function scrapeFicha(foRun, serie, rutAdmin) {
  const res = await fetch("https://www.cmfchile.cl/institucional/inc/ver_folleto_fm.php", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body: "runFondo=" + foRun + "&serie=" + encodeURIComponent(serie) + "&rutAdmin=" + rutAdmin,
  });
  const pdfPath = (await res.text()).trim();
  if (pdfPath === "ERROR" || pdfPath.includes("DOCTYPE")) return null;

  const dlRes = await fetch("https://www.cmfchile.cl" + pdfPath);
  if (!dlRes.ok) return null;
  const buffer = await dlRes.arrayBuffer();

  const result = await extractText(new Uint8Array(buffer));
  const text = result.text.join("\n");

  const tac = text.match(/TAC\s+Serie\s+\(?(?:IVA\s+incluido|Exento\s+de\s+IVA)\)?\s+([\d,]+)%/i);
  const resc = text.match(/Fondo\s+es\s+Rescatable:\s*(SI|NO)/i);
  const plazo = text.match(/Plazo\s+Rescates:\s*([^\n]+)/i);
  const horiz = text.match(/((?:Corto|Mediano|Largo)(?:\s+(?:o|y|a)\s+(?:corto|mediano|largo))*\s+plazo)/i);
  const tol = text.match(/Nivel\s+(alto|medio|bajo|moderado)/i);
  const header = text.match(/FONDO\s+MUTUO\s+([^|]+)\|\s*SERIE\s+(\S+)/i);

  return {
    fondo: header ? header[1].trim() : "?",
    tac: tac ? tac[1] : "-",
    rescatable: resc ? resc[1] : "-",
    plazo: plazo ? plazo[1].trim().substring(0, 30) : "-",
    horizonte: horiz ? horiz[1].trim() : "-",
    tolerancia: tol ? tol[0].trim() : "-",
  };
}

async function main() {
  console.log("\n=== Batch ficha scrape test ===\n");

  for (const t of tests) {
    process.stdout.write(t.agf.padEnd(12) + "RUN " + t.run + " " + t.serie.padEnd(12) + "... ");
    try {
      const data = await scrapeFicha(t.run, t.serie, t.rut);
      if (data) {
        console.log("TAC: " + (data.tac + "%").padEnd(8) +
          "Resc: " + data.rescatable.padEnd(5) +
          "Plazo: " + data.plazo.padEnd(32) +
          "Horiz: " + data.horizonte);
      } else {
        console.log("NO PDF");
      }
    } catch (e) {
      console.log("ERROR: " + e.message);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log("\n=== Done ===\n");
}

main().catch(console.error);
