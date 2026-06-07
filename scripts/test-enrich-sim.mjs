import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CMF_ABBREVS = {
  "cartera dolar": "cd", "cartera dolares": "cd",
  "deuda corporativa": "dc", "cartera patrimonial": "cp",
};

async function testMatch(fundName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${fundName}`);

  let cleanName = fundName;
  const serieIdx = cleanName.search(/\bSERIE?\b/i);
  if (serieIdx > 0) cleanName = cleanName.slice(0, serieIdx).trim();

  const agfMatch = cleanName.match(/^FM\s+(\w+)\s/i);
  const agfName = agfMatch?.[1]?.toUpperCase() || null;

  const seriePatterns = [
    { pattern: /BANCA\s*PRIVADA/i, code: 'BPRIV' },
    { pattern: /ALTO\s*PATRIMONIO|ALTOPATRIM/i, code: 'ALPAT' },
    { pattern: /INSTITUCIONAL/i, code: 'INSTI' },
    { pattern: /CLASICA/i, code: 'CLASI' },
    { pattern: /\bAPV\b/i, code: 'APV' },
  ];
  let serie = null;
  for (const { pattern, code } of seriePatterns) {
    if (pattern.test(fundName)) { serie = code; break; }
  }

  const nameNorm = cleanName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const stopWords = new Set(['fondo', 'mutuo', 'de', 'del', 'la', 'los', 'las', 'el', 'en', 'con', 'por', 'serie', 'tipo', 'inv']);
  const allWords = nameNorm.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const searchWords = agfName ? allWords.filter(w => w.toUpperCase() !== agfName) : allWords;

  // Build tokens: prefix (4 chars) + abbreviation expansions
  const extraTokens = [];
  const joinedWords = searchWords.join(' ');
  for (const [phrase, abbrev] of Object.entries(CMF_ABBREVS)) {
    if (joinedWords.includes(phrase)) extraTokens.push(abbrev);
  }

  const allTokens = [...searchWords.map(w => w.length > 4 ? w.slice(0, 4) : w), ...extraTokens];

  console.log(`  Clean: ${cleanName} | AGF: ${agfName} | Serie: ${serie}`);
  console.log(`  Search tokens: ${allTokens.join(', ')}`);

  const candidates = new Map();
  for (const token of allTokens) {
    let query = sb.from('fondos_mutuos')
      .select('fo_run, fm_serie, nombre_fondo, nombre_agf')
      .ilike('nombre_fondo', `%${token}%`);
    if (agfName) query = query.ilike('nombre_agf', `%${agfName}%`);
    const { data } = await query.limit(50);
    for (const f of (data || [])) {
      const key = `${f.fo_run}|${f.fm_serie}`;
      if (!candidates.has(key)) candidates.set(key, { ...f, hits: 0 });
      candidates.get(key).hits++;
    }
  }

  console.log(`  Candidates: ${candidates.size}`);

  // Top by RUN
  const byRun = new Map();
  for (const [, c] of candidates) {
    const existing = byRun.get(c.fo_run);
    if (!existing || c.hits > existing.hits) byRun.set(c.fo_run, c);
  }
  const topRuns = [...byRun.values()].sort((a, b) => b.hits - a.hits).slice(0, 5);
  console.log('  Top by RUN:');
  for (const c of topRuns) {
    let score = c.hits;
    if (serie && c.fm_serie.toUpperCase() === serie) score += 3;
    if (agfName && c.nombre_agf?.toUpperCase() === agfName) score += 2;
    console.log(`    RUN ${c.fo_run} | ${c.nombre_fondo} | hits ${c.hits} | max_score ~${score}`);
  }

  // Score
  let bestMatch = null;
  let bestScore = 0;
  for (const [, c] of candidates) {
    let score = c.hits;
    if (serie && c.fm_serie.toUpperCase() === serie) score += 3;
    if (agfName && c.nombre_agf?.toUpperCase() === agfName) score += 2;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = c;
    }
  }

  if (bestMatch) {
    console.log(`  MATCH: RUN ${bestMatch.fo_run} | Serie ${bestMatch.fm_serie} | ${bestMatch.nombre_fondo} | Score ${bestScore}`);
  } else {
    console.log(`  NO MATCH`);
  }
}

await testMatch('FM BCI CARTERA DOLAR BALANCEADA SERIE BANCA PRIVADA');
await testMatch('FM BCI AMERICA LATINA SERIE ALTO PATRIMONIO');
await testMatch('FM BCI DEUDA CORPORATIVA ESTRATEGICA SERIE ALTO PATRIMONIO');
