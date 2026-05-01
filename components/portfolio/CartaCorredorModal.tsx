"use client";

import React, { useState } from "react";
import { X, Copy, RefreshCw, Check, Loader, Mail } from "lucide-react";

interface Operacion {
  tipo: "comprar" | "vender";
  fondo: string;
  monto: number;
  moneda: string;
}

interface Props {
  clientId: string;
  operaciones: Operacion[];
  onClose: () => void;
}

export default function CartaCorredorModal({ clientId, operaciones, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [copied, setCopied] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generar = async () => {
    setLoading(true);
    setCopied(false);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/generar-carta-corredor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, operaciones }),
      });
      const data = await res.json();
      if (data.success && data.carta) {
        setAsunto(data.carta.asunto || "");
        setCuerpo(data.carta.cuerpo || "");
        setGenerated(true);
      } else {
        setError(data.error || "Error al generar la carta");
      }
    } catch (err) {
      console.error("Error generating carta:", err);
      setError("Error de conexion al generar la carta");
    } finally {
      setLoading(false);
    }
  };

  const copiar = () => {
    const fullText = `Asunto: ${asunto}\n\n${cuerpo}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gb-border">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-gb-gray" />
            <h2 className="text-base font-semibold text-gb-black">Mail al Corredor</h2>
          </div>
          <button onClick={onClose} className="text-gb-gray hover:text-gb-black">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!generated ? (
            <div className="text-center py-8">
              <Mail className="w-12 h-12 text-gb-border mx-auto mb-3" />
              <p className="text-sm text-gb-gray mb-4">
                Genera un email pre-redactado para que tu cliente envie a su corredor con las instrucciones de operacion.
              </p>
              <p className="text-xs text-gb-gray mb-2">
                {operaciones.length} operacion{operaciones.length !== 1 ? "es" : ""} a incluir:
              </p>
              <div className="text-xs text-gb-gray mb-4 max-h-32 overflow-y-auto">
                {operaciones.map((op, i) => (
                  <p key={i} className={`${op.tipo === "vender" ? "text-red-600" : "text-green-600"}`}>
                    {op.tipo.toUpperCase()}: {op.fondo} ({op.moneda} {op.monto.toLocaleString("es-CL")})
                  </p>
                ))}
              </div>
              <button
                onClick={generar}
                disabled={loading}
                className="px-4 py-2 bg-gb-black text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2 mx-auto"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Generar email
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-gb-gray mb-1 block">Asunto</label>
                <input
                  type="text"
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gb-gray mb-1 block">Cuerpo del email</label>
                <textarea
                  value={cuerpo}
                  onChange={(e) => setCuerpo(e.target.value)}
                  rows={12}
                  className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copiar}
                  className="flex-1 px-4 py-2 bg-gb-black text-white rounded-lg text-sm hover:bg-gray-800 flex items-center justify-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copiado!" : "Copiar al clipboard"}
                </button>
                <button
                  onClick={generar}
                  disabled={loading}
                  className="px-4 py-2 border border-gb-border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Regenerar
                </button>
              </div>
              <p className="text-xs text-gb-gray text-center">
                El cliente debe enviar este email desde su propio correo.
                La plataforma no envia emails al corredor.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
