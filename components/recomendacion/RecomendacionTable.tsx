"use client";

import React, { useState, useRef, useCallback } from "react";
import { Search, X, Loader } from "lucide-react";
import type { RecomendacionRow, Decision } from "@/lib/recomendacion/types";
import { roleToClase } from "@/lib/recomendacion/resolve";

interface SearchResult {
  id: string;
  fo_run?: number;
  serie?: string;
  nombre: string;
  agf?: string;
  ticker?: string | null;
  tac?: number | null;
  rent_12m?: number | null;
  isPreferred?: boolean;
}

interface Props {
  rows: RecomendacionRow[];
  setDecision: (categoria: string, patch: Partial<Decision>) => void;
  totalPeso: number;
}

// Redondea a máx. 2 decimales solo para mostrar (evita "9.166666…%").
// No muta el estado: el valor real se conserva para que el total sume exactamente 100.
const fmtPct = (n: number) => String(Math.round((n + Number.EPSILON) * 100) / 100);

function vistaBadge(vista: string | null) {
  if (!vista) return null;
  const up = vista.toUpperCase();
  const color = up === "OW" ? "bg-green-100 text-green-700" : up === "UW" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>{up}</span>;
}

export default function RecomendacionTable({ rows, setDecision, totalPeso }: Props) {
  const [searchingCat, setSearchingCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/fondos/search-price?q=${encodeURIComponent(q)}&type=fund`);
      const j = await res.json();
      if (j.success) setResults(j.results || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const onQuery = useCallback((v: string) => {
    setQuery(v);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => runSearch(v), 400);
  }, [runSearch]);

  const pesoOk = Math.abs(totalPeso - 100) <= 0.5;

  const normalizar = () => {
    if (totalPeso <= 0) return;
    const factor = 100 / totalPeso;
    rows.forEach(r => setDecision(r.categoria, { porcentaje: Math.round(r.decision.porcentaje * factor * 10) / 10 }));
  };

  // Resumen por rol (RV/RF/Alt/Caja)
  const porRol: Record<string, number> = {};
  for (const r of rows) porRol[roleToClase(r.role)] = (porRol[roleToClase(r.role)] || 0) + (r.decision.porcentaje || 0);

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-gb-border">
              <th className="text-left px-3 py-2 font-semibold text-gb-gray">Comité</th>
              <th className="text-left px-3 py-2 font-semibold text-gb-gray">Mis Fondos</th>
              <th className="text-left px-3 py-2 font-semibold text-gb-gray">Decisión</th>
              <th className="text-right px-3 py-2 font-semibold text-gb-gray w-20">Peso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gb-border">
            {rows.map((row) => {
              const isSearching = searchingCat === row.categoria;
              const etf = row.comite.etf_us || row.comite.etf_ucits;
              return (
                <React.Fragment key={row.categoria}>
                  <tr>
                    {/* Comité */}
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gb-black">{row.label}</span>
                        {vistaBadge(row.comite.vista)}
                      </div>
                      <div className="text-[10px] text-gb-gray mt-0.5">
                        {fmtPct(row.comite.modelo_pct)}% · {etf || "—"}{row.comite.conviction ? ` · conv. ${row.comite.conviction}` : ""}
                      </div>
                    </td>

                    {/* Mis Fondos */}
                    <td className="px-3 py-2 align-top">
                      {row.misFondos.length === 0 ? (
                        <span className="text-gb-gray italic">Sin equivalente en el custodio</span>
                      ) : (
                        <div className="space-y-1">
                          {row.misFondos.slice(0, 3).map((f) => (
                            <button
                              key={f.fund_id}
                              onClick={() => setDecision(row.categoria, {
                                fuente: "mi_fondo", ticker: f.ticker ?? (f.fund_run ? String(f.fund_run) : null),
                                nombre: f.nombre, custodian_type: f.custodian_type, clase: roleToClase(row.role),
                              })}
                              className="block w-full text-left px-2 py-1 rounded border border-gb-border hover:bg-slate-50"
                            >
                              <span className="font-medium text-gb-black">
                                {f.isMapped && <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-700 font-semibold mr-1">MI FONDO</span>}
                                {f.nombre}
                              </span>
                              <span className="text-[10px] text-gb-gray"> · {f.custodian_type}{f.tac != null ? ` · TAC ${f.tac}%` : ""}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Decisión */}
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-gb-black">{row.decision.nombre}</div>
                      <div className="text-[10px] text-gb-gray mt-0.5 flex items-center gap-2">
                        <span className="px-1 py-0 rounded bg-slate-100">{row.decision.fuente}</span>
                        {etf && (
                          <button className="text-blue-600 hover:underline"
                            onClick={() => setDecision(row.categoria, { fuente: "comite_etf", ticker: etf, nombre: etf, clase: roleToClase(row.role) })}>
                            usar ETF comité
                          </button>
                        )}
                        <button className="text-gb-gray hover:underline"
                          onClick={() => setDecision(row.categoria, { fuente: "caja", ticker: null, nombre: "Caja", clase: roleToClase(row.role) })}>
                          caja
                        </button>
                        <button className="text-blue-600 hover:underline flex items-center gap-0.5"
                          onClick={() => { setSearchingCat(isSearching ? null : row.categoria); setQuery(""); setResults([]); }}>
                          <Search className="w-3 h-3" /> buscar
                        </button>
                      </div>
                    </td>

                    {/* Peso */}
                    <td className="px-3 py-2 text-right align-top">
                      <input
                        type="number" step="0.5" min="0" max="100"
                        value={fmtPct(row.decision.porcentaje)}
                        onChange={(e) => setDecision(row.categoria, { porcentaje: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                        className="w-16 px-1 py-0.5 text-xs text-right border border-gb-border rounded"
                      />
                    </td>
                  </tr>

                  {/* Buscador inline */}
                  {isSearching && (
                    <tr>
                      <td colSpan={4} className="px-3 py-2 bg-blue-50/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Search className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <input
                            type="text" value={query} onChange={(e) => onQuery(e.target.value)}
                            placeholder="Buscar fondo por nombre, RUN o AGF..."
                            className="flex-1 px-2 py-1.5 text-xs border border-gb-border rounded-md" autoFocus
                          />
                          <button onClick={() => { setSearchingCat(null); setQuery(""); setResults([]); }} className="text-gb-gray hover:text-red-500">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {loading && <div className="flex items-center gap-2 py-2 text-xs text-gb-gray"><Loader className="w-3 h-3 animate-spin" /> Buscando...</div>}
                        {results.length > 0 && (
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {results.slice(0, 10).map((r) => (
                              <button
                                key={r.id}
                                onClick={() => {
                                  setDecision(row.categoria, {
                                    fuente: "custom", ticker: r.ticker ?? (r.fo_run ? String(r.fo_run) : null),
                                    nombre: r.nombre, clase: roleToClase(row.role),
                                  });
                                  setSearchingCat(null); setQuery(""); setResults([]);
                                }}
                                className={`w-full text-left px-2 py-1.5 text-xs border rounded hover:bg-blue-50 flex items-center gap-2 ${r.isPreferred ? "bg-amber-50/50 border-amber-200" : "bg-white border-gb-border"}`}
                              >
                                <span className="flex-1 min-w-0">
                                  <span className="font-medium text-gb-black block truncate">
                                    {r.isPreferred && <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-700 font-semibold mr-1">MI FONDO</span>}
                                    {r.nombre}
                                  </span>
                                  <span className="text-gb-gray">{r.agf}{r.serie ? ` — Serie ${r.serie}` : ""}</span>
                                </span>
                                {r.tac != null && <span className="shrink-0 text-gb-gray">TAC {r.tac}%</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer: total + resumen por rol */}
      <div className="px-4 py-3 border-t border-gb-border bg-slate-50 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gb-gray uppercase font-medium">Total</span>
          <span className={`text-lg font-bold ${pesoOk ? "text-green-600" : "text-red-600"}`}>{totalPeso.toFixed(1)}%</span>
          {!pesoOk && (
            <button onClick={normalizar} className="text-xs px-2 py-1 border border-gb-border rounded bg-white hover:bg-slate-100">
              Normalizar a 100%
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gb-gray">
          {["Renta Variable", "Renta Fija", "Alternativos", "Cash"].map((clase) => (
            <span key={clase}>{clase}: <span className="font-medium text-gb-black">{(porRol[clase] || 0).toFixed(1)}%</span></span>
          ))}
        </div>
      </div>
    </div>
  );
}
