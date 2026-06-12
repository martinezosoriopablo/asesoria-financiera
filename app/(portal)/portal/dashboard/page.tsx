"use client";

import { useState, useEffect } from "react";
import SeguimientoPage from "@/components/seguimiento/SeguimientoPage";
import { Loader, AlertCircle } from "lucide-react";

export default function PortalDashboardPage() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.client?.id) {
          setClientId(data.client.id);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gb-gray">No se pudo cargar tu información. Intenta recargar la página.</p>
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="w-6 h-6 animate-spin text-gb-gray" />
      </div>
    );
  }

  return <SeguimientoPage clientId={clientId} portalMode />;
}
