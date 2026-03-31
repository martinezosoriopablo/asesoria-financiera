"use client";

import React, { useState, useEffect } from "react";
import {
  Send,
  Loader,
  CheckCircle2,
  Globe,
  TrendingUp,
  DollarSign,
  PieChart,
  FileText,
  Clock,
  Eye,
  Radio,
  Calendar,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import type { LucideIcon } from "lucide-react";

interface ReportConfig {
  frequency: string;
  send_daily_report: boolean;
  send_portfolio_report: boolean;
  send_macro: boolean;
  send_rv: boolean;
  send_rf: boolean;
  send_asset_allocation: boolean;
  freq_macro: string;
  freq_rv: string;
  freq_rf: string;
  freq_asset_allocation: string;
  send_day_of_week: number;
  send_day_of_month: number;
  last_sent_at: string | null;
}

interface Props {
  clientId: string;
}

type Freq = "none" | "weekly" | "monthly";

const FREQ_DISPLAY: Record<Freq, { label: string; bg: string; text: string }> = {
  none:    { label: "Off",      bg: "bg-slate-100", text: "text-slate-500" },
  weekly:  { label: "Semanal",  bg: "bg-blue-100",  text: "text-blue-700" },
  monthly: { label: "Mensual",  bg: "bg-blue-100",  text: "text-blue-700" },
};

function nextFreq(current: Freq): Freq {
  if (current === "none") return "weekly";
  if (current === "weekly") return "monthly";
  return "none";
}

const DAYS_OF_WEEK = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
];

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => i + 1);

interface ReportRowDef {
  key: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  // Field that stores the frequency for this report
  freqField: keyof ReportConfig;
  // For portfolio, we also need to sync send_portfolio_report + frequency
  isPortfolio?: boolean;
  // For daily, it's just on/off
  isDaily?: boolean;
}

const REPORT_ROWS: ReportRowDef[] = [
  { key: "daily",  label: "Reporte Diario AM/PM",  icon: Radio,      iconColor: "text-amber-500",   freqField: "send_daily_report", isDaily: true },
  { key: "portfolio", label: "Reporte de Cartera",  icon: FileText,   iconColor: "text-blue-500",    freqField: "frequency", isPortfolio: true },
  { key: "macro",  label: "Macro",                  icon: Globe,      iconColor: "text-emerald-500", freqField: "freq_macro" },
  { key: "rv",     label: "Renta Variable",         icon: TrendingUp, iconColor: "text-indigo-500",  freqField: "freq_rv" },
  { key: "rf",     label: "Renta Fija",             icon: DollarSign, iconColor: "text-amber-500",   freqField: "freq_rf" },
  { key: "aa",     label: "Asset Allocation",       icon: PieChart,   iconColor: "text-purple-500",  freqField: "freq_asset_allocation" },
];

export default function ReportConfigPanel({ clientId }: Props) {
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<{ market_commentary: string } | null>(null);

  useEffect(() => { fetchConfig(); }, [clientId]);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/report-config`);
      const data = await res.json();
      if (data.success) setConfig(data.config);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const saveConfig = async (updated: ReportConfig) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/clients/${clientId}/report-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch { /* silent */ } finally { setSaving(false); }
  };

  const update = (changes: Partial<ReportConfig>) => {
    if (!config) return;
    const updated = { ...config, ...changes };
    setConfig(updated);
    saveConfig(updated);
  };

  const getFreq = (row: ReportRowDef): Freq => {
    if (!config) return "none";
    if (row.isDaily) return config.send_daily_report ? "weekly" : "none"; // weekly just means "on"
    if (row.isPortfolio) {
      if (!config.send_portfolio_report || config.frequency === "none") return "none";
      return config.frequency as Freq;
    }
    return (config[row.freqField] as string || "none") as Freq;
  };

  const cycleReport = (row: ReportRowDef) => {
    if (!config) return;
    if (row.isDaily) {
      update({ send_daily_report: !config.send_daily_report });
      return;
    }
    if (row.isPortfolio) {
      const current = getFreq(row);
      const next = nextFreq(current);
      update({
        send_portfolio_report: next !== "none",
        frequency: next === "none" ? "none" : next,
      });
      return;
    }
    // Comité reports
    const current = getFreq(row);
    const next = nextFreq(current);
    const boolField = `send_${row.key}` as keyof ReportConfig;
    update({
      [row.freqField]: next,
      [boolField]: next !== "none",
    } as Partial<ReportConfig>);
  };

  const getDisplay = (row: ReportRowDef) => {
    const freq = getFreq(row);
    if (row.isDaily) {
      return freq !== "none"
        ? { label: "Activado", bg: "bg-amber-100", text: "text-amber-700" }
        : { label: "Off", bg: "bg-slate-100", text: "text-slate-500" };
    }
    return FREQ_DISPLAY[freq];
  };

  const handleSendNow = async () => {
    setSending(true);
    setSendResult(null);
    setPreviewReport(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setSendResult("Reporte enviado exitosamente");
        setPreviewReport(data.report);
        fetchConfig();
      } else {
        setSendResult(`Error: ${data.error}`);
      }
    } catch {
      setSendResult("Error de conexión");
    } finally { setSending(false); }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gb-border p-5">
        <div className="flex items-center gap-2 text-gb-gray">
          <Loader className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando configuración...</span>
        </div>
      </div>
    );
  }

  if (!config) return null;

  // Check if any report uses weekly or monthly for day selector
  const allFreqs = REPORT_ROWS.filter(r => !r.isDaily).map(r => getFreq(r));
  const hasWeekly = allFreqs.includes("weekly");
  const hasMonthly = allFreqs.includes("monthly");
  const hasAnyActive = allFreqs.some(f => f !== "none") || config.send_daily_report;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm">
      <div className="px-5 py-4 border-b border-gb-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gb-black flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-500" />
          Reportes al Cliente
        </h3>
        {saved && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Guardado
          </span>
        )}
      </div>

      {/* Report rows */}
      <div className="divide-y divide-slate-100">
        {REPORT_ROWS.map(row => {
          const Icon = row.icon;
          const display = getDisplay(row);
          return (
            <div key={row.key} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${row.iconColor}`} />
                <span className="text-sm text-gb-black">{row.label}</span>
              </div>
              <button
                onClick={() => cycleReport(row)}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors min-w-[72px] ${display.bg} ${display.text}`}
              >
                {display.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Day selector */}
      {(hasWeekly || hasMonthly) && (
        <div className="px-5 py-4 border-t border-gb-border space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gb-gray uppercase">
            <Calendar className="w-3.5 h-3.5" />
            Día de envío
          </div>

          {hasWeekly && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gb-gray w-16">Semanal:</span>
              <div className="flex gap-1">
                {DAYS_OF_WEEK.map(d => (
                  <button
                    key={d.value}
                    onClick={() => update({ send_day_of_week: d.value })}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      config.send_day_of_week === d.value
                        ? "bg-blue-600 text-white font-semibold"
                        : "bg-slate-100 text-gb-gray hover:bg-slate-200"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasMonthly && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gb-gray w-16">Mensual:</span>
              <select
                value={config.send_day_of_month}
                onChange={e => update({ send_day_of_month: parseInt(e.target.value) })}
                className="text-xs border border-gb-border rounded-md px-2 py-1 text-gb-black"
              >
                {DAYS_OF_MONTH.map(d => (
                  <option key={d} value={d}>Día {d}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-4 border-t border-gb-border space-y-3">
        {config.last_sent_at && (
          <div className="flex items-center gap-2 text-xs text-gb-gray">
            <Clock className="w-3 h-3" />
            Último envío: {formatDate(config.last_sent_at)}
          </div>
        )}

        <button
          onClick={handleSendNow}
          disabled={sending || !hasAnyActive}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {sending ? (
            <><Loader className="w-4 h-4 animate-spin" /> Generando...</>
          ) : (
            <><Send className="w-4 h-4" /> Enviar Reporte Ahora</>
          )}
        </button>

        {sendResult && (
          <div className={`text-xs p-3 rounded-lg ${
            sendResult.startsWith("Error")
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-green-50 text-green-700 border border-green-200"
          }`}>
            {sendResult}
          </div>
        )}

        {previewReport && previewReport.market_commentary && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setPreviewReport(null)}
              className="w-full px-4 py-2 bg-slate-50 text-xs font-medium text-gb-gray flex items-center gap-1 hover:bg-slate-100"
            >
              <Eye className="w-3 h-3" /> Preview — click para cerrar
            </button>
            <div className="p-4 text-sm text-gb-black leading-relaxed whitespace-pre-line">
              {previewReport.market_commentary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
