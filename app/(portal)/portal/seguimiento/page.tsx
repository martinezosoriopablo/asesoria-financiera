"use client";

import { useState, useEffect } from "react";
import SeguimientoPage from "@/components/seguimiento/SeguimientoPage";
import { Loader } from "lucide-react";

export default function PortalSeguimientoPage() {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.client?.id) setClientId(data.client.id);
      })
      .catch(() => {});
  }, []);

  if (!clientId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="w-6 h-6 animate-spin text-gb-gray" />
      </div>
    );
  }

  return <SeguimientoPage clientId={clientId} portalMode />;
}
