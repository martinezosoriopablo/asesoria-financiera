"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { RecomendacionRow, Decision } from "@/lib/recomendacion/types";
import { sumaPesos } from "@/lib/recomendacion/resolve";

export function useRecomendacion(clientId: string | null) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [rows, setRows] = useState<RecomendacionRow[]>([]);
  const [custodios, setCustodios] = useState<string[]>([]);
  const [comiteReportDate, setComiteReportDate] = useState<string | null>(null);
  const [perfilModelo, setPerfilModelo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientId) { setRows([]); setOk(false); setReason(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/comite/recomendacion?clientId=${clientId}`);
        const j = await res.json();
        const d = j.data || j;
        if (cancelled) return;
        setOk(!!d.ok); setReason(d.reason ?? null);
        setRows(d.rows || []); setCustodios(d.custodios || []);
        setComiteReportDate(d.comite_report_date ?? null); setPerfilModelo(d.perfil_modelo ?? null);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const setDecision = useCallback((categoria: string, patch: Partial<Decision>) => {
    setRows(prev => prev.map(r => r.categoria === categoria ? { ...r, decision: { ...r.decision, ...patch } } : r));
  }, []);

  const totalPeso = useMemo(() => sumaPesos(rows), [rows]);

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

  return { loading, ok, reason, rows, custodios, comiteReportDate, perfilModelo, setDecision, totalPeso, save, saving };
}
