"use client";

import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import PortalTopbar from "@/components/portal/PortalTopbar";
import { Lock, Loader, AlertCircle, CheckCircle } from "lucide-react";

export default function CambiarPasswordPage() {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch("/api/portal/me");
        if (res.ok) {
          const data = await res.json();
          setClientName(`${data.client.nombre} ${data.client.apellido}`);
          setClientEmail(data.client.email);
        }
      } catch {}
      setPageLoading(false);
    };
    fetchMe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();

      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: clientEmail,
        password: currentPassword,
      });
      if (signInError) {
        setError("La contraseña actual es incorrecta");
        setLoading(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setError("Error al cambiar la contraseña");
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-6 h-6 text-gb-gray animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gb-light">
      <PortalTopbar clientName={clientName} clientEmail={clientEmail} />

      <main className="max-w-md mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-gb-black mb-6">Cambiar Contraseña</h1>

        <div className="bg-white rounded-lg border border-gb-border p-6">
          {success && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm mb-5">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Contraseña actualizada exitosamente
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">
                Contraseña actual
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">
                Nueva contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">
                Confirmar nueva contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:ring-2 focus:ring-gb-accent focus:border-transparent"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              className="w-full py-2.5 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gb-dark disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader className="w-4 h-4 animate-spin" /> Cambiando...</>
              ) : (
                <><Lock className="w-4 h-4" /> Cambiar Contraseña</>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
