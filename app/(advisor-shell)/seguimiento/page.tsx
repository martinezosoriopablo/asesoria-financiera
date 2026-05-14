"use client";

import { useState } from "react";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { Loader, LineChart } from "lucide-react";
import ClientSelector, { type ClientOption } from "@/components/shared/ClientSelector";
import SeguimientoPage from "@/components/seguimiento/SeguimientoPage";

export default function SeguimientoStandalone() {
  const { loading: authLoading } = useAdvisor();
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with client selector */}
      <div className="bg-white border-b border-gb-border">
        <div className="max-w-6xl mx-auto px-5 py-5">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="shrink-0">
              <h1 className="text-2xl font-semibold text-gb-black">Seguimiento</h1>
              <p className="text-sm text-gb-gray mt-1">
                Evolución del portafolio, retornos y análisis de cartola
              </p>
            </div>
            <div className="md:ml-auto w-full md:w-80">
              <ClientSelector
                value={selectedClient?.id ?? null}
                onChange={(client) => setSelectedClient(client)}
                placeholder="Seleccionar cliente..."
                showRiskProfile
                filterStatus="activo"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {selectedClient ? (
        <SeguimientoPage clientId={selectedClient.id} />
      ) : (
        <div className="max-w-6xl mx-auto px-5 py-16 text-center">
          <LineChart className="w-12 h-12 text-gb-border mx-auto mb-3" />
          <p className="text-gb-gray">Selecciona un cliente para ver su seguimiento</p>
          <p className="text-xs text-gb-gray mt-1">
            Podrás ver la evolución del portafolio, retornos por posición y comparación con el benchmark
          </p>
        </div>
      )}
    </div>
  );
}
