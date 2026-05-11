// components/dashboard/GoogleCalendarConnect.tsx
// Componente para conectar/desconectar Google Calendar

"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Check, X, Loader, ExternalLink, Unlink, AlertCircle } from "lucide-react";

interface GoogleCalendarStatus {
  configured: boolean;
  connected: boolean;
  syncEnabled?: boolean;
  connectedAt?: string;
}

export default function GoogleCalendarConnect() {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();

    const params = new URLSearchParams(window.location.search);
    if (params.get("google_success") === "true") {
      window.history.replaceState({}, "", window.location.pathname);
      fetchStatus();
    }
    if (params.get("google_error")) {
      setErrorMsg(params.get("google_error"));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/google/status");
      const data = await res.json();
      if (data.success) {
        setStatus({
          configured: data.configured,
          connected: data.connected,
          syncEnabled: data.syncEnabled,
          connectedAt: data.connectedAt,
        });
      }
    } catch {
      // Silencioso — componente simplemente no se muestra
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/google/connect");
      const data = await res.json();
      if (data.success && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setErrorMsg(data.error || "Error conectando con Google Calendar");
        setConnecting(false);
      }
    } catch {
      setErrorMsg("Error conectando con Google Calendar");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("¿Desconectar Google Calendar? Las reuniones ya sincronizadas se mantendrán.")) {
      return;
    }

    setDisconnecting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStatus((prev) => prev ? { ...prev, connected: false } : null);
      } else {
        setErrorMsg(data.error || "Error desconectando");
      }
    } catch {
      setErrorMsg("Error desconectando Google Calendar");
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-gb-gray">
        <Loader className="w-4 h-4 animate-spin" />
        <span>Verificando Google Calendar...</span>
      </div>
    );
  }

  if (!status?.configured) {
    return null;
  }

  return (
    <>
      {errorMsg && (
        <div className="flex items-center gap-2 px-4 py-3 mb-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="shrink-0 hover:text-red-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {status.connected ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gb-primary-light/50 border border-gb-primary/20 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gb-primary-light rounded-full flex items-center justify-center">
              <Calendar className="w-4 h-4 text-gb-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gb-black">Google Calendar conectado</span>
                <Check className="w-4 h-4 text-gb-primary" />
              </div>
              <p className="text-xs text-gb-primary">
                Las reuniones se sincronizan automáticamente
              </p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
            title="Desconectar Google Calendar"
          >
            {disconnecting ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Unlink className="w-3.5 h-3.5" />
            )}
            Desconectar
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <span className="text-sm font-medium text-blue-800">Conecta tu Google Calendar</span>
              <p className="text-xs text-blue-600">
                Sincroniza tus reuniones automáticamente
              </p>
            </div>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {connecting ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4" />
                Conectar
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}
