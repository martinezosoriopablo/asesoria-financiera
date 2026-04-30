"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { User, Mail, Phone, Briefcase, Camera, ArrowLeft, Save, Loader, Linkedin, Lock } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface AdvisorProfile {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  especialidad: string;
  bio?: string;
  linkedin_url?: string;
  preferred_ai_model?: string;
}

export default function AdvisorProfilePage() {
  const router = useRouter();
  const { advisor, loading: authLoading } = useAdvisor();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<AdvisorProfile | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    if (advisor) fetchProfile();
  }, [advisor]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  const advisorEmail = advisor.email;
  const photoUrl = advisor.photo;

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/advisor/profile");
      const data = await res.json();
      if (data.success) {
        setProfile(data.advisor);
      } else {
        setError("No se pudo cargar el perfil");
      }
    } catch {
      setError("Error al cargar el perfil");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch("/api/advisor/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: profile.nombre,
          apellido: profile.apellido,
          telefono: profile.telefono,
          especialidad: profile.especialidad,
          bio: profile.bio,
          linkedin_url: profile.linkedin_url,
          preferred_ai_model: profile.preferred_ai_model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || "Error al guardar");
      }
    } catch {
      setError("Error al guardar el perfil");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmNewPassword) {
      setPasswordError("Las contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = createSupabaseBrowserClient();
      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || "",
        password: currentPassword,
      });
      if (signInError) {
        setPasswordError("La contraseña actual es incorrecta");
        setSavingPassword(false);
        return;
      }
      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setPasswordError(updateError.message);
      } else {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        setTimeout(() => setPasswordSuccess(false), 3000);
      }
    } catch {
      setPasswordError("Error al cambiar la contraseña");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light">
        <AdvisorHeader
          advisorName="Cargando..."
          advisorEmail={advisorEmail}
          advisorPhoto={photoUrl}
          advisorLogo={advisor?.logo}
          companyName={advisor?.companyName}
          isAdmin={advisor?.isAdmin}
        />
        <div className="flex items-center justify-center h-64">
          <Loader className="w-8 h-8 text-gb-gray animate-spin" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gb-light">
        <AdvisorHeader
          advisorName="Error"
          advisorEmail={advisorEmail}
          advisorPhoto={photoUrl}
          advisorLogo={advisor?.logo}
          companyName={advisor?.companyName}
          isAdmin={advisor?.isAdmin}
        />
        <div className="max-w-4xl mx-auto px-5 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg text-sm">
            {error || "No se pudo cargar el perfil"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gb-light">
      <AdvisorHeader
        advisorName={`${profile.nombre} ${profile.apellido}`}
        advisorEmail={profile.email}
        advisorPhoto={photoUrl}
        advisorLogo={advisor?.logo}
        companyName={advisor?.companyName}
        isAdmin={advisor?.isAdmin}
      />

      <div className="max-w-4xl mx-auto px-5 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.push("/advisor")}
            className="flex items-center gap-2 text-gb-gray hover:text-gb-black transition-colors mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Dashboard
          </button>
          <h1 className="text-2xl font-semibold text-gb-black">Mi Perfil</h1>
          <p className="text-sm text-gb-gray mt-1">Administra tu información personal</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
            Perfil actualizado exitosamente
          </div>
        )}

        <div className="bg-white border border-gb-border rounded-lg overflow-hidden">
          {/* Photo Section */}
          <div className="bg-gb-black px-8 py-10">
            <div className="flex items-center gap-6">
              <div className="relative">
                <img
                  src={photoUrl}
                  alt={`${profile.nombre} ${profile.apellido}`}
                  className="w-20 h-20 rounded-full border-3 border-white object-cover"
                />
                <button className="absolute bottom-0 right-0 w-7 h-7 bg-white rounded-full flex items-center justify-center border border-gb-border hover:bg-gb-light transition-colors">
                  <Camera className="w-3.5 h-3.5 text-gb-gray" />
                </button>
              </div>
              <div className="text-white">
                <h2 className="text-xl font-semibold">{profile.nombre} {profile.apellido}</h2>
                <p className="text-white/60 text-sm mt-1">{profile.especialidad || "Asesor Financiero"}</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-gb-dark mb-1.5">Nombre *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                  <input
                    type="text"
                    required
                    value={profile.nombre}
                    onChange={(e) => setProfile({ ...profile, nombre: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
                    disabled={saving}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gb-dark mb-1.5">Apellido *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                  <input
                    type="text"
                    required
                    value={profile.apellido}
                    onChange={(e) => setProfile({ ...profile, apellido: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="email"
                  value={profile.email}
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm bg-gb-light text-gb-gray"
                  disabled
                />
              </div>
              <p className="text-xs text-gb-gray mt-1">El email no se puede modificar</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Teléfono</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="tel"
                  value={profile.telefono || ""}
                  onChange={(e) => setProfile({ ...profile, telefono: e.target.value })}
                  placeholder="+56 9 1234 5678"
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
                  disabled={saving}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Especialidad</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="text"
                  value={profile.especialidad || ""}
                  onChange={(e) => setProfile({ ...profile, especialidad: e.target.value })}
                  placeholder="Ej: Wealth Management, Planificación Financiera"
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
                  disabled={saving}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">LinkedIn</label>
              <div className="relative">
                <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="url"
                  value={profile.linkedin_url || ""}
                  onChange={(e) => setProfile({ ...profile, linkedin_url: e.target.value })}
                  placeholder="https://www.linkedin.com/in/tu-perfil"
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
                  disabled={saving}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Biografía</label>
              <textarea
                rows={4}
                value={profile.bio || ""}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="Cuéntanos sobre ti, tu experiencia y enfoque..."
                className="w-full px-3 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-5 border-t border-gb-border">
              <button
                type="button"
                onClick={() => router.push("/advisor")}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-medium text-gb-dark hover:bg-gb-light rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gb-dark transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Guardando...</>
                ) : (
                  <><Save className="w-4 h-4" /> Guardar Cambios</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* AI Model Preference */}
        <div className="bg-white rounded-lg border border-gb-border p-6 mt-6">
          <h2 className="text-base font-semibold text-gb-black mb-4">Modelo de IA</h2>
          <p className="text-sm text-gb-gray mb-4">
            Elige el modelo de IA para generar recomendaciones de cartera y radiografias.
          </p>
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50"
              style={{ borderColor: profile.preferred_ai_model === 'claude-sonnet-4-20250514' || !profile.preferred_ai_model ? '#1a1a1a' : '#e5e5e5' }}>
              <input
                type="radio"
                name="preferred_ai_model"
                value="claude-sonnet-4-20250514"
                checked={profile.preferred_ai_model === 'claude-sonnet-4-20250514' || !profile.preferred_ai_model}
                onChange={(e) => setProfile({ ...profile, preferred_ai_model: e.target.value })}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold text-gb-black">Sonnet 4 (Recomendado)</p>
                <p className="text-xs text-gb-gray">Rapido y eficiente. ~$0.10 por recomendacion. Ideal para la mayoria de los casos.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50"
              style={{ borderColor: profile.preferred_ai_model === 'claude-opus-4-20250514' ? '#1a1a1a' : '#e5e5e5' }}>
              <input
                type="radio"
                name="preferred_ai_model"
                value="claude-opus-4-20250514"
                checked={profile.preferred_ai_model === 'claude-opus-4-20250514'}
                onChange={(e) => setProfile({ ...profile, preferred_ai_model: e.target.value })}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold text-gb-black">Opus 4 (Premium)</p>
                <p className="text-xs text-gb-gray">Mejor razonamiento para decisiones complejas. ~$0.53 por recomendacion.</p>
              </div>
            </label>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white border border-gb-border rounded-lg overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-gb-border">
            <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Cambiar Contraseña
            </h2>
          </div>
          <form onSubmit={handleChangePassword} className="p-6 space-y-5">
            {passwordError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
                Contraseña actualizada exitosamente
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gb-dark mb-1.5">Contraseña actual</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
                  disabled={savingPassword}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-gb-dark mb-1.5">Nueva contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
                    disabled={savingPassword}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gb-dark mb-1.5">Confirmar nueva contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                  <input
                    type="password"
                    required
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
                    disabled={savingPassword}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                disabled={savingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                className="px-5 py-2.5 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gb-dark transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {savingPassword ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Cambiando...</>
                ) : (
                  <><Lock className="w-4 h-4" /> Cambiar Contraseña</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
