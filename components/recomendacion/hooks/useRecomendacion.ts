"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { RecomendacionRow, Decision, VehiculosConfig, Vehiculo } from "@/lib/recomendacion/types";
import { sumaPesos } from "@/lib/recomendacion/resolve";

const DEFAULT_VEHICULOS: VehiculosConfig = { rv: "fondos", rf: "fondos", alt: "fondos" };

export function useRecomendacion(clientId: string | null) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [rows, setRows] = useState<RecomendacionRow[]>([]);
  const [custodios, setCustodios] = useState<string[]>([]);
  const [custodiosDetectados, setCustodiosDetectados] = useState<string[]>([]);
  const [custodioAsumido, setCustodioAsumido] = useState(false);
  const [custodioOverride, setCustodioOverride] = useState<string[] | null>(null);
  const [comiteReportDate, setComiteReportDate] = useState<string | null>(null);
  const [perfilModelo, setPerfilModelo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [vehiculos, setVehiculos] = useState<VehiculosConfig>(DEFAULT_VEHICULOS);
  const [refetchKey, setRefetchKey] = useState(0);

  useEffect(() => {
    if (!clientId) { setRows([]); setOk(false); setReason(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const qs = custodioOverride && custodioOverride.length > 0 ? `&custodio=${custodioOverride.join(",")}` : "";
        const res = await fetch(`/api/comite/recomendacion?clientId=${clientId}${qs}`);
        const j = await res.json();
        const d = j.data || j;
        if (cancelled) return;
        setOk(!!d.ok); setReason(d.reason ?? null);
        setRows(d.rows || []); setCustodios(d.custodios || []);
        setCustodiosDetectados(d.custodios_detectados || []); setCustodioAsumido(!!d.custodio_asumido);
        setComiteReportDate(d.comite_report_date ?? null); setPerfilModelo(d.perfil_modelo ?? null);
        setVehiculos(d.vehiculos || DEFAULT_VEHICULOS);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [clientId, custodioOverride, refetchKey]);

  const setDecision = useCallback((categoria: string, patch: Partial<Decision>) => {
    setRows(prev => prev.map(r => r.categoria === categoria ? { ...r, decision: { ...r.decision, ...patch } } : r));
  }, []);

  const totalPeso = useMemo(() => sumaPesos(rows), [rows]);

  const setVehiculo = useCallback(async (clase: keyof VehiculosConfig, valor: Vehiculo) => {
    if (!clientId) return;
    const next = { ...vehiculos, [clase]: valor };
    setVehiculos(next);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ recomendacion_vehiculos: next }),
    });
    setRefetchKey(k => k + 1);
  }, [clientId, vehiculos]);

  const save = useCallback(async (cliente: { nombre: string; perfil: string; puntaje?: number }) => {
    if (!clientId) return { ok: false, error: "sin cliente" };
    setSaving(true);
    try {
      const res = await fetch("/api/comite/aplicar-cartera", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "comite_3col", clientId, cliente, posiciones: rows, comite_report_date: comiteReportDate, custodios }),
      });
      const j = await res.json();
      return { ok: !!j.success, error: j.error, version: j.data?.versionNumber };
    } finally { setSaving(false); }
  }, [clientId, rows, comiteReportDate, custodios]);

  return {
    loading, ok, reason, rows, custodios, custodiosDetectados, custodioAsumido,
    setCustodioOverride, comiteReportDate, perfilModelo, setDecision, totalPeso, save, saving,
    vehiculos, setVehiculo,
  };
}
