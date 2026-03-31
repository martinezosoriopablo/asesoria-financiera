"use client";

import { useEffect, useState } from "react";
import PortalTopbar from "@/components/portal/PortalTopbar";
import Link from "next/link";
import {
  Loader,
  FileUp,
  CheckCircle,
  Clock,
  XCircle,
  Upload,
} from "lucide-react";

interface Cartola {
  id: string;
  titulo: string;
  descripcion: string;
  resultado: string;
  fecha: string;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pendiente: { label: "Pendiente de revisión", icon: Clock, color: "text-amber-600 bg-amber-50" },
  exitoso: { label: "Procesada", icon: CheckCircle, color: "text-green-600 bg-green-50" },
  fallido: { label: "Error en procesamiento", icon: XCircle, color: "text-red-600 bg-red-50" },
};

export default function MisCartolasPage() {
  const [cartolas, setCartolas] = useState<Cartola[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then(r => r.json()),
      fetch("/api/portal/cartolas").then(r => r.json()),
    ])
      .then(([meData, cartolaData]) => {
        if (meData.client) {
          setClientName(`${meData.client.nombre} ${meData.client.apellido}`);
          setClientEmail(meData.client.email);
        }
        if (cartolaData.cartolas) setCartolas(cartolaData.cartolas);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-6 h-6 text-gb-gray animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gb-light">
      <PortalTopbar clientName={clientName} clientEmail={clientEmail} />

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gb-black">Mis Cartolas</h1>
            <p className="text-sm text-gb-gray mt-1">
              Historial de cartolas subidas y su estado de procesamiento
            </p>
          </div>
          <Link
            href="/portal/subir-cartola"
            className="flex items-center gap-2 px-4 py-2 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gb-dark transition-colors"
          >
            <Upload className="w-4 h-4" />
            Subir nueva
          </Link>
        </div>

        {cartolas.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gb-border">
            <FileUp className="w-12 h-12 text-gb-border mx-auto mb-4" />
            <p className="text-gb-gray font-medium">No has subido cartolas aún</p>
            <p className="text-sm text-gb-gray mt-1 mb-4">
              Sube tu estado de cuenta para que tu asesor pueda analizarlo
            </p>
            <Link
              href="/portal/subir-cartola"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gb-dark"
            >
              <Upload className="w-4 h-4" />
              Subir cartola
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {cartolas.map((c) => {
              const status = STATUS_MAP[c.resultado] || STATUS_MAP.pendiente;
              const StatusIcon = status.icon;
              // Extract admin name from description
              const adminMatch = c.descripcion?.match(/Administradora:\s*(.+)/);
              const admin = adminMatch?.[1] || null;

              return (
                <div
                  key={c.id}
                  className="bg-white rounded-lg border border-gb-border p-4 flex items-start gap-4"
                >
                  <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center shrink-0">
                    <FileUp className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gb-black">{c.titulo}</p>
                    {admin && (
                      <p className="text-xs text-gb-gray mt-0.5">{admin}</p>
                    )}
                    <p className="text-xs text-gb-gray mt-1">
                      {new Date(c.fecha).toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${status.color}`}
                  >
                    <StatusIcon className="w-3.5 h-3.5" />
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
