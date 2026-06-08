"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  rut: string;
  fecha_nacimiento?: string;
  patrimonio_estimado: number;
  ingreso_mensual: number;
  objetivo_inversion: string;
  horizonte_temporal: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
  tolerancia_perdida: number;
  tiene_portfolio: boolean;
  portfolio_data: Record<string, unknown>;
  status: string;
  notas: string;
  contract_url?: string | null;
  contract_uploaded_at?: string | null;
  fecha_onboarding: string;
  ultima_interaccion: string;
  client_interactions: Interaction[];
  parent_client_id?: string | null;
  questionnaire_frequency?: string;
  last_questionnaire_date?: string;
  next_questionnaire_date?: string;
  fund_selection_mode?: string;
  servicios_adicionales?: {
    seguros?: { activo: boolean; poliza?: string; cobertura?: string; beneficiarios?: string; notas?: string };
    asesoria_tributaria?: { activo: boolean; descripcion?: string };
    asesoria_inmobiliaria?: { activo: boolean; descripcion?: string };
  } | null;
}

export interface AssociatedClient {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rut: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
}

export interface ParentClient {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
}

export interface Interaction {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  resultado: string;
  duracion_minutos: number;
  fecha: string;
  created_by: string;
}

export function useClientData(clientId: string) {
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    rut: "",
    fecha_nacimiento: "",
    patrimonio_estimado: "",
    notas: "",
  });
  const [associatedClients, setAssociatedClients] = useState<AssociatedClient[]>([]);
  const [parentClient, setParentClient] = useState<ParentClient | null>(null);

  const fetchClient = useCallback(async () => {
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
  }, [clientId]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  const openEditModal = () => {
    if (!client) return;
    setEditForm({
      nombre: client.nombre || "",
      apellido: client.apellido || "",
      email: client.email || "",
      telefono: client.telefono || "",
      rut: client.rut || "",
      fecha_nacimiento: client.fecha_nacimiento || "",
      patrimonio_estimado: client.patrimonio_estimado?.toString() || "",
      notas: client.notas || "",
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const patrimonio = editForm.patrimonio_estimado ? parseInt(editForm.patrimonio_estimado, 10) : null;
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          patrimonio_estimado: Number.isNaN(patrimonio) ? null : patrimonio,
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

  const handleStatusChange = async (newStatus: string) => {
    if (!client) return;
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) setClient({ ...client, status: newStatus });
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const handleRiskProfileChange = async (perfil: string) => {
    if (!client) return;
    try {
      await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_riesgo: perfil }),
      });
      fetchClient();
    } catch (err) {
      console.error("Error updating perfil:", err);
    }
  };

  const updateQuestionnaireFrequency = async (frequency: string) => {
    try {
      await fetch(`/api/clients/${client?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionnaire_frequency: frequency }),
      });
      fetchClient();
    } catch (err) {
      console.error("Error updating frequency:", err);
    }
  };

  const updateFundMode = async (mode: string) => {
    try {
      await fetch(`/api/clients/${client?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fund_selection_mode: mode }),
      });
      fetchClient();
    } catch (err) {
      console.error("Error updating fund mode:", err);
    }
  };

  const handleDeleteClient = async () => {
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
    }
  };

  return {
    client,
    setClient,
    loading,
    showEditModal,
    setShowEditModal,
    saving,
    editForm,
    setEditForm,
    associatedClients,
    parentClient,
    fetchClient,
    openEditModal,
    handleSaveEdit,
    handleStatusChange,
    handleRiskProfileChange,
    updateQuestionnaireFrequency,
    updateFundMode,
    handleDeleteClient,
  };
}
