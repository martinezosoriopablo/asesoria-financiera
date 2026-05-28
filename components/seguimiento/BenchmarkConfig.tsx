"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Settings, Check, Plus, Trash2 } from "lucide-react";
import type { BenchmarkComponent } from "@/lib/prices/types";

interface Props {
  clientId: string;
  onBenchmarkChange?: (benchmark: BenchmarkComponent[]) => void;
}

const PRESETS: { label: string; config: BenchmarkComponent[] }[] = [
  { label: "UF + 2%", config: [{ ticker: "UF", weight: 1.0, spread: 2.0 }] },
  { label: "UF + 3%", config: [{ ticker: "UF", weight: 1.0, spread: 3.0 }] },
  {
    label: "60/40 Global",
    config: [
      { ticker: "ACWI", weight: 0.6 },
      { ticker: "AGG", weight: 0.4 },
    ],
  },
  {
    label: "80/20 Agresivo",
    config: [
      { ticker: "ACWI", weight: 0.8 },
      { ticker: "AGG", weight: 0.2 },
    ],
  },
  { label: "MSCI ACWI 100%", config: [{ ticker: "ACWI", weight: 1.0 }] },
];

export default function BenchmarkConfig({ clientId, onBenchmarkChange }: Props) {
  const [benchmark, setBenchmark] = useState<BenchmarkComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const stableOnChange = useCallback(
    (b: BenchmarkComponent[]) => onBenchmarkChange?.(b),
    [onBenchmarkChange]
  );

  useEffect(() => {
    fetch(`/api/clients/${clientId}/benchmark`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setBenchmark(d.data.benchmark);
          stableOnChange(d.data.benchmark);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, stableOnChange]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/benchmark`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmark }),
      });
      const d = await res.json();
      if (d.success) {
        setDirty(false);
        stableOnChange(benchmark);
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (config: BenchmarkComponent[]) => {
    setBenchmark(config);
    setDirty(true);
  };

  const updateComponent = (
    idx: number,
    field: keyof BenchmarkComponent,
    value: string | number
  ) => {
    const next = [...benchmark];
    next[idx] = { ...next[idx], [field]: value };
    setBenchmark(next);
    setDirty(true);
  };

  const removeComponent = (idx: number) => {
    setBenchmark(benchmark.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const addComponent = () => {
    setBenchmark([...benchmark, { ticker: "", weight: 0 }]);
    setDirty(true);
  };

  const totalWeight = benchmark.reduce((s, b) => s + (b.weight || 0), 0);
  const label = benchmark
    .map((b) => {
      const parts = [b.ticker, `${(b.weight * 100).toFixed(0)}%`];
      if (b.spread) parts.push(`+${b.spread}%`);
      return parts.join(" ");
    })
    .join(" / ");

  if (loading) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-gb-gray hover:text-gb-black transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
        <span>Benchmark: {label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gb-border rounded-lg shadow-lg p-4 w-96">
          <h4 className="text-sm font-semibold text-gb-black mb-3">
            Configurar Benchmark
          </h4>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.config)}
                className="text-xs px-2 py-1 rounded border border-gb-border hover:bg-gb-light transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom components */}
          <div className="space-y-2 mb-3">
            {benchmark.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={b.ticker}
                  onChange={(e) =>
                    updateComponent(i, "ticker", e.target.value.toUpperCase())
                  }
                  placeholder="Ticker"
                  className="w-20 text-xs border border-gb-border rounded px-2 py-1"
                />
                <input
                  type="number"
                  value={(b.weight * 100).toFixed(0)}
                  onChange={(e) =>
                    updateComponent(
                      i,
                      "weight",
                      parseFloat(e.target.value) / 100 || 0
                    )
                  }
                  placeholder="%"
                  className="w-16 text-xs border border-gb-border rounded px-2 py-1 text-right"
                  min={0}
                  max={100}
                />
                <span className="text-xs text-gb-gray">%</span>
                {b.ticker === "UF" && (
                  <>
                    <span className="text-xs text-gb-gray">+</span>
                    <input
                      type="number"
                      value={b.spread || 0}
                      onChange={(e) =>
                        updateComponent(
                          i,
                          "spread",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-14 text-xs border border-gb-border rounded px-2 py-1 text-right"
                      step={0.5}
                    />
                    <span className="text-xs text-gb-gray">%</span>
                  </>
                )}
                <button
                  onClick={() => removeComponent(i)}
                  className="text-gb-gray hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={addComponent}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar componente
            </button>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs ${Math.abs(totalWeight - 1) > 0.01 ? "text-red-500" : "text-gb-gray"}`}
              >
                Total: {(totalWeight * 100).toFixed(0)}%
              </span>
              <button
                onClick={handleSave}
                disabled={
                  saving || !dirty || Math.abs(totalWeight - 1) > 0.01
                }
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gb-black text-white rounded hover:bg-gb-black/90 disabled:opacity-40 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
