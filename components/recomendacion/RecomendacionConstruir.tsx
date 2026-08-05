"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Loader, Save } from "lucide-react";
import RecomendacionTable from "@/components/recomendacion/RecomendacionTable";
import { useRecomendacion } from "@/components/recomendacion/hooks/useRecomendacion";

interface ClienteInfo { nombre: string; perfil: string; }

// Construye la recomendación del cliente desde la cartera-modelo del comité
// (3 columnas: Comité | Mis Fondos | Decisión) y la guarda en cartera_recomendada.
export default function RecomendacionConstruir({ clientId }: { clientId: string }) {
  const rec = useRecomendacion(clientId);
  const [cliente, setCliente] = useState<ClienteInfo>({ nombre: "", perfil: "" });
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}`);
        const j = await res.json();
        const c = j.data || j.client || j;
        if (cancelled) return;
        setCliente({
          nombre: `${c.nombre ?? ""} ${c.apellido ?? ""}`.trim() || (c.nombre ?? ""),
          perfil: c.perfil_riesgo ?? "",
        });
      } catch { /* ignore — la decisión se guarda igual con perfil del modelo */ }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const pesoOk = Math.abs(rec.totalPeso - 100) <= 0.5;

  const handleSave = async () => {
    setSaveMsg(null);
    const res = await rec.save({
      nombre: cliente.nombre,
      perfil: cliente.perfil || rec.perfilModelo || "",
    });
    setSaveMsg(res.ok ? `Recomendación guardada (versión ${res.version}).` : `Error: ${res.error || "no se pudo guardar"}`);
  };

  const reasonMsg = () => {
    switch (rec.reason) {
      case "sin_perfil":
        return <>Este cliente no tiene <strong>perfil de riesgo</strong>. Complétalo en <Link href={`/clients/${clientId}`} className="text-gb-info underline">Cartola &amp; Riesgo</Link> para mapearlo a una cartera del comité.</>;
      case "sin_modelo":
        return <>No hay <strong>cartera del comité</strong> cargada para el perfil <strong>{rec.perfilModelo}</strong>. Sube el JSON del comité en el panel de reportes del comité.</>;
      case "sin_custodio":
        return <>No se detecta un <strong>custodio</strong> en las cartolas de este cliente. Agrega una cartola con su custodio en Seguimiento.</>;
      default:
        return <>No se pudo armar la recomendación.</>;
    }
  };

  if (rec.loading) {
    return <div className="flex items-center justify-center py-20"><Loader className="w-6 h-6 text-gb-gray animate-spin" /></div>;
  }

  if (!rec.ok) {
    return <div className="max-w-2xl mx-auto bg-white border border-gb-border rounded-lg p-6 text-sm text-gb-black">{reasonMsg()}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gb-gray flex items-center gap-3 flex-wrap">
          <span>Perfil del comité: <strong className="text-gb-black">{rec.perfilModelo}</strong>
            {rec.comiteReportDate ? ` · comité ${rec.comiteReportDate}` : ""}</span>
          <span className="flex items-center gap-2">
            Custodio:
            {(["agf", "corredora", "internacional"] as const).map((c) => (
              <label key={c} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rec.custodios.includes(c)}
                  onChange={() => {
                    const cur = new Set(rec.custodios);
                    if (cur.has(c)) cur.delete(c); else cur.add(c);
                    rec.setCustodioOverride([...cur]);
                  }}
                />
                <span className={rec.custodiosDetectados.includes(c) ? "text-gb-black font-medium" : ""}>{c}</span>
              </label>
            ))}
          </span>
          <span className="flex items-center gap-2 flex-wrap">
            Vehículo:
            {(["rv", "rf", "alt"] as const).map((clase) => (
              <span key={clase} className="flex items-center gap-1">
                <span className="uppercase text-[10px] text-gb-gray">{clase}</span>
                <select
                  value={rec.vehiculos[clase]}
                  onChange={(e) => rec.setVehiculo(clase, e.target.value as "fondos" | "etf" | "directo")}
                  className="text-xs border border-gb-border rounded px-1 py-0.5"
                >
                  <option value="fondos">Fondos</option>
                  <option value="etf">ETF</option>
                  <option value="directo">Directo</option>
                </select>
              </span>
            ))}
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={!pesoOk || rec.saving}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white ${(!pesoOk || rec.saving) ? "bg-gb-gray/50 cursor-not-allowed" : "bg-gb-primary hover:bg-gb-primary/90"}`}
          title={!pesoOk ? "El peso total debe sumar 100%" : undefined}
        >
          {rec.saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar recomendación
        </button>
      </div>

      {saveMsg && (
        <div className={`text-sm px-3 py-2 rounded ${saveMsg.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{saveMsg}</div>
      )}

      {rec.custodioAsumido && (
        <div className="text-xs px-3 py-2 rounded bg-amber-50 text-amber-800 border border-amber-200">
          No se detectó custodio en las cartolas de este cliente — se asumió <strong>internacional</strong> (acceso a ETFs). Ajústalo con las casillas de arriba si corresponde.
        </div>
      )}

      <RecomendacionTable rows={rec.rows} setDecision={rec.setDecision} totalPeso={rec.totalPeso} />
    </div>
  );
}
