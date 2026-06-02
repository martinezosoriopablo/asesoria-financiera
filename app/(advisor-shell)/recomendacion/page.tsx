"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ClientSelector from "@/components/shared/ClientSelector";
import type { ClientOption } from "@/components/shared/ClientSelector";

export default function RecomendacionSelectorPage() {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gb-black">Radiografia</h1>
        <p className="text-sm text-gb-gray mt-1">
          Compara las posiciones del cliente contra el portafolio modelo del comite
        </p>
      </div>
      <div className="max-w-md">
        <ClientSelector
          value={clientId}
          onChange={(client: ClientOption | null) => {
            const id = client?.id ?? null;
            setClientId(id);
            if (id) router.push(`/recomendacion/${id}`);
          }}
        />
      </div>
    </div>
  );
}
