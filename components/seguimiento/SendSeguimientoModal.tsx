"use client";

import React, { useState, useMemo } from "react";
import { X, Mail, Loader, CheckCircle } from "lucide-react";
import { buildSeguimientoHTML, type SeguimientoEmailData } from "@/lib/seguimiento-email";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientEmail: string;
  seguimientoData: SeguimientoEmailData;
}

export default function SendSeguimientoModal({ isOpen, onClose, clientId, clientEmail, seguimientoData }: Props) {
  const [email, setEmail] = useState(clientEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewHtml = useMemo(() => buildSeguimientoHTML(seguimientoData), [seguimientoData]);

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/seguimiento/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          recipientEmail: email.trim(),
          html: previewHtml,
          subject: `Reporte de Seguimiento — ${seguimientoData.clientName} — ${seguimientoData.reportDate}`,
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
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 16 }}>
        <div className="bg-white rounded-xl shadow-2xl" style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gb-black">Enviar Reporte de Seguimiento</h2>
              <p className="text-xs text-gb-gray mt-0.5">Vista previa del reporte que recibira el cliente</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-md transition-colors">
              <X className="w-5 h-5 text-gb-gray" />
            </button>
          </div>

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

          {error && (
            <div className="px-6 py-2">
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
            </div>
          )}

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
                    <><Loader className="w-4 h-4 animate-spin" />Enviando...</>
                  ) : (
                    <><Mail className="w-4 h-4" />Enviar Reporte</>
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
