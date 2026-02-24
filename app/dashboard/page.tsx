"use client";

import React, { useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/supabaseClient";
import {
  getBenchmarkFromScore,
  AssetAllocation,
} from "@/lib/risk/benchmarks";

interface RiskProfileRow {
  id: string;
  client_id: string;
  capacity_score: number | null;
  tolerance_score: number | null;
  perception_score: number | null;
  composure_score: number | null;
  global_score: number | null;
  profile_label: string | null;
  created_at: string;
}

export default function DashboardPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [profile, setProfile] = useState<RiskProfileRow | null>(null);
  const [includeAlternatives, setIncludeAlternatives] = useState(false);
  const [benchmark, setBenchmark] = useState<AssetAllocation | null>(null);

  const handleLoadProfile = async () => {
    setLoading(true);
    setErrorMsg(null);
    setProfile(null);
    setBenchmark(null);

    try {
      if (!email) {
        setErrorMsg("Ingresa un correo para buscar tu perfil.");
        return;
      }

      const supabase = supabaseBrowserClient();

      // 1. Buscar client por email
      const { data: clientRow, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (clientError) {
        console.error(clientError);
        setErrorMsg("Error buscando el cliente en la base de datos.");
        return;
      }

      if (!clientRow) {
        setErrorMsg(
          "No encontramos un cliente con ese correo. ¿Completaste el cuestionario de perfil de riesgo?"
        );
        return;
      }

      const clientId = clientRow.id;

      // 2. Traer el último perfil de riesgo de ese cliente
      const { data: profiles, error: profileError } = await supabase
        .from("risk_profiles")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (profileError) {
        console.error(profileError);
        setErrorMsg("Error buscando el perfil de riesgo.");
        return;
      }

      if (!profiles || profiles.length === 0) {
        setErrorMsg(
          "No encontramos perfiles de riesgo para este cliente. Completa primero el cuestionario."
        );
        return;
      }

      const lastProfile = profiles[0] as RiskProfileRow;
      setProfile(lastProfile);

      // 3. Calcular benchmark
      if (lastProfile.global_score != null) {
        const bm = getBenchmarkFromScore(
          lastProfile.global_score,
          includeAlternatives,
          "global"
        );
        setBenchmark(bm);
      }
    } catch (error) {
      console.error(error);
      setErrorMsg("Ocurrió un error inesperado al cargar el perfil.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
            Dashboard del Cliente
          </h1>
          <p className="text-slate-600 mt-2">
            Consulta el último perfil de riesgo registrado y el benchmark
            estratégico sugerido para tus inversiones.
          </p>
        </header>

        {/* Buscador por email */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Buscar cliente
          </h2>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Correo del cliente
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Debe ser el mismo correo usado al completar el cuestionario de
                perfil de riesgo.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={includeAlternatives}
                  onChange={(e) =>
                    setIncludeAlternatives(e.target.checked)
                  }
                  className="h-4 w-4"
                />
                Incluir alternativos en el benchmark
              </label>

              <button
                type="button"
                onClick={handleLoadProfile}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "Cargando..." : "Cargar perfil"}
              </button>
            </div>
          </div>

          {errorMsg && (
            <p className="mt-4 text-sm text-rose-600">{errorMsg}</p>
          )}
        </section>

        {/* Resultado del perfil + benchmark */}
        {profile && (
          <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Perfil de riesgo del cliente
            </h2>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-sm font-semibold">
                {profile.profile_label ?? "Perfil sin etiqueta"}{" "}
                {profile.global_score != null &&
                  ` (${profile.global_score.toFixed(1)}/100)`}
              </span>
              <span className="text-xs text-slate-500">
                Última actualización:{" "}
                {new Date(profile.created_at).toLocaleString()}
              </span>
            </div>

            {/* Gauges resumen */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <MiniGauge
                label="Capacidad"
                value={profile.capacity_score ?? 0}
              />
              <MiniGauge
                label="Tolerancia"
                value={profile.tolerance_score ?? 0}
              />
              <MiniGauge
                label="Percepción"
                value={profile.perception_score ?? 0}
              />
              <MiniGauge
                label="Comportamiento"
                value={profile.composure_score ?? 0}
              />
            </div>

            {/* Benchmark sugerido */}
            {benchmark && (
              <div className="mt-2">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">
                  Benchmark estratégico sugerido ({benchmark.band})
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-700">
                          Clase de activo
                        </th>
                        <th className="px-3 py-2 text-right text-slate-700">
                          Porcentaje
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-3 py-2 border-t border-slate-200">
                          Liquidez / MM
                        </td>
                        <td className="px-3 py-2 border-t border-slate-200 text-right">
                          {benchmark.weights.cash}%
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 border-t border-slate-200">
                          Renta fija
                        </td>
                        <td className="px-3 py-2 border-t border-slate-200 text-right">
                          {benchmark.weights.fixedIncome}%
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 border-t border-slate-200">
                          Renta variable
                        </td>
                        <td className="px-3 py-2 border-t border-slate-200 text-right">
                          {benchmark.weights.equities}%
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 border-t border-slate-200">
                          Alternativos
                        </td>
                        <td className="px-3 py-2 border-t border-slate-200 text-right">
                          {benchmark.weights.alternatives}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500 mt-4">
              Esta distribución estratégica es un punto de partida. En la
              práctica se ajusta a objetivos específicos, restricciones de
              liquidez, horizonte de inversión y necesidades tributarias del
              cliente.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

interface MiniGaugeProps {
  label: string;
  value: number;
}

function MiniGauge({ label, value }: MiniGaugeProps) {
  const safeValue = isNaN(value) ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className="border border-slate-100 rounded-lg p-4 flex flex-col">
      <span className="text-sm font-medium text-slate-700 mb-2">
        {label}
      </span>
      <div className="flex-1 flex flex-col justify-center">
        <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
          <div
            className="h-2 rounded-full bg-blue-600"
            style={{ width: `${safeValue}%` }}
          ></div>
        </div>
        <span className="text-sm font-semibold text-slate-900">
          {safeValue.toFixed(1)}/100
        </span>
      </div>
    </div>
  );
}

