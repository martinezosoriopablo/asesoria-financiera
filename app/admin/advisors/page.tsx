// app/admin/advisors/page.tsx
// Página de gestión de asesores (solo para admins)

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import {
  Users,
  Plus,
  Edit2,
  UserX,
  UserCheck,
  Mail,
  Building2,
  Loader,
  X,
  Save,
} from "lucide-react";

interface AdvisorData {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  foto_url?: string | null;
  logo_url?: string | null;
  company_name?: string | null;
  rol: "admin" | "advisor";
  parent_advisor_id?: string | null;
  activo: boolean;
  created_at?: string;
}

export default function AdminAdvisorsPage() {
  const router = useRouter();
  const { advisor, loading: authLoading } = useAdvisor();
  const [advisors, setAdvisors] = useState<AdvisorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingAdvisor, setEditingAdvisor] = useState<AdvisorData | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    nombre: "",
    apellido: "",
    foto_url: "",
    logo_url: "",
    company_name: "",
    rol: "advisor" as "admin" | "advisor",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && advisor) {
      if (!advisor.isAdmin) {
        router.push("/advisor");
        return;
      }
      loadAdvisors();
    }
  }, [authLoading, advisor, router]);

  const loadAdvisors = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/advisors");
      const data = await response.json();
      if (data.success) {
        setAdvisors(data.advisors);
      } else {
        setError(data.error || "Error al cargar asesores");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingAdvisor(null);
    setFormData({
      email: "",
      nombre: "",
      apellido: "",
      foto_url: "",
      logo_url: advisor?.logo || "",
      company_name: advisor?.companyName || "",
      rol: "advisor",
    });
    setShowModal(true);
  };

  const openEditModal = (adv: AdvisorData) => {
    setEditingAdvisor(adv);
    setFormData({
      email: adv.email,
      nombre: adv.nombre,
      apellido: adv.apellido,
      foto_url: adv.foto_url || "",
      logo_url: adv.logo_url || "",
      company_name: adv.company_name || "",
      rol: adv.rol,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = "/api/admin/advisors";
      const method = editingAdvisor ? "PUT" : "POST";
      const body = editingAdvisor
        ? { id: editingAdvisor.id, ...formData }
        : formData;

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.success) {
        setShowModal(false);
        loadAdvisors();
      } else {
        alert(data.error || "Error al guardar");
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (adv: AdvisorData) => {
    if (adv.id === advisor?.id) {
      alert("No puede desactivar su propia cuenta");
      return;
    }

    const action = adv.activo ? "desactivar" : "activar";
    if (!confirm(`¿Seguro que desea ${action} a ${adv.nombre} ${adv.apellido}?`)) {
      return;
    }

    try {
      if (adv.activo) {
        // Desactivar
        const response = await fetch(`/api/admin/advisors?id=${adv.id}`, {
          method: "DELETE",
        });
        const data = await response.json();
        if (!data.success) {
          alert(data.error || "Error al desactivar");
          return;
        }
      } else {
        // Reactivar
        const response = await fetch("/api/admin/advisors", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: adv.id, activo: true }),
        });
        const data = await response.json();
        if (!data.success) {
          alert(data.error || "Error al activar");
          return;
        }
      }
      loadAdvisors();
    } catch {
      alert("Error de conexión");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gb-light flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  if (!advisor?.isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gb-light">
      <AdvisorHeader
        advisorName={advisor.name}
        advisorEmail={advisor.email}
        advisorPhoto={advisor.photo}
        advisorLogo={advisor.logo}
        companyName={advisor.companyName}
        isAdmin={advisor.isAdmin}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gb-black flex items-center gap-3">
              <Users className="w-7 h-7" />
              Gestión de Asesores
            </h1>
            <p className="text-gb-gray mt-1">
              Administra los asesores de tu equipo
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-gb-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo Asesor
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 text-gb-gray animate-spin" />
          </div>
        )}

        {/* Advisors Grid */}
        {!loading && advisors.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {advisors.map((adv) => (
              <div
                key={adv.id}
                className={`bg-white rounded-xl border ${
                  adv.activo ? "border-gb-border" : "border-red-200 bg-red-50/30"
                } p-6 relative`}
              >
                {/* Badge de rol */}
                <div className="absolute top-4 right-4">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      adv.rol === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {adv.rol === "admin" ? "Admin" : "Asesor"}
                  </span>
                </div>

                {/* Avatar y nombre */}
                <div className="flex items-center gap-4 mb-4">
                  {adv.foto_url ? (
                    <img
                      src={adv.foto_url}
                      alt={`${adv.nombre} ${adv.apellido}`}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gb-black text-white flex items-center justify-center text-lg font-semibold">
                      {adv.nombre[0]}
                      {adv.apellido[0]}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-gb-black">
                      {adv.nombre} {adv.apellido}
                    </h3>
                    <p className="text-sm text-gb-gray flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" />
                      {adv.email}
                    </p>
                  </div>
                </div>

                {/* Info adicional */}
                {adv.company_name && (
                  <p className="text-sm text-gb-gray flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4" />
                    {adv.company_name}
                  </p>
                )}

                {/* Estado */}
                {!adv.activo && (
                  <div className="bg-red-100 text-red-700 text-sm px-3 py-1.5 rounded-lg mb-4">
                    Cuenta desactivada
                  </div>
                )}

                {/* Acciones */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-gb-border">
                  <button
                    onClick={() => openEditModal(adv)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gb-gray hover:text-gb-black hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Editar
                  </button>
                  {adv.id !== advisor.id && (
                    <button
                      onClick={() => handleToggleActive(adv)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        adv.activo
                          ? "text-red-600 hover:bg-red-50"
                          : "text-green-600 hover:bg-green-50"
                      }`}
                    >
                      {adv.activo ? (
                        <>
                          <UserX className="w-4 h-4" />
                          Desactivar
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-4 h-4" />
                          Activar
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && advisors.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gb-gray/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gb-black mb-2">
              No hay asesores
            </h3>
            <p className="text-gb-gray mb-6">
              Comienza agregando asesores a tu equipo
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gb-black text-white rounded-lg hover:bg-gray-800"
            >
              <Plus className="w-4 h-4" />
              Agregar Asesor
            </button>
          </div>
        )}
      </div>

      {/* Modal de crear/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gb-border">
              <h2 className="text-lg font-semibold text-gb-black">
                {editingAdvisor ? "Editar Asesor" : "Nuevo Asesor"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gb-black mb-1.5">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gb-border rounded-lg focus:outline-none focus:border-gb-accent"
                  placeholder="email@ejemplo.com"
                  disabled={editingAdvisor?.id === advisor?.id} // No puede cambiar su propio email
                />
                {!editingAdvisor && (
                  <p className="text-xs text-gb-gray mt-1">
                    El asesor recibirá instrucciones para crear su contraseña
                  </p>
                )}
              </div>

              {/* Nombre y Apellido */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gb-black mb-1.5">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gb-border rounded-lg focus:outline-none focus:border-gb-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gb-black mb-1.5">
                    Apellido *
                  </label>
                  <input
                    type="text"
                    value={formData.apellido}
                    onChange={(e) =>
                      setFormData({ ...formData, apellido: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gb-border rounded-lg focus:outline-none focus:border-gb-accent"
                  />
                </div>
              </div>

              {/* Empresa */}
              <div>
                <label className="block text-sm font-medium text-gb-black mb-1.5">
                  Empresa
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) =>
                    setFormData({ ...formData, company_name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gb-border rounded-lg focus:outline-none focus:border-gb-accent"
                  placeholder="Nombre de la empresa"
                />
              </div>

              {/* Logo URL */}
              <div>
                <label className="block text-sm font-medium text-gb-black mb-1.5">
                  URL del Logo
                </label>
                <input
                  type="url"
                  value={formData.logo_url}
                  onChange={(e) =>
                    setFormData({ ...formData, logo_url: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gb-border rounded-lg focus:outline-none focus:border-gb-accent"
                  placeholder="https://..."
                />
              </div>

              {/* Foto URL */}
              <div>
                <label className="block text-sm font-medium text-gb-black mb-1.5">
                  URL de Foto de Perfil
                </label>
                <input
                  type="url"
                  value={formData.foto_url}
                  onChange={(e) =>
                    setFormData({ ...formData, foto_url: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gb-border rounded-lg focus:outline-none focus:border-gb-accent"
                  placeholder="https://..."
                />
              </div>

              {/* Rol (solo admin puede cambiar) */}
              {editingAdvisor && editingAdvisor.id !== advisor?.id && (
                <div>
                  <label className="block text-sm font-medium text-gb-black mb-1.5">
                    Rol
                  </label>
                  <select
                    value={formData.rol}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rol: e.target.value as "admin" | "advisor",
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gb-border rounded-lg focus:outline-none focus:border-gb-accent"
                  >
                    <option value="advisor">Asesor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gb-border bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gb-gray hover:text-gb-black"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.nombre || !formData.apellido || (!editingAdvisor && !formData.email)}
                className="flex items-center gap-2 px-4 py-2 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {editingAdvisor ? "Guardar Cambios" : "Crear Asesor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
