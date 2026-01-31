import { RetirementProjection } from "@/lib/risk/life_expectancy";

interface RetirementSummaryProps {
  goalType: string;
  retirementData: {
    sexo: string;
    edadActual: number;
    edadJubilacion: number;
    pensionDeseada: number;
    fuma: boolean;
    salud: string;
  } | null;
  projection: RetirementProjection | null;
}

const GOAL_LABELS: Record<string, string> = {
  pension: "Pensión / Retiro",
  vivienda: "Compra de vivienda",
  educacion: "Educación de hijos",
  libertad: "Libertad financiera / Independencia",
  patrimonio: "Crecimiento de patrimonio",
  otro: "Otro",
};

function formatCLP(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function RetirementSummary({
  goalType,
  retirementData,
  projection,
}: RetirementSummaryProps) {
  return (
    <div className="mt-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
      <h3 className="text-sm font-semibold text-blue-900 mb-3">
        Resumen del objetivo
      </h3>

      <div className="space-y-2 text-sm text-blue-800">
        <div className="flex justify-between">
          <span className="font-medium">Objetivo principal:</span>
          <span>{GOAL_LABELS[goalType] ?? goalType}</span>
        </div>

        {goalType === "pension" && retirementData && projection && (
          <>
            <div className="border-t border-blue-200 my-2"></div>
            <div className="flex justify-between">
              <span className="font-medium">Edad actual:</span>
              <span>{retirementData.edadActual} años</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Edad de jubilación:</span>
              <span>{retirementData.edadJubilacion} años</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Pensión mensual deseada:</span>
              <span>{formatCLP(retirementData.pensionDeseada)}</span>
            </div>
            <div className="border-t border-blue-200 my-2"></div>
            <div className="flex justify-between">
              <span className="font-medium">Esperanza de vida estimada:</span>
              <span>{projection.esperanzaVida} años</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Años de retiro estimados:</span>
              <span>{projection.aniosRetiro} años</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Años para ahorrar:</span>
              <span>{projection.aniosParaAhorrar} años</span>
            </div>
            <div className="flex justify-between font-semibold text-blue-900 pt-1">
              <span>Capital estimado necesario:</span>
              <span>{formatCLP(projection.capitalEstimado)}</span>
            </div>
            <p className="text-xs text-blue-600 mt-2 italic">
              Estimación simplificada (sin ajuste por inflación ni rentabilidad).
              Basada en tablas de mortalidad TM-2020 chilenas.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
