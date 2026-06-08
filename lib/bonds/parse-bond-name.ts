// Extract bond fields (coupon, maturity, rating) from fundName when missing
const COUPON_RE = /\b(\d{1,2}(?:\.\d{1,4})?)\s*%/;
const MATURITY_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/;
const MATURITY_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const SP_RATING_RE = /\b(AAA|AA\+|AA-|AA|A\+|A-|BBB\+|BBB-|BBB|BB\+|BB-|BB|B\+|B-|CCC\+|CCC-|CCC|CC|D|NR)\b/i;
const MOODYS_RE = /\b(Aaa|Aa[123]|A[123]|Baa[123]|Ba[123]|B[123]|Caa[123]|Ca)\b/i;
const MOODYS_SP: Record<string, string> = {
  "AAA": "AAA", "AA1": "AA+", "AA2": "AA", "AA3": "AA-",
  "A1": "A+", "A2": "A", "A3": "A-",
  "BAA1": "BBB+", "BAA2": "BBB", "BAA3": "BBB-",
  "BA1": "BB+", "BA2": "BB", "BA3": "BB-",
  "B1": "B+", "B2": "B", "B3": "B-",
  "CAA1": "CCC+", "CAA2": "CCC", "CAA3": "CCC-", "CA": "CC",
};

export function extractRating(text: string): string | null {
  const sp = text.match(SP_RATING_RE);
  if (sp) return sp[1].toUpperCase();
  const mo = text.match(MOODYS_RE);
  if (mo) return MOODYS_SP[mo[1].toUpperCase()] || mo[1].toUpperCase();
  return null;
}

export function parseBondName<T extends { fundName: string; couponRate?: number | null; maturityDate?: string | null; creditRating?: string | null }>(h: T): T {
  const name = h.fundName || "";
  if (!name) return h;

  let couponRate = h.couponRate || null;
  let maturityDate = h.maturityDate || null;
  let creditRating = h.creditRating || null;

  // Extract coupon
  if (!couponRate) {
    const m = name.match(COUPON_RE);
    if (m) couponRate = parseFloat(m[1]);
  }
  // Extract maturity
  if (!maturityDate) {
    const dm = name.match(MATURITY_RE);
    if (dm) {
      maturityDate = `${dm[3]}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
    } else {
      const im = name.match(MATURITY_ISO_RE);
      if (im) maturityDate = `${im[1]}-${im[2]}-${im[3]}`;
    }
  }
  // Extract rating (S&P or Moody's → S&P)
  if (!creditRating) {
    creditRating = extractRating(name);
  } else {
    // Convert Moody's if stored as such
    const mo = String(creditRating).match(MOODYS_RE);
    if (mo) creditRating = MOODYS_SP[mo[1].toUpperCase()] || creditRating;
  }

  // Clean name: remove extracted data
  let cleanName = name;
  cleanName = cleanName.replace(/\s*\d{1,2}(?:\.\d{1,4})?\s*%/g, "");
  cleanName = cleanName.replace(/\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/g, "");
  cleanName = cleanName.replace(/\s*\d{4}-\d{2}-\d{2}/g, "");
  cleanName = cleanName.replace(SP_RATING_RE, "");
  cleanName = cleanName.replace(MOODYS_RE, "");
  cleanName = cleanName.replace(/Rating\s*Information\s*:?/gi, "");
  cleanName = cleanName.replace(/Moody'?s?\s*:\s*/gi, "");
  cleanName = cleanName.replace(/S&P\s*:\s*/gi, "");
  cleanName = cleanName.replace(/Fitch\s*:\s*/gi, "");
  cleanName = cleanName.replace(/[\s\/\-]+$/g, "").replace(/^[\s\/\-]+/g, "").replace(/\s{2,}/g, " ").trim();

  return {
    ...h,
    fundName: cleanName.length >= 3 ? cleanName : h.fundName,
    couponRate,
    maturityDate,
    creditRating,
  };
}
