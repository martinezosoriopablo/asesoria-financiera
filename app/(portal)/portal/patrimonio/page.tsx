// app/(portal)/portal/patrimonio/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import { Loader } from "lucide-react";
import PortalPatrimonioResumen from "@/components/portal/patrimonio/PortalPatrimonioResumen";
import PortalPatrimonioInventario from "@/components/portal/patrimonio/PortalPatrimonioInventario";

export default function MiPatrimonioPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/portal/patrimonio")
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-gb-gray" /></div>;

  const seguros = (data?.seguros as Record<string, unknown>[]) ?? [];
  const inmuebles = (data?.inmuebles as Record<string, unknown>[]) ?? [];
  const activos = (data?.activos as Record<string, unknown>[]) ?? [];
  const resumen = data?.resumen as { activos?: { total?: number } } | undefined;
  const sinItems = seguros.length === 0 && inmuebles.length === 0 && activos.length === 0;
  const vacio = !error && sinItems && (!resumen || !resumen.activos || (resumen.activos.total ?? 0) === 0);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gb-black">Mi Patrimonio</h1>
        <p className="mt-1 text-sm text-gb-gray">Resumen de tus seguros, inmuebles e inversiones</p>
      </div>
      {error && <div className="rounded-lg border border-gb-border p-6 text-sm text-gb-gray">No se pudo cargar tu patrimonio. Intenta más tarde.</div>}
      {vacio && <div className="rounded-lg border border-gb-border p-6 text-sm text-gb-gray">Aún no hay información de patrimonio cargada. Tu asesor la irá completando.</div>}
      {data && !vacio && (
        <div className="space-y-6">
          {(data.resumen as object) && <PortalPatrimonioResumen resumen={data.resumen as never} rates={data.rates as never} />}
          <PortalPatrimonioInventario seguros={seguros} inmuebles={inmuebles} activos={activos} />
        </div>
      )}
    </main>
  );
}
