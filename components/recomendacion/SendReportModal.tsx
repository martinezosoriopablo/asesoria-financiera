"use client";

import React, { useState, useMemo } from "react";
import { X, Mail, Loader, CheckCircle } from "lucide-react";
import { buildRadiografiaHTML, type RadiografiaEmailData } from "@/lib/radiografia-email";

interface RadiografiaData {
  clientId: string;
  clientName: string;
  reportDate: string;
  perfilCliente: string;
  perfilModelo: string;
  totalValueCLP: number;
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  instrumentBreakdown: {
    stocks: Array<{ ticker: string; name: string; weightPct: number; marketValueCLP: number }>;
    funds: Array<{ fundName: string; weightPct: number; marketValueCLP: number }>;
    bonds: Array<{ name: string; couponRate: number; maturityDate: string; weightPct: number; marketValueUSD: number }>;
    etfs: Array<{ ticker: string; name: string; weightPct: number; marketValueCLP: number }>;
    cash: Array<{ name: string; weightPct: number; marketValueCLP: number }>;
  };
  observations: Array<{ severity: "alta" | "media" | "info"; text: string }>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: RadiografiaData;
  clientEmail: string;
  narrative: string | null;
}

export default function SendReportModal({ isOpen, onClose, data, clientEmail, narrative }: Props) {
  const [email, setEmail] = useState(clientEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailData: RadiografiaEmailData = useMemo(() => ({
    clientName: data.clientName,
    reportDate: data.reportDate,
    perfilCliente: data.perfilCliente,
    perfilModelo: data.perfilModelo,
    totalValueCLP: data.totalValueCLP,
    allocation: data.allocation,
    instrumentBreakdown: data.instrumentBreakdown,
    observations: data.observations,
    narrative,
    platformUrl: typeof window !== "undefined" ? `${window.location.origin}/recomendacion/${data.clientId}` : "",
  }), [data, narrative]);

  const previewHtml = useMemo(() => buildRadiografiaHTML(emailData), [emailData]);

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/radiografia/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: data.clientId,
          recipientEmail: email.trim(),
          radiografiaData: emailData,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setSent(true);
        setTimeout(() => onClose(), 2000);
      } else {
        setError(result.error || "Error al enviar");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      {/* Overlay */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 16 }}>
        <div className="bg-white rounded-xl shadow-2xl" style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gb-black">Enviar Radiografia por Email</h2>
              <p className="text-xs text-gb-gray mt-0.5">Vista previa del reporte que recibira el cliente</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-md transition-colors">
              <X className="w-5 h-5 text-gb-gray" />
            </button>
          </div>

          {/* Email input */}
          <div className="px-6 py-3 border-b border-gb-border">
            <label className="text-xs font-medium text-gb-gray block mb-1">Destinatario</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@cliente.com"
              className="w-full px-3 py-2 text-sm border border-gb-border rounded-md focus:outline-none focus:ring-2 focus:ring-gb-primary/20 focus:border-gb-primary"
              disabled={sending || sent}
            />
          </div>

          {/* Preview iframe */}
          <div className="flex-1 overflow-hidden px-6 py-3" style={{ minHeight: 300, maxHeight: 500 }}>
            <div className="border border-gb-border rounded-lg overflow-hidden h-full">
              <iframe
                srcDoc={previewHtml}
                title="Vista previa del reporte"
                style={{ width: "100%", height: "100%", border: "none", minHeight: 280 }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-6 py-2">
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gb-border flex items-center justify-end gap-3">
            {sent ? (
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Enviado correctamente
              </div>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={sending}
                  className="px-4 py-2 text-sm font-medium border border-gb-border rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !email.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gb-primary rounded-lg hover:bg-gb-primary/90 disabled:opacity-50 transition-colors"
                >
                  {sending ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Enviar Reporte
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
