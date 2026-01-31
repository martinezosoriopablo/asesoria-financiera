// lib/portfolio/commentary.ts

import { TiltInfo } from "@/lib/risk/tilt";

// Tipo para las filas consolidadas que recibe la función
export interface ConsolidatedRow {
  assetClass: "Renta variable" | "Renta fija" | "Alternativos";
  blockId: string;
  label: string;
  neutral: number;
  model: number;
  tilt: TiltInfo;
}

// Helper para obtener descripción de un tilt
function getTiltDescription(tilt: TiltInfo): string {
  const absDiff = Math.abs(tilt.diff);
  
  if (tilt.level === "neutral") {
    return "posición neutral";
  }
  
  if (tilt.level === "overweight_strong") {
    return `sobreponderación significativa (+${absDiff.toFixed(1)} pp)`;
  }
  
  if (tilt.level === "overweight") {
    return `sobreponderación moderada (+${absDiff.toFixed(1)} pp)`;
  }
  
  if (tilt.level === "underweight_strong") {
    return `subponderación significativa (${tilt.diff.toFixed(1)} pp)`;
  }
  
  if (tilt.level === "underweight") {
    return `subponderación moderada (${tilt.diff.toFixed(1)} pp)`;
  }
  
  return "posición neutral";
}

// Helper para generar texto de múltiples tilts
function describeTilts(rows: ConsolidatedRow[], assetClass: string): string {
  if (rows.length === 0) return "";
  
  const significantTilts = rows
    .filter(r => r.tilt.level !== "neutral")
    .sort((a, b) => Math.abs(b.tilt.diff) - Math.abs(a.tilt.diff));
  
  if (significantTilts.length === 0) {
    return `En ${assetClass.toLowerCase()}, el modelo mantiene ponderaciones alineadas con el benchmark estratégico.`;
  }
  
  // Agrupar por tipo de tilt
  const overweights = significantTilts.filter(r => 
    r.tilt.level === "overweight" || r.tilt.level === "overweight_strong"
  );
  const underweights = significantTilts.filter(r => 
    r.tilt.level === "underweight" || r.tilt.level === "underweight_strong"
  );
  
  let text = `En ${assetClass.toLowerCase()}, `;
  
  // Describir overweights
  if (overweights.length > 0) {
    const owDescriptions = overweights.slice(0, 3).map(r => 
      `${r.label.toLowerCase()} (${getTiltDescription(r.tilt)})`
    );
    
    if (owDescriptions.length === 1) {
      text += `el modelo presenta ${owDescriptions[0]}`;
    } else if (owDescriptions.length === 2) {
      text += `el modelo sobrepesa ${owDescriptions.join(" y ")}`;
    } else {
      text += `el modelo sobrepesa ${owDescriptions.slice(0, -1).join(", ")} y ${owDescriptions[owDescriptions.length - 1]}`;
    }
  }
  
  // Conectar con underweights
  if (overweights.length > 0 && underweights.length > 0) {
    text += ", mientras que ";
  } else if (underweights.length > 0) {
    text += "el modelo ";
  }
  
  // Describir underweights
  if (underweights.length > 0) {
    const uwDescriptions = underweights.slice(0, 3).map(r => 
      `${r.label.toLowerCase()} (${getTiltDescription(r.tilt)})`
    );
    
    if (overweights.length > 0) {
      if (uwDescriptions.length === 1) {
        text += `subpondera ${uwDescriptions[0]}`;
      } else if (uwDescriptions.length === 2) {
        text += `subpondera ${uwDescriptions.join(" y ")}`;
      } else {
        text += `subpondera ${uwDescriptions.slice(0, -1).join(", ")} y ${uwDescriptions[uwDescriptions.length - 1]}`;
      }
    } else {
      if (uwDescriptions.length === 1) {
        text += `presenta ${uwDescriptions[0]}`;
      } else if (uwDescriptions.length === 2) {
        text += `subpondera ${uwDescriptions.join(" y ")}`;
      } else {
        text += `subpondera ${uwDescriptions.slice(0, -1).join(", ")} y ${uwDescriptions[uwDescriptions.length - 1]}`;
      }
    }
  }
  
  text += ".";
  return text;
}

// Helper para generar el resumen ejecutivo (primer párrafo)
function generateExecutiveSummary(
  equityRows: ConsolidatedRow[],
  fixedIncomeRows: ConsolidatedRow[],
  alternativeRows: ConsolidatedRow[]
): string {
  const allTilts = [...equityRows, ...fixedIncomeRows, ...alternativeRows];
  
  const strongTilts = allTilts.filter(r => 
    r.tilt.level === "overweight_strong" || r.tilt.level === "underweight_strong"
  );
  
  const moderateTilts = allTilts.filter(r => 
    r.tilt.level === "overweight" || r.tilt.level === "underweight"
  );
  
  if (strongTilts.length === 0 && moderateTilts.length === 0) {
    return "El modelo de inversión propuesto mantiene una asignación estratégica alineada con el benchmark de referencia, sin desviaciones significativas en ninguna clase de activo.";
  }
  
  let summary = "El modelo de inversión propuesto presenta ";
  
  if (strongTilts.length > 0) {
    const topTilt = strongTilts.sort((a, b) => Math.abs(b.tilt.diff) - Math.abs(a.tilt.diff))[0];
    const direction = topTilt.tilt.diff > 0 ? "sobreponderación" : "subponderación";
    summary += `una ${direction} significativa en ${topTilt.label.toLowerCase()} `;
    summary += `(${Math.abs(topTilt.tilt.diff).toFixed(1)} pp vs. benchmark)`;
    
    if (strongTilts.length > 1) {
      summary += `, junto con ${strongTilts.length - 1} ${strongTilts.length === 2 ? 'otro ajuste significativo' : 'otros ajustes significativos'}`;
    }
    
    if (moderateTilts.length > 0) {
      summary += ` y ${moderateTilts.length} ${moderateTilts.length === 1 ? 'ajuste moderado' : 'ajustes moderados'}`;
    }
  } else {
    summary += `${moderateTilts.length} ${moderateTilts.length === 1 ? 'ajuste moderado' : 'ajustes moderados'}`;
  }
  
  summary += " respecto al benchmark estratégico.";
  return summary;
}

// Helper para generar la justificación estratégica (tercer párrafo)
function generateStrategicRationale(
  equityRows: ConsolidatedRow[],
  fixedIncomeRows: ConsolidatedRow[],
  alternativeRows: ConsolidatedRow[]
): string {
  const allTilts = [...equityRows, ...fixedIncomeRows, ...alternativeRows];
  
  const significantTilts = allTilts
    .filter(r => r.tilt.level !== "neutral")
    .sort((a, b) => Math.abs(b.tilt.diff) - Math.abs(a.tilt.diff));
  
  if (significantTilts.length === 0) {
    return "Esta asignación neutral refleja una estrategia conservadora orientada a replicar el comportamiento del benchmark con mínima desviación.";
  }
  
  const hasStrongOverweights = significantTilts.some(r => r.tilt.level === "overweight_strong");
  const hasStrongUnderweights = significantTilts.some(r => r.tilt.level === "underweight_strong");
  
  let rationale = "Estos ajustes ";
  
  if (hasStrongOverweights || hasStrongUnderweights) {
    rationale += "reflejan una visión táctica ";
    
    if (hasStrongOverweights && hasStrongUnderweights) {
      rationale += "diferenciada, ";
    } else if (hasStrongOverweights) {
      rationale += "constructiva, ";
    } else {
      rationale += "cauta, ";
    }
  } else {
    rationale += "representan modificaciones moderadas ";
  }
  
  rationale += "diseñadas para optimizar el perfil de riesgo-retorno del portafolio ";
  rationale += "manteniendo una adecuada diversificación ";
  rationale += "y considerando las perspectivas de mercado de mediano plazo.";
  
  return rationale;
}

/**
 * Genera comentarios narrativos profesionales en español a partir de los tilts del modelo.
 * 
 * @param rows - Array de filas consolidadas con información de tilts
 * @returns Objeto con comentarios en diferentes niveles de detalle
 * 
 * @example
 * const commentary = generateModelCommentary(consolidatedRows);
 * console.log(commentary.full); // Comentario completo de 3 párrafos
 * console.log(commentary.brief); // Resumen ejecutivo de 1 párrafo
 */
export function generateModelCommentary(rows: ConsolidatedRow[]): {
  full: string;
  brief: string;
  byAssetClass: {
    equity: string;
    fixedIncome: string;
    alternatives: string;
  };
} {
  // Separar por clase de activo
  const equityRows = rows.filter(r => r.assetClass === "Renta variable");
  const fixedIncomeRows = rows.filter(r => r.assetClass === "Renta fija");
  const alternativeRows = rows.filter(r => r.assetClass === "Alternativos");
  
  // Generar descripción por clase de activo
  const equityText = describeTilts(equityRows, "Renta variable");
  const fixedIncomeText = describeTilts(fixedIncomeRows, "Renta fija");
  const alternativeText = alternativeRows.length > 0 
    ? describeTilts(alternativeRows, "Alternativos")
    : "";
  
  // Generar resumen ejecutivo
  const executiveSummary = generateExecutiveSummary(
    equityRows,
    fixedIncomeRows,
    alternativeRows
  );
  
  // Generar justificación estratégica
  const strategicRationale = generateStrategicRationale(
    equityRows,
    fixedIncomeRows,
    alternativeRows
  );
  
  // Construir comentario completo
  const paragraphs = [executiveSummary];
  
  if (equityText) paragraphs.push(equityText);
  if (fixedIncomeText) paragraphs.push(fixedIncomeText);
  if (alternativeText) paragraphs.push(alternativeText);
  
  paragraphs.push(strategicRationale);
  
  const fullCommentary = paragraphs.join("\n\n");
  
  return {
    full: fullCommentary,
    brief: executiveSummary,
    byAssetClass: {
      equity: equityText,
      fixedIncome: fixedIncomeText,
      alternatives: alternativeText,
    },
  };
}

/**
 * Genera una versión HTML del comentario con formato profesional
 * para incluir en emails o reportes web
 */
export function generateModelCommentaryHTML(rows: ConsolidatedRow[]): string {
  const commentary = generateModelCommentary(rows);
  
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; line-height: 1.6;">
      <h3 style="color: #1e40af; margin-bottom: 16px; font-size: 18px; font-weight: 600;">
        Comentario del Modelo de Inversión
      </h3>
      
      <div style="margin-bottom: 20px;">
        <p style="margin-bottom: 12px; text-align: justify;">
          ${commentary.brief}
        </p>
      </div>
      
      ${commentary.byAssetClass.equity ? `
        <div style="margin-bottom: 12px; padding-left: 16px; border-left: 3px solid #3b82f6;">
          <p style="margin: 0; text-align: justify;">
            ${commentary.byAssetClass.equity}
          </p>
        </div>
      ` : ''}
      
      ${commentary.byAssetClass.fixedIncome ? `
        <div style="margin-bottom: 12px; padding-left: 16px; border-left: 3px solid #64748b;">
          <p style="margin: 0; text-align: justify;">
            ${commentary.byAssetClass.fixedIncome}
          </p>
        </div>
      ` : ''}
      
      ${commentary.byAssetClass.alternatives ? `
        <div style="margin-bottom: 12px; padding-left: 16px; border-left: 3px solid #6366f1;">
          <p style="margin: 0; text-align: justify;">
            ${commentary.byAssetClass.alternatives}
          </p>
        </div>
      ` : ''}
      
      <div style="margin-top: 20px; padding: 12px; background-color: #f8fafc; border-radius: 8px;">
        <p style="margin: 0; font-size: 14px; color: #475569; text-align: justify;">
          ${commentary.full.split('\n\n').pop()}
        </p>
      </div>
    </div>
  `;
  
  return html;
}

/**
 * Versión simplificada para tooltips o previews cortos
 */
export function generateBriefSummary(rows: ConsolidatedRow[]): string {
  const significantTilts = rows
    .filter(r => r.tilt.level !== "neutral")
    .sort((a, b) => Math.abs(b.tilt.diff) - Math.abs(a.tilt.diff))
    .slice(0, 2);
  
  if (significantTilts.length === 0) {
    return "Modelo alineado con benchmark";
  }
  
  const descriptions = significantTilts.map(r => {
    const direction = r.tilt.diff > 0 ? "+" : "";
    return `${r.label}: ${direction}${r.tilt.diff.toFixed(1)}pp`;
  });
  
  return descriptions.join(" • ");
}
