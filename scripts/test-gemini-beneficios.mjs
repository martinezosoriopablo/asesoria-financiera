// Test Gemini extraction of beneficios tributarios across different series
const GEMINI_KEY = "AIzaSyA2WdLHMp9Ma1S_JYp4hI7tmE2fhBwbD34";
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

const PROMPT = `Extrae datos de esta ficha de fondo mutuo chileno (CMF).

IMPORTANTE sobre Beneficio Tributario: Cada serie tiene UN SOLO beneficio tributario marcado con un checkmark/tick visual. Los posibles valores son: "APV", "APVC", "57 LIR", "107 LIR", "108 LIR", o null si no tiene. Identifica CUAL es el unico que esta marcado/destacado visualmente.

Responde SOLO JSON valido sin markdown ni backticks. Porcentajes como numeros. Serie solo el codigo.

{"nombre_fondo": "str", "serie": "str", "tac_serie_pct": "num", "rent_1m_pct": "num", "rent_3m_pct": "num", "rent_6m_pct": "num", "rent_12m_pct": "num", "rescatable": "bool", "plazo_rescate": "str", "horizonte_inversion": "str", "tolerancia_riesgo": "str", "objetivo": "str max 500", "beneficio_tributario": "string (uno de: APV, APVC, 57 LIR, 107 LIR, 108 LIR, o null)"}`;

async function testSerie(foRun, serie, rutAdmin) {
  const pdfRes = await fetch("https://www.cmfchile.cl/institucional/inc/ver_folleto_fm.php", {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body: `runFondo=${foRun}&serie=${encodeURIComponent(serie)}&rutAdmin=${rutAdmin}`,
  });
  const pdfPath = (await pdfRes.text()).trim();
  if (pdfPath === "ERROR") { console.log(`${foRun}/${serie}: NO PDF`); return; }

  const dlRes = await fetch(`https://www.cmfchile.cl${pdfPath}`, { headers: HEADERS });
  const buffer = await dlRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType: "application/pdf", data: base64 } },
        { text: PROMPT }
      ]}],
      generationConfig: { temperature: 0, maxOutputTokens: 4000 }
    })
  });

  const data = await geminiRes.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  // Clean markdown wrappers
  let clean = text || "";
  clean = clean.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const p = JSON.parse(clean);
    console.log(`\n${p.nombre_fondo} | Serie: ${p.serie} | TAC: ${p.tac_serie_pct}%`);
    console.log(`  Beneficio tributario: ${p.beneficio_tributario}`);
    console.log(`  Tolerancia: ${p.tolerancia_riesgo} | Horizonte: ${p.horizonte_inversion}`);
  } catch (e) {
    console.log(`${foRun}/${serie} parse error:`, clean?.substring(0, 300));
  }
}

async function main() {
  console.log("=== Fund 8987: Serie B vs I-APV vs INSTITUCIONAL ===");
  await testSerie(8987, "B", "96639280");
  await new Promise(r => setTimeout(r, 6000));
  await testSerie(8987, "I-APV", "96639280");
  await new Promise(r => setTimeout(r, 6000));
  await testSerie(8987, "INSTITUCIONAL", "96639280");
}

main().catch(console.error);
