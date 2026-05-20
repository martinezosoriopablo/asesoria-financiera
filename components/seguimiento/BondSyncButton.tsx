"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  onSyncComplete?: () => void;
}

export default function BondSyncButton({ onSyncComplete }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);

    try {
      const res = await fetch("/api/bonds/sync-finra", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setResult({
          ok: data.errors === 0,
          msg: `${data.updated}/${data.total} bonos actualizados${data.errors > 0 ? ` (${data.errors} errores)` : ""}`,
        });
        onSyncComplete?.();
      } else {
        setResult({ ok: false, msg: data.error });
      }
    } catch {
      setResult({ ok: false, msg: "Error de conexion — verificar que corre desde localhost" });
    }

    setSyncing(false);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Actualizando..." : "Sync FINRA"}
      </button>

      {result && (
        <span className={`text-xs ${result.ok ? "text-green-600" : "text-red-600"}`}>
          {result.msg}
        </span>
      )}
    </div>
  );
}
