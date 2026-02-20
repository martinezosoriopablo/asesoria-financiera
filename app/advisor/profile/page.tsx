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

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light">
        <AdvisorHeader
          advisorName="Cargando..."
          advisorEmail={advisorEmail}
          advisorPhoto={photoUrl}
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
      </div>
    </div>
  );
}
