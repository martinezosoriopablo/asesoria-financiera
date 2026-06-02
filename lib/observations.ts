export interface Observation {
  severity: "alta" | "media" | "info";
  text: string;
}

export interface ObservationInput {
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  holdings: Array<{ name: string; weightPct: number; confidence: string }>;
  sectorBreakdown: Array<{
    sector: string;
    sleeveVista: string | null;
    deltaPp: number;
  }>;
}

const ROLE_LABELS: Record<string, string> = {
  rv: "Renta Variable",
  rf: "Renta Fija",
  alt: "Alternativos",
  cash: "Caja",
};

const SEVERITY_ORDER: Record<string, number> = { alta: 0, media: 1, info: 2 };

export function generateObservations(input: ObservationInput): Observation[] {
  const obs: Observation[] = [];

  // 1. Macro allocation gaps
  for (const [role, alloc] of Object.entries(input.allocation)) {
    if (alloc.target > 5 && alloc.actual === 0) {
      obs.push({
        severity: "alta",
        text: `Sin exposicion a ${ROLE_LABELS[role] || role} — modelo sugiere ${alloc.target.toFixed(0)}%`,
      });
    } else if (Math.abs(alloc.delta) > 10) {
      obs.push({
        severity: "alta",
        text: `${ROLE_LABELS[role] || role} desviado ${alloc.delta > 0 ? "+" : ""}${alloc.delta.toFixed(1)}pp vs modelo`,
      });
    }
  }

  // 2. Concentration risk (top 3 > 50%)
  const sorted = [...input.holdings].sort((a, b) => b.weightPct - a.weightPct);
  const top3Weight = sorted.slice(0, 3).reduce((s, h) => s + h.weightPct, 0);
  if (top3Weight > 50) {
    obs.push({
      severity: "media",
      text: `Las 3 mayores posiciones representan ${top3Weight.toFixed(0)}% del portafolio`,
    });
  }

  // 3. Single position > 15%
  for (const h of sorted) {
    if (h.weightPct > 15) {
      obs.push({
        severity: "media",
        text: `${h.name} representa ${h.weightPct.toFixed(1)}% — considerar diversificar`,
      });
    }
  }

  // 4. Sector vs comite view mismatches
  for (const sector of input.sectorBreakdown) {
    if (sector.sleeveVista === "UW" && sector.deltaPp > 5) {
      obs.push({
        severity: "media",
        text: `${sector.sector} sobreponderado +${sector.deltaPp.toFixed(1)}pp, comite recomienda Underweight`,
      });
    }
    if (sector.sleeveVista === "OW" && sector.deltaPp < -5) {
      obs.push({
        severity: "info",
        text: `${sector.sector} subponderado, comite recomienda Overweight (oportunidad)`,
      });
    }
  }

  // 5. Low confidence classifications
  const lowConf = input.holdings.filter((h) => h.confidence === "low");
  if (lowConf.length > 0) {
    obs.push({
      severity: "info",
      text: `${lowConf.length} posicion(es) clasificadas con confianza baja — revisar manualmente`,
    });
  }

  return obs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
