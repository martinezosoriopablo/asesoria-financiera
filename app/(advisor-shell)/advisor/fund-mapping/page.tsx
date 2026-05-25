"use client";

import { useState, useEffect, useCallback } from "react";

interface Position {
  categoria: string;
  peso: number;
  etf_ref?: string;
}

interface PreferredFund {
  id: string;
  fund_run: string;
  fund_name: string | null;
  ticker: string | null;
  category: string | null;
  instrument_type: string;
  custodian_type: string;
}

interface MappingRow {
  id: string;
  categoria: string;
  custodian_type: string;
  preferred_fund_id: string;
  advisor_preferred_funds: PreferredFund;
}

const CUSTODIAN_TYPES = ["agf", "corredora", "internacional"] as const;
const CUSTODIAN_LABELS: Record<string, string> = {
  agf: "AGF",
  corredora: "Corredora",
  internacional: "Internacional",
};

export default function FundMappingPage() {
  const [categories, setCategories] = useState<Position[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [funds, setFunds] = useState<PreferredFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, mappingsRes, fundsRes] = await Promise.all([
        fetch("/api/comite/model-portfolios"),
        fetch("/api/advisor/fund-mapping"),
        fetch("/api/advisor/preferred-funds"),
      ]);

      const modelsData = await modelsRes.json();
      const mappingsData = await mappingsRes.json();
      const fundsData = await fundsRes.json();

      if (modelsData.success && modelsData.models?.length > 0) {
        const allPositions = new Map<string, Position>();
        for (const model of modelsData.models) {
          for (const pos of model.posiciones || []) {
            if (!allPositions.has(pos.categoria)) {
              allPositions.set(pos.categoria, pos);
            }
          }
        }
        setCategories(Array.from(allPositions.values()));
        setReportDate(modelsData.report_date);
      }

      if (mappingsData.success) setMappings(mappingsData.mappings || []);
      if (fundsData.success) setFunds(fundsData.funds || []);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getMapping = (categoria: string, custodianType: string) => {
    return mappings.find(
      (m) => m.categoria === categoria && m.custodian_type === custodianType
    );
  };

  const handleSelect = async (
    categoria: string,
    custodianType: string,
    fundId: string
  ) => {
    const key = `${categoria}-${custodianType}`;
    setSaving(key);
    try {
      if (!fundId) {
        const existing = getMapping(categoria, custodianType);
        if (existing) {
          await fetch(`/api/advisor/fund-mapping?id=${existing.id}`, {
            method: "DELETE",
          });
        }
      } else {
        await fetch("/api/advisor/fund-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoria,
            custodian_type: custodianType,
            preferred_fund_id: fundId,
          }),
        });
      }
      await fetchData();
    } catch {
      /* silent */
    }
    setSaving(null);
  };

  const fundsForType = (custodianType: string) => {
    return funds.filter((f) => f.custodian_type === custodianType);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white border-b border-gb-border pb-4 mb-6">
        <h1 className="text-2xl font-semibold text-gb-black">
          Mapeo de Fondos
        </h1>
        <p className="text-sm text-gb-gray mt-1">
          Asigna fondos preferidos a cada categoria del comite, por tipo de
          custodio
          {reportDate && (
            <span className="ml-2 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
              Comite: {reportDate}
            </span>
          )}
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12 text-gb-gray">
          <p className="text-lg mb-2">No hay carteras modelo cargadas</p>
          <p className="text-sm">
            Sube las carteras modelo desde el panel del Comite para empezar.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gb-border">
                <th className="text-left py-3 px-3 text-gb-gray font-medium w-48">
                  Categoria Comite
                </th>
                <th className="text-center py-3 px-2 text-gb-gray font-medium w-16">
                  Peso
                </th>
                <th className="text-center py-3 px-2 text-gb-gray font-medium w-16">
                  ETF Ref
                </th>
                {CUSTODIAN_TYPES.map((ct) => (
                  <th
                    key={ct}
                    className="text-left py-3 px-3 text-gb-gray font-medium"
                  >
                    {CUSTODIAN_LABELS[ct]}
                    <span className="text-xs text-gb-gray/60 ml-1">
                      ({fundsForType(ct).length})
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr
                  key={cat.categoria}
                  className="border-b border-gb-border/50 hover:bg-gray-50"
                >
                  <td className="py-3 px-3 font-medium">{cat.categoria}</td>
                  <td className="py-3 px-2 text-center text-gb-gray">
                    {cat.peso}%
                  </td>
                  <td className="py-3 px-2 text-center text-xs text-gb-gray font-mono">
                    {cat.etf_ref || "\u2014"}
                  </td>
                  {CUSTODIAN_TYPES.map((ct) => {
                    const mapping = getMapping(cat.categoria, ct);
                    const availableFunds = fundsForType(ct);
                    const key = `${cat.categoria}-${ct}`;
                    return (
                      <td key={ct} className="py-2 px-3">
                        <select
                          value={mapping?.preferred_fund_id || ""}
                          onChange={(e) =>
                            handleSelect(cat.categoria, ct, e.target.value)
                          }
                          disabled={
                            saving === key || availableFunds.length === 0
                          }
                          className="w-full text-xs border border-gb-border rounded px-2 py-1.5 disabled:opacity-50"
                        >
                          <option value="">&mdash; Sin asignar &mdash;</option>
                          {availableFunds.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.ticker ? `${f.ticker} \u2014 ` : ""}
                              {f.fund_name || f.fund_run}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
