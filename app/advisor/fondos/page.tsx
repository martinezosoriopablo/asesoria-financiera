"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import {
  Loader,
  Plus,
  Trash2,
  Search,
  X,
  Star,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface PreferredFund {
  id: string;
  fund_run: string;
  fund_name: string | null;
  category: string | null;
  notes: string | null;
  added_at: string;
}

interface SearchResult {
  id: string;
  fo_run: number;
  fm_serie: string;
  nombre_fondo: string;
  nombre_agf: string;
  moneda: string;
  precio_actual: number | null;
  fecha_precio: string | null;
  tipo?: "FM" | "FI";
}

export default function AdvisorFondosPage() {
  const { advisor, loading: authLoading } = useAdvisor();
  const [funds, setFunds] = useState<PreferredFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});
  const [categoryInput, setCategoryInput] = useState<Record<string, string>>({});

  const fetchFunds = useCallback(async () => {
    try {
      const res = await fetch("/api/advisor/preferred-funds");
      const data = await res.json();
      if (data.success) {
        setFunds(data.funds || []);
      }
    } catch (error) {
      console.error("Error fetching preferred funds:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (advisor) fetchFunds();
  }, [advisor, fetchFunds]);

  const handleSearch = async () => {
    if (!searchTerm || searchTerm.length < 2) return;
    setSearching(true);
    try {
      // Search both FM and FI in parallel
      const [fmRes, fiRes] = await Promise.all([
        fetch(`/api/fondos/lookup?q=${encodeURIComponent(searchTerm)}`),
        fetch(`/api/fondos-inversion/lookup?q=${encodeURIComponent(searchTerm)}`),
      ]);
      const fmData = await fmRes.json();
      const fiData = await fiRes.json();

      const fmResults: SearchResult[] = (fmData.success ? fmData.results || [] : []).map((r: SearchResult) => ({
        ...r,
        tipo: "FM" as const,
      }));

      const fiResults: SearchResult[] = (fiData.success ? fiData.results || [] : []).map((r: { id: string; rut: string; nombre: string; administradora: string }) => ({
        id: r.id,
        fo_run: Number(r.rut),
        fm_serie: "FI",
        nombre_fondo: r.nombre,
        nombre_agf: r.administradora || "",
        moneda: "",
        precio_actual: null,
        fecha_precio: null,
        tipo: "FI" as const,
      }));

      setSearchResults([...fmResults, ...fiResults]);
    } catch (error) {
      console.error("Error searching funds:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (result: SearchResult) => {
    const fundRun = `${result.fo_run}-${result.fm_serie}`;
    setAdding(fundRun);
    try {
      const res = await fetch("/api/advisor/preferred-funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fund_run: fundRun,
          fund_name: result.nombre_fondo,
          category: categoryInput[fundRun] || null,
          notes: noteInput[fundRun] || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchFunds();
        // Remove from search results
        setSearchResults((prev) => prev.filter((r) => `${r.fo_run}-${r.fm_serie}` !== fundRun));
      }
    } catch (error) {
      console.error("Error adding fund:", error);
    } finally {
      setAdding(null);
    }
  };

  const handleDelete = async (fundId: string) => {
    setDeleting(fundId);
    try {
      const res = await fetch(`/api/advisor/preferred-funds?id=${fundId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setFunds((prev) => prev.filter((f) => f.id !== fundId));
      }
    } catch (error) {
      console.error("Error deleting fund:", error);
    } finally {
      setDeleting(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/advisor"
              className="p-1.5 rounded-md hover:bg-white text-gb-gray hover:text-gb-black transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gb-black flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                Mis Fondos Preferidos
              </h1>
              <p className="text-sm text-gb-gray mt-0.5">
                Fondos que se priorizan en recomendaciones de cartera generadas por IA
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setShowSearch(true);
              setSearchResults([]);
              setSearchTerm("");
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gb-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar Fondo
          </button>
        </div>

        {/* Search Modal */}
        {showSearch && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gb-border">
                <h2 className="text-base font-semibold text-gb-black">Buscar Fondo</h2>
                <button
                  onClick={() => setShowSearch(false)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gb-gray"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-3 border-b border-gb-border">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Buscar por nombre o RUN del fondo..."
                      className="w-full pl-9 pr-3 py-2 border border-gb-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gb-black/10"
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={searching || searchTerm.length < 2}
                    className="px-4 py-2 bg-gb-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    {searching ? <Loader className="w-4 h-4 animate-spin" /> : "Buscar"}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-3">
                {searchResults.length === 0 && !searching && (
                  <p className="text-sm text-gb-gray text-center py-8">
                    {searchTerm.length >= 2
                      ? "No se encontraron fondos"
                      : "Ingrese al menos 2 caracteres para buscar"}
                  </p>
                )}
                {searching && (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="w-5 h-5 text-gb-gray animate-spin" />
                  </div>
                )}
                {searchResults.map((result) => {
                  const fundRun = `${result.fo_run}-${result.fm_serie}`;
                  const alreadyAdded = funds.some((f) => f.fund_run === fundRun);
                  return (
                    <div
                      key={result.id}
                      className="flex items-center justify-between py-3 border-b border-gb-border last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gb-black truncate flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                            result.tipo === "FI" ? "bg-indigo-100 text-indigo-700" : "bg-teal-100 text-teal-700"
                          }`}>
                            {result.tipo || "FM"}
                          </span>
                          {result.nombre_fondo}
                        </p>
                        <p className="text-xs text-gb-gray">
                          {result.tipo === "FI" ? "RUT" : "RUN"}: {result.fo_run}{result.tipo !== "FI" ? ` | Serie: ${result.fm_serie}` : ""} | {result.nombre_agf}
                          {result.precio_actual
                            ? ` | Precio: $${result.precio_actual.toLocaleString()}`
                            : ""}
                        </p>
                        {!alreadyAdded && (
                          <div className="flex gap-2 mt-1.5">
                            <input
                              type="text"
                              placeholder="Categoria (ej: RV Nacional)"
                              value={categoryInput[fundRun] || ""}
                              onChange={(e) =>
                                setCategoryInput((prev) => ({ ...prev, [fundRun]: e.target.value }))
                              }
                              className="text-xs border border-gb-border rounded px-2 py-1 w-40"
                            />
                            <input
                              type="text"
                              placeholder="Nota (opcional)"
                              value={noteInput[fundRun] || ""}
                              onChange={(e) =>
                                setNoteInput((prev) => ({ ...prev, [fundRun]: e.target.value }))
                              }
                              className="text-xs border border-gb-border rounded px-2 py-1 w-40"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleAdd(result)}
                        disabled={alreadyAdded || adding === fundRun}
                        className={`ml-3 shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          alreadyAdded
                            ? "bg-green-100 text-green-700 cursor-default"
                            : "bg-gb-black text-white hover:bg-gray-800 disabled:opacity-50"
                        }`}
                      >
                        {alreadyAdded
                          ? "Ya agregado"
                          : adding === fundRun
                          ? "Agregando..."
                          : "Agregar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Funds Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="w-6 h-6 text-gb-gray animate-spin" />
          </div>
        ) : funds.length === 0 ? (
          <div className="bg-white rounded-xl border border-gb-border p-12 text-center">
            <Star className="w-10 h-10 text-gb-gray/40 mx-auto mb-3" />
            <p className="text-gb-gray text-sm">No tienes fondos preferidos aun.</p>
            <p className="text-gb-gray text-xs mt-1">
              Agrega fondos para que se prioricen en las recomendaciones de cartera.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gb-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gb-border bg-gray-50/50">
                  <th className="text-left text-xs font-semibold text-gb-gray px-5 py-3">Fondo</th>
                  <th className="text-left text-xs font-semibold text-gb-gray px-5 py-3">RUN</th>
                  <th className="text-left text-xs font-semibold text-gb-gray px-5 py-3">Categoria</th>
                  <th className="text-left text-xs font-semibold text-gb-gray px-5 py-3">Nota</th>
                  <th className="text-left text-xs font-semibold text-gb-gray px-5 py-3">Agregado</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {funds.map((fund) => (
                  <tr
                    key={fund.id}
                    className="border-b border-gb-border last:border-0 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gb-black flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                          fund.fund_run.endsWith("-FI") ? "bg-indigo-100 text-indigo-700" : "bg-teal-100 text-teal-700"
                        }`}>
                          {fund.fund_run.endsWith("-FI") ? "FI" : "FM"}
                        </span>
                        {fund.fund_name || "-"}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-mono text-gb-gray bg-gray-100 px-2 py-0.5 rounded">
                        {fund.fund_run}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gb-gray">
                      {fund.category || "-"}
                    </td>
                    <td className="px-5 py-3 text-sm text-gb-gray max-w-[200px] truncate">
                      {fund.notes || "-"}
                    </td>
                    <td className="px-5 py-3 text-xs text-gb-gray">
                      {fund.added_at
                        ? new Date(fund.added_at).toLocaleDateString("es-CL")
                        : "-"}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => handleDelete(fund.id)}
                        disabled={deleting === fund.id}
                        className="p-1.5 rounded-md text-gb-gray hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Eliminar de favoritos"
                      >
                        {deleting === fund.id ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Info box */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            <strong>Modo de seleccion por cliente:</strong> En la ficha de cada cliente puedes configurar
            si la IA debe usar solo tus fondos preferidos, preferirlos con fallback al universo CMF,
            o usar todos los fondos disponibles.
          </p>
        </div>
    </main>
  );
}
