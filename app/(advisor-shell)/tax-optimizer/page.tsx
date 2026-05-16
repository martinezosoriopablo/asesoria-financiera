// app/(advisor-shell)/tax-optimizer/page.tsx
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TaxSimulator from "@/components/tax/TaxSimulator";

function TaxSimulatorWithParams() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId") || undefined;
  return <TaxSimulator initialClientId={clientId} />;
}

export default function TaxOptimizerPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white border-b border-gb-border px-6 py-4">
        <h1 className="text-2xl font-semibold text-gb-black">
          Simulador Tributario de Cambio de Custodia
        </h1>
        <p className="text-sm text-gb-gray mt-1">
          Calcula la estrategia optima para migrar fondos de AGF a corredora, considerando impacto tributario, ahorro en costos y reasignacion al perfil de riesgo.
        </p>
      </div>
      <div className="px-6">
        <Suspense fallback={<div className="text-gb-gray">Cargando simulador...</div>}>
          <TaxSimulatorWithParams />
        </Suspense>
      </div>
    </div>
  );
}
