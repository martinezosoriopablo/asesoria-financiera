"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { User, Mail, Phone, Briefcase, Camera, ArrowLeft, Save, Loader } from "lucide-react";

interface AdvisorProfile {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  especialidad: string;
  bio?: string;
}

export default function AdvisorProfilePage() {
  const router = useRouter();
  const { advisor, loading: authLoading } = useAdvisor();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<AdvisorProfile | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const logoUrl = "https://zysotxkelepvotzujhxe.supabase.co/storage/v1/object/public/assets/logo.png";

  useEffect(() => {
    if (advisor) fetchProfile();
  }, [advisor]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  const advisorEmail = advisor.email;
  const photoUrl = advisor.photo;

  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/advisor/profile?email=${advisorEmail}`);
      const data = await res.json();
      
      if (data.success) {
        setProfile(data.advisor);
      } else {
        setError("No se pudo cargar el perfil");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
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
          email: advisorEmail,
          nombre: profile.nombre,
          apellido: profile.apellido,
          telefono: profile.telefono,
          especialidad: profile.especialidad,
          bio: profile.bio,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || "Error al guardar");
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      setError("Error al guardar el perfil");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <AdvisorHeader
          advisorName="Cargando..."
          advisorEmail={advisorEmail}
          advisorPhoto={photoUrl}
          logoUrl={logoUrl}
        />
        <div className="flex items-center justify-center h-screen">
          <Loader className="w-12 h-12 text-blue-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <AdvisorHeader
          advisorName="Error"
          advisorEmail={advisorEmail}
          advisorPhoto={photoUrl}
          logoUrl={logoUrl}
        />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
            {error || "No se pudo cargar el perfil"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <AdvisorHeader
        advisorName={`${profile.nombre} ${profile.apellido}`}
        advisorEmail={profile.email}
        advisorPhoto={photoUrl}
        logoUrl={logoUrl}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/advisor")}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Dashboard
          </button>
          <h1 className="text-3xl font-bold text-slate-900">Mi Perfil</h1>
          <p className="text-slate-600 mt-1">Administra tu información personal</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            ✅ Perfil actualizado exitosamente
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {/* Photo Section */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-8 py-12 relative">
            <div className="flex items-center gap-6">
              <div className="relative">
                <img
                  src={photoUrl}
                  alt={`${profile.nombre} ${profile.apellido}`}
                  className="w-24 h-24 rounded-full border-4 border-white shadow-lg object-cover"
                />
                <button className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-50 transition-colors">
                  <Camera className="w-4 h-4 text-slate-600" />
                </button>
              </div>
              <div className="text-white">
                <h2 className="text-2xl font-bold">{profile.nombre} {profile.apellido}</h2>
                <p className="text-blue-100 mt-1">{profile.especialidad || "Asesor Financiero"}</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {/* Nombre */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombre *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={profile.nombre}
                    onChange={(e) => setProfile({ ...profile, nombre: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={saving}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Apellido *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={profile.apellido}
                    onChange={(e) => setProfile({ ...profile, apellido: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={profile.email}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
                  disabled
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">El email no se puede modificar</p>
            </div>

            {/* Teléfono */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Teléfono
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="tel"
                  value={profile.telefono || ""}
                  onChange={(e) => setProfile({ ...profile, telefono: e.target.value })}
                  placeholder="+56 9 1234 5678"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Especialidad */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Especialidad
              </label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={profile.especialidad || ""}
                  onChange={(e) => setProfile({ ...profile, especialidad: e.target.value })}
                  placeholder="Ej: Wealth Management, Planificación Financiera"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Biografía
              </label>
              <textarea
                rows={4}
                value={profile.bio || ""}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="Cuéntanos sobre ti, tu experiencia y enfoque..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={saving}
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200">
              <button
                type="button"
                onClick={() => router.push("/advisor")}
                disabled={saving}
                className="px-6 py-2 text-slate-700 font-semibold hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
