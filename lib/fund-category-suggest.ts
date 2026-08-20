import { stripAccents } from "@/lib/text";

const NACIONAL = /\b(chile|nacional|ipsa|chileno|clp)\b/;
const USA = /\b(usa|s&p|sp500|s p 500|nasdaq|estados unidos|ee\.?uu)\b/;
// "local currency" (deuda EM en moneda local) y "latinoamericana" son INTERNACIONAL, no nacional.
const INTL = /\b(global|internacional|latam|latinoamerica|latinoamericano|latinoamericana|local currency|mundial|world|emergentes?|emerging|europa|asia)\b/;

export function suggestFundCategory(familia: string | null | undefined, fundName: string): string | null {
  const fam = stripAccents((familia ?? "").toLowerCase());
  const name = stripAccents((fundName ?? "").toLowerCase());
  const geo = NACIONAL.test(name) ? "Nacional" : USA.test(name) ? "USA" : INTL.test(name) ? "Internacional" : null;
  if (fam.includes("balanceado")) return "Balanceado";
  if (fam.includes("renta variable") || fam.includes("accionario")) {
    if (geo === "Nacional") return "Renta Variable Nacional";
    if (geo === "USA") return "Renta Variable USA";
    if (geo === "Internacional") return "Renta Variable Internacional";
    return "Renta Variable Internacional"; // RV sin geo clara → Internacional (default razonable)
  }
  if (fam.includes("renta fija") || fam.includes("deuda")) {
    if (geo === "Nacional") return "Renta Fija Nacional";
    return "Renta Fija Internacional";
  }
  return null;
}
