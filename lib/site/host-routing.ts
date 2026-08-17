export type HostRoute =
  | { kind: "rewrite"; path: string }
  | { kind: "redirect"; url: string }
  | { kind: "pass" };

const DIVISION_BY_HOST: Record<string, string> = {
  "globalcompanies.cl": "/global-companies.html",
  "globalwealth.cl": "/global-wealth.html",
  "globalplanning.cl": "/global-planning.html",
  "globalmarkets.cl": "/global-markets.html",
  "globalproperties.cl": "/global-properties.html",
  "globalcorporates.cl": "/global-corporate.html",
};

const REDIRECT_BY_HOST: Record<string, string> = {
  "globalproperty.cl": "https://globalproperties.cl/",
};

const MASTER_HOME = "/global-companies.html";

export function normalizeHost(host: string | null): string {
  if (!host) return "";
  return host.split(":")[0].toLowerCase().replace(/^www\./, "");
}

export function resolveHostRoute(rawHost: string | null, pathname: string): HostRoute {
  if (pathname !== "/") return { kind: "pass" };
  const host = normalizeHost(rawHost);
  if (REDIRECT_BY_HOST[host]) return { kind: "redirect", url: REDIRECT_BY_HOST[host] };
  const page = DIVISION_BY_HOST[host];
  if (page) return { kind: "rewrite", path: page };
  return { kind: "rewrite", path: MASTER_HOME };
}
