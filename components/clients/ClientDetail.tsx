"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import {
  ArrowLeft,
  Mail,
  Phone,
  DollarSign,
  Shield,
  TrendingUp,
  Edit,
  Plus,
  Loader,
  Trash2,
  FileText,
  Clock,
  User,
  Target,
  BarChart3,
  Briefcase,
  LineChart,
} from "lucide-react";
import PortfolioEvolution from "@/components/portfolio/PortfolioEvolution";

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  rut: string;
  patrimonio_estimado: number;
  ingreso_mensual: number;
  objetivo_inversion: string;
  horizonte_temporal: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
  tolerancia_perdida: number;
  tiene_portfolio: boolean;
  portfolio_data: any;
  status: string;
  notas: string;
  fecha_onboarding: string;
  ultima_interaccion: string;
  client_interactions: Interaction[];
  parent_client_id?: string | null;
}

interface AssociatedClient {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rut: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
}

interface ParentClient {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
}

interface Interaction {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  resultado: string;
  duracion_minutos: number;
  fecha: string;
  created_by: string;
}

const TIPO_LABELS: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  reunion: "Reunión",
  perfil_riesgo: "Perfil Riesgo",
  modelo_cartera: "Modelo Cartera",
  analisis_fondos: "Análisis Fondos",
  comparador_etf: "Comparador ETF",
  calculadora_apv: "Calculadora APV",
  otro: "Otro",
};

export default function ClientDetail({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { advisor, loading: authLoading } = useAdvisor();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newInteraction, setNewInteraction] = useState({
    tipo: "llamada",
    titulo: "",
    descripcion: "",
    resultado: "exitoso",
    duracion_minutos: "",
  });
  const [editForm, setEditForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    rut: "",
    patrimonio_estimado: "",
    notas: "",
  });
  const [associatedClients, setAssociatedClients] = useState<AssociatedClient[]>([]);
  const [parentClient, setParentClient] = useState<ParentClient | null>(null);
  const [showAddFamilyModal, setShowAddFamilyModal] = useState(false);
  const [savingFamily, setSavingFamily] = useState(false);
  const [familyForm, setFamilyForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    rut: "",
    telefono: "",
  });

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  const fetchClient = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}`);
      const data = await response.json();
      if (data.success) {
        setClient(data.client);
        setAssociatedClients(data.associatedClients || []);
        setParentClient(data.parentClient || null);
      }
    } catch (error) {
      console.error("Error fetching client:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInteraction = async () => {
    try {
      const response = await fetch(`/api/clients/${clientId}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newInteraction,
          duracion_minutos: newInteraction.duracion_minutos ? parseInt(newInteraction.duracion_minutos) : null,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setShowAddInteraction(false);
        setNewInteraction({ tipo: "llamada", titulo: "", descripcion: "", resultado: "exitoso", duracion_minutos: "" });
        fetchClient();
      }
    } catch (error) {
      console.error("Error adding interaction:", error);
    }
  };

  const handleDeleteClient = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        router.push("/clients");
      } else {
        alert("Error al eliminar cliente: " + (data.error || "Error desconocido"));
      }
    } catch (error) {
      console.error("Error deleting client:", error);
      alert("Error al eliminar cliente");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const openEditModal = () => {
    if (!client) return;
    setEditForm({
      nombre: client.nombre || "",
      apellido: client.apellido || "",
      email: client.email || "",
      telefono: client.telefono || "",
      rut: client.rut || "",
      patrimonio_estimado: client.patrimonio_estimado?.toString() || "",
      notas: client.notas || "",
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          patrimonio_estimado: editForm.patrimonio_estimado ? parseInt(editForm.patrimonio_estimado) : null,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setShowEditModal(false);
        fetchClient();
      } else {
        alert("Error al guardar: " + (data.error || "Error desconocido"));
      }
    } catch (error) {
      console.error("Error saving client:", error);
      alert("Error al guardar cliente");
    } finally {
      setSaving(false);
    }
  };

  const handleAddFamilyMember = async () => {
    if (!client) return;
    setSavingFamily(true);
    try {
      // Crear nuevo cliente con parent_client_id
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...familyForm,
          parent_client_id: client.id,
          // Heredar perfil de riesgo del titular
          perfil_riesgo: client.perfil_riesgo,
          puntaje_riesgo: client.puntaje_riesgo,
          status: "activo",
        }),
      });
      const data = await response.json();
      if (data.success) {
        setShowAddFamilyModal(false);
        setFamilyForm({ nombre: "", apellido: "", email: "", rut: "", telefono: "" });
        fetchClient();
      } else {
        alert("Error al agregar familiar: " + (data.error || "Error desconocido"));
      }
    } catch (error) {
      console.error("Error adding family member:", error);
      alert("Error al agregar familiar");
    } finally {
      setSavingFamily(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(amount);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gb-gray">Cliente no encontrado</p>
          <Link href="/clients" className="text-sm text-gb-accent hover:underline mt-2 inline-block">
            Volver a la lista
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {advisor && (
        <AdvisorHeader advisorName={advisor.name} advisorEmail={advisor.email} advisorPhoto={advisor.photo} advisorLogo={advisor.logo} companyName={advisor.companyName} isAdmin={advisor.isAdmin} />
      )}

      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Breadcrumb + actions */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-gb-gray hover:text-gb-black mb-2">
              <ArrowLeft className="w-4 h-4" />
              Clientes
            </Link>
            <h1 className="text-2xl font-semibold text-gb-black">
              {client.nombre} {client.apellido}
            </h1>
            <p className="text-sm text-gb-gray mt-0.5">
              Cliente desde {formatDate(client.fecha_onboarding)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddInteraction(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Interacción
            </button>
            <button
              onClick={openEditModal}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Editar
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </button>
          </div>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-gb-black mb-2">¿Eliminar cliente?</h3>
              <p className="text-sm text-gb-gray mb-4">
                Esta acción desactivará al cliente <strong>{client.nombre} {client.apellido}</strong>.
                El cliente no aparecerá en la lista pero sus datos se mantendrán en el sistema.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteClient}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {deleting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Sí, eliminar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit client modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gb-black mb-4">Editar Cliente</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                    <input
                      type="text"
                      value={editForm.nombre}
                      onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Apellido</label>
                    <input
                      type="text"
                      value={editForm.apellido}
                      onChange={(e) => setEditForm({ ...editForm, apellido: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                    <input
                      type="tel"
                      value={editForm.telefono}
                      onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">RUT</label>
                    <input
                      type="text"
                      value={editForm.rut}
                      onChange={(e) => setEditForm({ ...editForm, rut: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="12.345.678-9"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Patrimonio Estimado (CLP)</label>
                  <input
                    type="number"
                    value={editForm.patrimonio_estimado}
                    onChange={(e) => setEditForm({ ...editForm, patrimonio_estimado: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                  <textarea
                    value={editForm.notas}
                    onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Notas adicionales sobre el cliente..."
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar cambios"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add family member modal */}
        {showAddFamilyModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-gb-black mb-4">Agregar Familiar / RUT Asociado</h3>
              <p className="text-sm text-slate-500 mb-4">
                Este cliente heredará el perfil de riesgo de <strong>{client.nombre} {client.apellido}</strong>.
              </p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={familyForm.nombre}
                      onChange={(e) => setFamilyForm({ ...familyForm, nombre: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Apellido *</label>
                    <input
                      type="text"
                      value={familyForm.apellido}
                      onChange={(e) => setFamilyForm({ ...familyForm, apellido: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">RUT *</label>
                  <input
                    type="text"
                    value={familyForm.rut}
                    onChange={(e) => setFamilyForm({ ...familyForm, rut: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="12.345.678-9"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={familyForm.email}
                    onChange={(e) => setFamilyForm({ ...familyForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={familyForm.telefono}
                    onChange={(e) => setFamilyForm({ ...familyForm, telefono: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => setShowAddFamilyModal(false)}
                  disabled={savingFamily}
                  className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddFamilyMember}
                  disabled={savingFamily || !familyForm.nombre || !familyForm.apellido || !familyForm.rut}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {savingFamily ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Agregar Familiar"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            {/* Parent client indicator */}
            {parentClient && (
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
                <p className="text-xs text-amber-600 font-medium mb-1">Perfil heredado de:</p>
                <Link href={`/clients/${parentClient.id}`} className="text-sm font-semibold text-amber-800 hover:underline">
                  {parentClient.nombre} {parentClient.apellido}
                </Link>
                <p className="text-xs text-amber-600 mt-1">
                  {parentClient.perfil_riesgo} ({parentClient.puntaje_riesgo}/100)
                </p>
              </div>
            )}

            {/* Contact */}
            <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-500 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gb-black mb-3">Contacto</h2>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-gb-gray shrink-0" />
                  <span className="text-sm text-gb-black">{client.email}</span>
                </div>
                {client.telefono && (
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-gb-gray shrink-0" />
                    <span className="text-sm text-gb-black">{client.telefono}</span>
                  </div>
                )}
                {client.rut && (
                  <div className="flex items-center gap-2.5">
                    <User className="w-4 h-4 text-gb-gray shrink-0" />
                    <span className="text-sm text-gb-black">{client.rut}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Family Group - Only show for titular clients (no parent) */}
            {!parentClient && (
              <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-purple-500 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gb-black">Grupo Familiar</h2>
                  <button
                    onClick={() => setShowAddFamilyModal(true)}
                    className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Agregar
                  </button>
                </div>
                {associatedClients.length === 0 ? (
                  <p className="text-xs text-slate-500">No hay RUTs asociados</p>
                ) : (
                  <div className="space-y-2">
                    {associatedClients.map((member) => (
                      <Link
                        key={member.id}
                        href={`/clients/${member.id}`}
                        className="block p-2 bg-slate-50 rounded-md hover:bg-slate-100 transition-colors"
                      >
                        <p className="text-sm font-medium text-gb-black">
                          {member.nombre} {member.apellido}
                        </p>
                        <p className="text-xs text-slate-500">{member.rut}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Financial */}
            <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-600 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gb-black mb-3">Información Financiera</h2>
              <div className="space-y-3">
                {client.patrimonio_estimado && (
                  <div>
                    <p className="text-xs text-gb-gray">Patrimonio Estimado</p>
                    <p className="text-lg font-semibold text-gb-black">{formatCurrency(client.patrimonio_estimado)}</p>
                  </div>
                )}
                {client.ingreso_mensual && (
                  <div>
                    <p className="text-xs text-gb-gray">Ingreso Mensual</p>
                    <p className="text-lg font-semibold text-gb-black">{formatCurrency(client.ingreso_mensual)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Risk Profile */}
            {client.perfil_riesgo && (
              <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-indigo-500 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gb-black mb-3 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-indigo-500" />
                  Perfil de Riesgo
                </h2>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gb-gray">Clasificación</p>
                    <p className="text-base font-semibold text-gb-black capitalize">
                      {client.perfil_riesgo.replace("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gb-gray mb-1">Puntaje</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${client.puntaje_riesgo}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-gb-black">{client.puntaje_riesgo}</span>
                    </div>
                  </div>
                  {client.tolerancia_perdida && (
                    <div>
                      <p className="text-xs text-gb-gray">Tolerancia a Pérdida</p>
                      <p className="text-base font-semibold text-gb-black">{client.tolerancia_perdida}%</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Goals */}
            {(client.objetivo_inversion || client.horizonte_temporal) && (
              <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-400 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gb-black mb-3 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-blue-400" />
                  Objetivos
                </h2>
                <div className="space-y-2">
                  {client.objetivo_inversion && (
                    <div>
                      <p className="text-xs text-gb-gray">Objetivo</p>
                      <p className="text-sm text-gb-black">{client.objetivo_inversion}</p>
                    </div>
                  )}
                  {client.horizonte_temporal && (
                    <div>
                      <p className="text-xs text-gb-gray">Horizonte</p>
                      <p className="text-sm text-gb-black capitalize">{client.horizonte_temporal.replace("_", " ")}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {client.notas && (
              <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-slate-400 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gb-black mb-2">Notas</h2>
                <p className="text-sm text-gb-gray whitespace-pre-wrap">{client.notas}</p>
              </div>
            )}

            {/* Quick actions */}
            <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-500 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gb-black mb-3">Acciones</h2>
              <div className="space-y-1">
                <Link
                  href={`/analisis-cartola?client=${client.email}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Shield className="w-4 h-4" />
                  Perfil de Riesgo / Cartola
                </Link>
                <Link
                  href={`/portfolio-comparison?client=${client.email}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  Comparar Ideal vs Actual
                </Link>
                <Link
                  href={`/modelo-cartera?client=${client.email}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Briefcase className="w-4 h-4" />
                  Construir Modelo
                </Link>
                <Link
                  href={`/analisis-fondos?client=${client.email}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <TrendingUp className="w-4 h-4" />
                  Analizar Fondos
                </Link>
              </div>
            </div>
          </div>

          {/* Right column - Portfolio Evolution & Interactions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Portfolio Evolution - only show if client has portfolio data */}
            {client.tiene_portfolio && client.portfolio_data && (
              <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-emerald-500 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gb-black mb-4 flex items-center gap-1.5">
                  <LineChart className="w-4 h-4 text-emerald-500" />
                  Evolución del Portafolio
                </h2>
                <PortfolioEvolution
                  clientId={client.id}
                  clientName={`${client.nombre} ${client.apellido}`}
                  portfolioData={client.portfolio_data}
                />
              </div>
            )}

            <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-slate-300 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gb-black mb-4 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400" />
                Historial ({client.client_interactions?.length || 0})
              </h2>

              {/* Add interaction form */}
              {showAddInteraction && (
                <div className="bg-gb-light rounded-lg p-5 mb-5 border border-gb-border">
                  <h3 className="text-sm font-semibold text-gb-black mb-3">Nueva Interacción</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gb-gray mb-1">Tipo</label>
                        <select
                          value={newInteraction.tipo}
                          onChange={(e) => setNewInteraction({ ...newInteraction, tipo: e.target.value })}
                          className="w-full px-3 py-2 border border-gb-border rounded-md text-sm bg-white"
                        >
                          {Object.entries(TIPO_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gb-gray mb-1">Duración (min)</label>
                        <input
                          type="number"
                          value={newInteraction.duracion_minutos}
                          onChange={(e) => setNewInteraction({ ...newInteraction, duracion_minutos: e.target.value })}
                          className="w-full px-3 py-2 border border-gb-border rounded-md text-sm"
                          placeholder="30"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gb-gray mb-1">Título *</label>
                      <input
                        type="text"
                        value={newInteraction.titulo}
                        onChange={(e) => setNewInteraction({ ...newInteraction, titulo: e.target.value })}
                        className="w-full px-3 py-2 border border-gb-border rounded-md text-sm"
                        placeholder="Ej: Revisión de portafolio"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gb-gray mb-1">Descripción</label>
                      <textarea
                        value={newInteraction.descripcion}
                        onChange={(e) => setNewInteraction({ ...newInteraction, descripcion: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 border border-gb-border rounded-md text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddInteraction}
                        disabled={!newInteraction.titulo}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setShowAddInteraction(false)}
                        className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="space-y-3">
                {client.client_interactions && client.client_interactions.length > 0 ? (
                  client.client_interactions.map((interaction) => (
                    <div key={interaction.id} className="border border-gb-border rounded-lg p-4 hover:bg-blue-50 hover:border-blue-200 transition-colors">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <h4 className="text-sm font-medium text-gb-black">{interaction.titulo}</h4>
                          <p className="text-xs text-gb-gray mt-0.5">{formatDateTime(interaction.fecha)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {interaction.duracion_minutos && (
                            <span className="flex items-center gap-1 text-xs text-gb-gray">
                              <Clock className="w-3 h-3" />
                              {interaction.duracion_minutos}m
                            </span>
                          )}
                        </div>
                      </div>
                      {interaction.descripcion && (
                        <p className="text-sm text-gb-gray mt-1">{interaction.descripcion}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                          {TIPO_LABELS[interaction.tipo] || interaction.tipo}
                        </span>
                        {interaction.resultado && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            interaction.resultado === "exitoso" ? "bg-emerald-50 text-emerald-700" :
                            interaction.resultado === "pendiente" ? "bg-amber-50 text-amber-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {interaction.resultado}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-10 h-10 text-gb-border mx-auto mb-2" />
                    <p className="text-sm text-gb-gray">Sin interacciones registradas</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
