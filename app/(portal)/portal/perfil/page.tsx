"use client";

import { useState, useEffect } from "react";
import { User, Loader, AlertCircle, CheckCircle, Mail, Phone, Hash, Calendar } from "lucide-react";

interface Profile {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  rut: string | null;
  fecha_nacimiento: string | null;
  display_currency: string | null;
}

export default function PortalPerfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Editable fields
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [displayCurrency, setDisplayCurrency] = useState("CLP");

  useEffect(() => {
    fetch("/api/portal/perfil")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.profile) {
          const p = data.profile;
          setProfile(p);
          setNombre(p.nombre || "");
          setApellido(p.apellido || "");
          setTelefono(p.telefono || "");
          setDisplayCurrency(p.display_currency || "CLP");
        }
      })
      .catch(() => setError("Error al cargar perfil"))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!nombre.trim() || !apellido.trim()) {
      setError("Nombre y apellido son requeridos");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/portal/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          telefono: telefono.trim(),
          display_currency: displayCurrency,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setProfile((prev) =>
          prev
            ? { ...prev, nombre: nombre.trim(), apellido: apellido.trim(), telefono: telefono.trim(), display_currency: displayCurrency }
            : prev
        );
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || "Error al guardar");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="w-6 h-6 animate-spin text-gb-gray" />
      </div>
    );
  }

  return (
    <div>
      <main className="max-w-lg mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-gb-black mb-6">Mi Perfil</h1>

        <div className="bg-white rounded-lg border border-gb-border p-6">
          {success && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm mb-5">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Perfil actualizado exitosamente
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Nombre */}
            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Nombre</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Apellido */}
            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Apellido</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="text"
                  required
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="email"
                  value={profile?.email || ""}
                  disabled
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm bg-slate-50 text-gb-gray cursor-not-allowed"
                />
              </div>
              <p className="mt-1 text-xs text-gb-gray">El email no se puede cambiar</p>
            </div>

            {/* Teléfono */}
            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Teléfono</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+56 9 1234 5678"
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                  disabled={saving}
                />
              </div>
            </div>

            {/* RUT (read-only) */}
            {profile?.rut && (
              <div>
                <label className="block text-xs font-medium text-gb-dark mb-1.5">RUT</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                  <input
                    type="text"
                    value={profile.rut}
                    disabled
                    className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm bg-slate-50 text-gb-gray cursor-not-allowed"
                  />
                </div>
              </div>
            )}

            {/* Fecha nacimiento (read-only) */}
            {profile?.fecha_nacimiento && (
              <div>
                <label className="block text-xs font-medium text-gb-dark mb-1.5">Fecha de Nacimiento</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                  <input
                    type="text"
                    value={new Date(profile.fecha_nacimiento).toLocaleDateString("es-CL")}
                    disabled
                    className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm bg-slate-50 text-gb-gray cursor-not-allowed"
                  />
                </div>
              </div>
            )}

            {/* Moneda de visualización */}
            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Moneda de Visualización</label>
              <select
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value)}
                className="w-full px-3 py-2.5 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                disabled={saving}
              >
                <option value="CLP">CLP — Peso Chileno</option>
                <option value="USD">USD — Dólar</option>
                <option value="UF">UF — Unidad de Fomento</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={saving || !nombre.trim() || !apellido.trim()}
              className="w-full py-2.5 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gb-dark disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader className="w-4 h-4 animate-spin" /> Guardando...</>
              ) : (
                "Guardar Cambios"
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
