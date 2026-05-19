// components/tax/TaxBreakdown.tsx
// Deterministic tax calculation breakdown — no AI, pure data
"use client";

import { Fragment } from "react";
import { Info } from "lucide-react";
import type { ScenarioResult, TaxableHolding } from "@/lib/tax/types";
import { TRAMOS_IMPUESTO } from "@/lib/constants/chilean-tax";

interface Props {
  scenario: ScenarioResult;
  holdings: TaxableHolding[];
  totalValueUF: number;
  ingresoAnualUF: number;
  tipoContribuyente: "persona_natural" | "sociedad_inversion";
  esHabitual: boolean;
}

function fmtUF(v: number): string {
  if (Math.abs(v) < 0.05) return "0,0";
  return v.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct(v: number): string {
  return (v * 100).toFixed(2) + "%";
}

// Find the bracket for a given annual income
function findTramo(rentaAnualUF: number): { tasa: number; desde: number; hasta: number } {
  const mensual = rentaAnualUF / 12;
  for (const t of TRAMOS_IMPUESTO) {
    if (mensual <= t.hasta) return { tasa: t.tasa, desde: t.desde * 12, hasta: t.hasta * 12 };
  }
  const last = TRAMOS_IMPUESTO[TRAMOS_IMPUESTO.length - 1];
  return { tasa: last.tasa, desde: last.desde * 12, hasta: Infinity };
}

export default function TaxBreakdown({
  scenario,
  holdings,
  totalValueUF,
  ingresoAnualUF,
  tipoContribuyente,
  esHabitual,
}: Props) {
  const year0 = scenario.planAnual[0];
  if (!year0) return null;

  const esPersona = tipoContribuyente === "persona_natural";

  // Categorize holdings by regime
  const dcvHoldings = holdings.filter((h) => h.canDCV);
  const apvHoldings = holdings.filter((h) => h.taxRegime === "apv");
  const art107Holdings = holdings.filter((h) => h.taxRegime === "107" && !h.canDCV);
  const mltHoldings = holdings.filter((h) => h.canMLT && h.taxRegime !== "107");
  const generalHoldings = holdings.filter(
    (h) => !h.canDCV && h.taxRegime !== "apv" && h.taxRegime !== "107" && !h.canMLT
  );

  // Calculate general regime details
  const generalGains = generalHoldings.reduce((s, h) => {
    const cost = h.acquisitionCostUF ?? h.currentValueUF;
    const gain = h.currentValueUF - cost;
    return gain > 0 ? s + gain : s;
  }, 0);
  const generalLosses = generalHoldings.reduce((s, h) => {
    const cost = h.acquisitionCostUF ?? h.currentValueUF;
    const gain = h.currentValueUF - cost;
    return gain < 0 ? s + Math.abs(gain) : s;
  }, 0);
  const netGain = Math.max(0, generalGains - generalLosses);

  // Art 17 N8 exemption
  const exencion17N8 = year0.exencion17N8_UF;
  const gainAfterExemption = Math.max(0, netGain - exencion17N8);

  // Bracket info
  const tramoSinGanancia = findTramo(ingresoAnualUF);
  const tramoConGanancia = findTramo(ingresoAnualUF + gainAfterExemption);

  // Art 107 details
  const art107Gains = art107Holdings.reduce((s, h) => {
    const cost = h.acquisitionCostUF ?? h.currentValueUF;
    return s + Math.max(0, h.currentValueUF - cost);
  }, 0);

  return (
    <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
      <div className="px-4 py-3 border-b border-gb-border">
        <h3 className="font-semibold text-gb-black">
          Desglose tributario: {scenario.nombre}
        </h3>
        <p className="text-xs text-gb-gray mt-0.5">
          Calculo paso a paso basado en ley vigente (mayo 2026)
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gb-border">
              <th className="text-left px-4 py-2 font-medium text-gb-gray w-1/2">Concepto</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Monto (UF)</th>
              <th className="text-left px-4 py-2 font-medium text-gb-gray">Explicacion</th>
            </tr>
          </thead>
          <tbody>
            {/* Section: Portfolio */}
            <SectionHeader title="Portafolio" />
            <Row
              label="Valor total del portafolio"
              value={fmtUF(totalValueUF)}
              explanation={`${holdings.length} posiciones`}
            />

            {/* Section: Tax-free movements */}
            {(dcvHoldings.length > 0 || apvHoldings.length > 0 || mltHoldings.length > 0) && (
              <>
                <SectionHeader title="Movimientos sin impuesto" />
                {dcvHoldings.length > 0 && (
                  <Row
                    label={`Traspasos DCV (${dcvHoldings.length})`}
                    value={fmtUF(dcvHoldings.reduce((s, h) => s + h.currentValueUF, 0))}
                    explanation="Traspaso entre custodia via DCV, sin rescate ni hecho gravado"
                  />
                )}
                {apvHoldings.length > 0 && (
                  <Row
                    label={`Fondos APV (${apvHoldings.length})`}
                    value={fmtUF(apvHoldings.reduce((s, h) => s + h.currentValueUF, 0))}
                    explanation="Se mantienen en regimen APV, sin tributacion al traspasar"
                  />
                )}
                {mltHoldings.length > 0 && (
                  <Row
                    label={`MLT Art. 108 (${mltHoldings.length})`}
                    value={fmtUF(mltHoldings.reduce((s, h) => s + h.currentValueUF, 0))}
                    explanation="Traspaso diferido entre fondos mutuos via MLT (Art. 108 LIR), impuesto se difiere"
                  />
                )}
              </>
            )}

            {/* Section: Art. 107 */}
            {art107Holdings.length > 0 && (
              <>
                <SectionHeader title="Fondos Art. 107 LIR — Impuesto unico 10%" />
                {art107Holdings.map((h, i) => {
                  const cost = h.acquisitionCostUF ?? h.currentValueUF;
                  const gain = Math.max(0, h.currentValueUF - cost);
                  const tax = gain * 0.1;
                  return (
                    <Row
                      key={`107-${i}`}
                      label={h.fundName}
                      value={`${fmtUF(tax)}`}
                      explanation={`Ganancia ${fmtUF(gain)} UF × 10% = ${fmtUF(tax)} UF. Impuesto unico retenido por la AGF al momento del rescate.`}
                      indent
                    />
                  );
                })}
                <Row
                  label="Subtotal Art. 107"
                  value={fmtUF(art107Gains * 0.1)}
                  explanation=""
                  bold
                />
              </>
            )}

            {/* Section: General Regime */}
            {generalHoldings.length > 0 && (
              <>
                <SectionHeader
                  title={esPersona
                    ? "Regimen General — Global Complementario"
                    : "Regimen General — Primera Categoria (27%)"}
                />

                <Row
                  label={`Ganancias brutas (${generalHoldings.filter(h => (h.currentValueUF - (h.acquisitionCostUF ?? h.currentValueUF)) > 0).length} fondos)`}
                  value={fmtUF(generalGains)}
                  explanation="Suma de ganancias de capital con correccion monetaria (valor actual en UF − costo en UF a fecha de compra)"
                />

                {generalLosses > 0 && (
                  <Row
                    label="(-) Perdidas compensables"
                    value={`-${fmtUF(generalLosses)}`}
                    explanation="Las perdidas se restan de las ganancias del mismo ejercicio (Art. 31 LIR)"
                  />
                )}

                <Row
                  label="= Ganancia neta"
                  value={fmtUF(netGain)}
                  explanation=""
                  bold
                />

                {!esHabitual && (
                  <Row
                    label="(-) Exencion Art. 17 N°8 letra a)"
                    value={exencion17N8 > 0 ? `-${fmtUF(exencion17N8)}` : "0,0"}
                    explanation={
                      exencion17N8 > 0
                        ? "Ingreso no constitutivo de renta hasta 10 UTA anuales para inversionistas no habituales. Se aplica solo al mayor valor obtenido en la enajenacion de cuotas de fondos mutuos."
                        : "No aplica (ganancia neta es cero o inversionista habitual)"
                    }
                  />
                )}

                <Row
                  label="= Ganancia imponible"
                  value={fmtUF(gainAfterExemption)}
                  explanation=""
                  bold
                />

                {esPersona ? (
                  <>
                    <Row
                      label="Renta del trabajo anual"
                      value={fmtUF(ingresoAnualUF)}
                      explanation={`Tramo marginal sin ganancia: ${(tramoSinGanancia.tasa * 100).toFixed(1)}%`}
                    />
                    <Row
                      label="Renta + ganancia de capital"
                      value={fmtUF(ingresoAnualUF + gainAfterExemption)}
                      explanation={
                        tramoConGanancia.tasa > tramoSinGanancia.tasa
                          ? `La ganancia sube el tramo marginal de ${(tramoSinGanancia.tasa * 100).toFixed(1)}% a ${(tramoConGanancia.tasa * 100).toFixed(1)}%. El impuesto se calcula sobre la diferencia de impuesto progresivo con y sin la ganancia.`
                          : `Se mantiene en tramo ${(tramoConGanancia.tasa * 100).toFixed(1)}%. La ganancia tributa a tasa marginal.`
                      }
                    />
                    <Row
                      label="Impuesto marginal sobre la ganancia"
                      value={fmtUF(year0.mitigacion.impuestoBruto_UF - (art107Gains * 0.1))}
                      explanation={`Diferencia entre Global Complementario con y sin la ganancia de capital (bracket jumping)`}
                      bold
                    />
                  </>
                ) : (
                  <Row
                    label="Impuesto Primera Categoria (27%)"
                    value={fmtUF(gainAfterExemption * 0.27)}
                    explanation="Sociedad de inversion: tasa fija 27% sobre ganancia neta imponible"
                    bold
                  />
                )}
              </>
            )}

            {/* Section: Mitigation */}
            {(year0.mitigacion.aporteAPV_UF > 0 || year0.mitigacion.aporteDC_UF > 0) && (
              <>
                <SectionHeader title="Mitigacion tributaria" />
                {year0.mitigacion.aporteAPV_UF > 0 && (
                  <Row
                    label={`APV Regimen ${year0.mitigacion.regimenAPV}`}
                    value={`-${fmtUF(year0.mitigacion.ahorroTributarioAPV_UF)}`}
                    explanation={
                      year0.mitigacion.regimenAPV === "A"
                        ? `Aporte ${fmtUF(year0.mitigacion.aporteAPV_UF)} UF × 15% credito = ${fmtUF(year0.mitigacion.ahorroTributarioAPV_UF)} UF de ahorro (tope 600 UF/ano)`
                        : `Aporte ${fmtUF(year0.mitigacion.aporteAPV_UF)} UF deducible de base imponible × ${(tramoConGanancia.tasa * 100).toFixed(1)}% = ${fmtUF(year0.mitigacion.ahorroTributarioAPV_UF)} UF (tope 600 UF/ano)`
                    }
                  />
                )}
                {year0.mitigacion.aporteDC_UF > 0 && (
                  <Row
                    label="Deposito Convenido"
                    value={`-${fmtUF(year0.mitigacion.ahorroTributarioDC_UF)}`}
                    explanation={`Aporte ${fmtUF(year0.mitigacion.aporteDC_UF)} UF deducible × ${(tramoConGanancia.tasa * 100).toFixed(1)}% = ${fmtUF(year0.mitigacion.ahorroTributarioDC_UF)} UF (tope 900 UF/ano, requiere empleador)`}
                  />
                )}
              </>
            )}

            {/* Section: Totals */}
            <SectionHeader title="Resultado" />
            <Row
              label="Impuesto bruto total"
              value={fmtUF(year0.mitigacion.impuestoBruto_UF)}
              explanation="Art. 107 + regimen general, antes de mitigacion"
              bold
            />
            {year0.mitigacion.ahorroTotal_UF > 0 && (
              <Row
                label="(-) Total mitigacion"
                value={`-${fmtUF(year0.mitigacion.ahorroTotal_UF)}`}
                explanation="APV + DC + compensacion perdidas + exencion 17 N°8"
              />
            )}
            <Row
              label="= Impuesto neto a pagar"
              value={fmtUF(year0.mitigacion.impuestoNeto_UF)}
              explanation={totalValueUF > 0
                ? `${fmtPct(year0.mitigacion.impuestoNeto_UF / totalValueUF)} del valor total del portafolio`
                : ""}
              bold
              highlight
            />

            {/* Section: Benefits */}
            {(scenario.ahorroTAC_10Y_UF > 0 || scenario.alphaReasignacion_10Y_UF > 0) && (
              <>
                <SectionHeader title="Beneficios proyectados (supuestos del asesor, 10 anos)" />
                {scenario.ahorroTAC_10Y_UF > 0 && (
                  <Row
                    label="Ahorro por menor TAC"
                    value={`+${fmtUF(scenario.ahorroTAC_10Y_UF)}`}
                    explanation={`Diferencia de comision anual entre fondos actuales y propuestos, proyectada a 10 anos. Equivale a ${totalValueUF > 0 ? fmtPct(scenario.ahorroTAC_10Y_UF / totalValueUF) : "—"} del portafolio.`}
                  />
                )}
                {scenario.alphaReasignacion_10Y_UF > 0 && (
                  <Row
                    label="Alpha por reasignacion"
                    value={`+${fmtUF(scenario.alphaReasignacion_10Y_UF)}`}
                    explanation={`Mayor rentabilidad esperada al alinear el portafolio con el perfil de riesgo del cliente. Equivale a ${totalValueUF > 0 ? fmtPct(scenario.alphaReasignacion_10Y_UF / totalValueUF) : "—"} del portafolio en 10 anos.`}
                  />
                )}
                <Row
                  label="= Beneficio neto VPN"
                  value={`${scenario.beneficioNetoVPN_UF >= 0 ? "+" : ""}${fmtUF(scenario.beneficioNetoVPN_UF)}`}
                  explanation={scenario.puntoEquilibrioAnos != null
                    ? `Beneficios menos impuesto, descontados a tasa real. Punto de equilibrio: ${scenario.puntoEquilibrioAnos.toFixed(1)} anos.`
                    : "Beneficios menos impuesto, descontados a tasa real."}
                  bold
                  highlight={scenario.beneficioNetoVPN_UF >= 0}
                />
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Methodology note */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gb-border flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-gb-gray mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-gb-gray leading-relaxed">
          Ganancia de capital = valor actual (UF hoy) − costo adquisicion (UF a fecha de compra).
          La correccion monetaria se aplica automaticamente al expresar ambos valores en UF (Art. 41 N°8 LIR).
          {!esHabitual && " La exencion del Art. 17 N°8 letra a) aplica hasta 10 UTA anuales para inversionistas no habituales sobre el mayor valor en la enajenacion de cuotas de fondos mutuos."}
          {" "}Los beneficios proyectados (TAC, alpha) son estimaciones del asesor, no garantias.
        </p>
      </div>
    </div>
  );
}

// Subcomponents
function SectionHeader({ title }: { title: string }) {
  return (
    <tr className="bg-gray-50">
      <td colSpan={3} className="px-4 py-1.5 text-xs font-semibold text-gb-gray uppercase tracking-wide">
        {title}
      </td>
    </tr>
  );
}

function Row({
  label,
  value,
  explanation,
  bold,
  highlight,
  indent,
}: {
  label: string;
  value: string;
  explanation: string;
  bold?: boolean;
  highlight?: boolean;
  indent?: boolean;
}) {
  return (
    <tr className={`border-b border-gb-border last:border-b-0 ${highlight ? "bg-green-50" : ""}`}>
      <td className={`px-4 py-2 ${indent ? "pl-8" : ""} ${bold ? "font-semibold text-gb-black" : "text-gb-black"}`}>
        {label}
      </td>
      <td className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${bold ? "font-semibold text-gb-black" : "text-gb-gray"}`}>
        {value}
      </td>
      <td className="px-4 py-2 text-xs text-gb-gray max-w-xs">
        {explanation}
      </td>
    </tr>
  );
}
