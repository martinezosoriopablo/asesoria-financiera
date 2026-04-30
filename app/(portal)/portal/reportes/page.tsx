"use client";

import { useEffect, useState } from "react";
import PortalTopbar from "@/components/portal/PortalTopbar";
import {
  Loader,
  FileText,
  Calendar,
  Globe,
  TrendingUp,
  DollarSign,
  PieChart,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface Holding {
  fundName?: string;
  nombre?: string;
  assetClass?: string;
  tipo?: string;
  marketValue?: number;
  valor?: number;
}

interface SnapshotSummary {
  date: string;
  total_value: number;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  equity_value: number;
  fixed_income_value: number;
  alternatives_value: number;
  cash_value: number;
  holdings: Holding[] | null;
  cumulative_return: number | null;
  prev_value: number | null;
  prev_date: string | null;
}

interface ComiteReportRef {
  type: string;
  title: string;
  report_date: string | null;
}

interface Report {
  id: string;
  report_date: string;
  report_type: string;
  snapshot_summary: SnapshotSummary | null;
  market_commentary: string | null;
  comite_reports_included: ComiteReportRef[];
  created_at: string;
}

const COMITE_ICONS: Record<string, typeof Globe> = {
  macro: Globe,
  rv: TrendingUp,
  rf: DollarSign,
  asset_allocation: PieChart,
};

const COMITE_LABELS: Record<string, string> = {
  macro: "Macro",
  rv: "Renta Variable",
  rf: "Renta Fija",
  asset_allocation: "Asset Allocation",
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);

const formatDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function PortalReportes() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  useEffect(() => {
    // Fetch client info
    fetch("/api/portal/me")
      .then(r => r.json())
      .then(data => {
        if (data.client) {
          setClientName(`${data.client.nombre} ${data.client.apellido}`);
          setClientEmail(data.client.email);
        }
      })
      .catch(() => {});

    // Fetch reports
    fetch("/api/portal/reports")
      .then(r => r.json())
      .then(data => {
        if (data.reports) {
          setReports(data.reports);
          if (data.reports.length > 0) setExpanded(data.reports[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PortalTopbar clientName={clientName} clientEmail={clientEmail} />
        <div className="flex items-center justify-center py-32">
          <Loader className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalTopbar clientName={clientName} clientEmail={clientEmail} />

      <div className="max-w-3xl mx-auto px-5 py-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">Reportes</h1>
        <p className="text-sm text-slate-500 mb-6">
          Informes periódicos de tu portafolio y mercado
        </p>

        {reports.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-slate-200">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">Aún no hay reportes disponibles</p>
            <p className="text-sm text-slate-400 mt-1">
              Tu asesor te enviará reportes periódicos de tu cartera
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map(report => {
              const isOpen = expanded === report.id;
              const snap = report.snapshot_summary;
              const valueChange = snap && snap.prev_value
                ? snap.total_value - snap.prev_value
                : null;

              return (
                <div key={report.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  {/* Header */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : report.id)}
                    className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        Reporte de Portafolio
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(report.report_date)}
                      </p>
                    </div>
                    {snap && (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-900">
                          {formatCurrency(snap.total_value)}
                        </p>
                        {valueChange !== null && (
                          <p className={`text-xs font-medium ${valueChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {valueChange >= 0 ? "+" : ""}{formatCurrency(valueChange)}
                          </p>
                        )}
                      </div>
                    )}
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {/* Expanded content */}
                  {isOpen && (
                    <div className="border-t border-slate-200">
                      {/* Portfolio summary */}
                      {snap && (
                        <div className="px-5 py-4 border-b border-slate-100">
                          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">
                            Composición del Portafolio
                          </h3>

                          {/* Composition bar */}
                          <div className="h-6 flex rounded-lg overflow-hidden mb-3">
                            {snap.equity_percent > 0 && (
                              <div className="bg-blue-500 flex items-center justify-center" style={{ width: `${snap.equity_percent}%` }}>
                                {snap.equity_percent > 10 && <span className="text-[10px] font-bold text-white">{Math.round(snap.equity_percent)}%</span>}
                              </div>
                            )}
                            {snap.fixed_income_percent > 0 && (
                              <div className="bg-green-500 flex items-center justify-center" style={{ width: `${snap.fixed_income_percent}%` }}>
                                {snap.fixed_income_percent > 10 && <span className="text-[10px] font-bold text-white">{Math.round(snap.fixed_income_percent)}%</span>}
                              </div>
                            )}
                            {snap.alternatives_percent > 0 && (
                              <div className="bg-purple-500 flex items-center justify-center" style={{ width: `${snap.alternatives_percent}%` }}>
                                {snap.alternatives_percent > 10 && <span className="text-[10px] font-bold text-white">{Math.round(snap.alternatives_percent)}%</span>}
                              </div>
                            )}
                            {snap.cash_percent > 0 && (
                              <div className="bg-gray-400 flex items-center justify-center" style={{ width: `${snap.cash_percent}%` }}>
                                {snap.cash_percent > 10 && <span className="text-[10px] font-bold text-white">{Math.round(snap.cash_percent)}%</span>}
                              </div>
                            )}
                          </div>

                          {/* Legend */}
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: "Renta Variable", pct: snap.equity_percent, val: snap.equity_value, color: "bg-blue-500" },
                              { label: "Renta Fija", pct: snap.fixed_income_percent, val: snap.fixed_income_value, color: "bg-green-500" },
                              { label: "Alternativos", pct: snap.alternatives_percent, val: snap.alternatives_value, color: "bg-purple-500" },
                              { label: "Caja", pct: snap.cash_percent, val: snap.cash_value, color: "bg-gray-400" },
                            ].filter(a => a.pct > 0).map(a => (
                              <div key={a.label} className="flex items-center gap-2 text-xs">
                                <div className={`w-2.5 h-2.5 rounded ${a.color}`} />
                                <span className="text-slate-600">{a.label}</span>
                                <span className="font-semibold text-slate-900 ml-auto">{Math.round(a.pct)}%</span>
                                <span className="text-slate-400">{formatCurrency(a.val)}</span>
                              </div>
                            ))}
                          </div>

                          {/* Holdings */}
                          {snap.holdings && snap.holdings.length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Posiciones</h4>
                              <div className="space-y-1">
                                {(snap.holdings as Holding[]).map((h, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-slate-50">
                                    <span className="text-slate-700 truncate max-w-[250px]">
                                      {h.fundName || h.nombre || "Posición"}
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {formatCurrency(h.marketValue || h.valor || 0)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Market commentary */}
                      {report.market_commentary && (
                        <div className="px-5 py-4 border-b border-slate-100">
                          <h3 className="text-xs font-semibold text-slate-500 uppercase mb-3">
                            Comentario de Mercado
                          </h3>
                          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                            {report.market_commentary}
                          </div>
                        </div>
                      )}

                      {/* Comité reports referenced */}
                      {report.comite_reports_included && report.comite_reports_included.length > 0 && (
                        <div className="px-5 py-3 bg-slate-50">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[10px] font-medium text-slate-400 uppercase">Basado en:</span>
                            {report.comite_reports_included.map((cr, i) => {
                              const Icon = COMITE_ICONS[cr.type] || FileText;
                              return (
                                <span key={i} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                  <Icon className="w-3 h-3" />
                                  {COMITE_LABELS[cr.type] || cr.type}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
