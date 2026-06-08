"use client";

import { useState, useCallback } from "react";
import type { Client } from "./useClientData";

export function useClientModals(clientId: string, client: Client | null, fetchClient: () => void) {
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddFamilyModal, setShowAddFamilyModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingServicios, setEditingServicios] = useState(false);

  const [newInteraction, setNewInteraction] = useState({
    tipo: "llamada",
    titulo: "",
    descripcion: "",
    resultado: "exitoso",
    duracion_minutos: "",
  });
  const [familyForm, setFamilyForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    rut: "",
    telefono: "",
  });
  const [serviciosForm, setServiciosForm] = useState({
    seguros: { activo: false, poliza: "", cobertura: "", beneficiarios: "", notas: "" },
    asesoria_tributaria: { activo: false, descripcion: "" },
    asesoria_inmobiliaria: { activo: false, descripcion: "" },
  });

  const [deleting, setDeleting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const [savingFamily, setSavingFamily] = useState(false);
  const [savingServicios, setSavingServicios] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [sharingWith, setSharingWith] = useState<string | null>(null);
  const [shareAdvisors, setShareAdvisors] = useState<Array<{ id: string; nombre: string; apellido: string; email: string }>>([]);
  const [currentShares, setCurrentShares] = useState<Array<{ id: string; advisor_id: string; role: string; advisor: { id: string; nombre: string; apellido: string; email: string } }>>([]);

  const fetchShareData = useCallback(async () => {
    setShareLoading(true);
    try {
      const [sharesRes, advisorsRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/share`),
        fetch("/api/advisors"),
      ]);
      const sharesData = await sharesRes.json();
      const advisorsData = await advisorsRes.json();
      if (sharesData.success) setCurrentShares(sharesData.shares || []);
      if (advisorsData.success) setShareAdvisors(advisorsData.advisors || []);
    } catch (error) {
      console.error("Error fetching share data:", error);
    } finally {
      setShareLoading(false);
    }
  }, [clientId]);

  const handleShare = async (targetAdvisorId: string) => {
    setSharingWith(targetAdvisorId);
    try {
      const res = await fetch(`/api/clients/${clientId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advisor_id: targetAdvisorId, role: "editor" }),
      });
      const data = await res.json();
      if (data.success) {
        fetchShareData();
      }
    } catch (error) {
      console.error("Error sharing client:", error);
    } finally {
      setSharingWith(null);
    }
  };

  const handleUnshare = async (targetAdvisorId: string) => {
    setSharingWith(targetAdvisorId);
    try {
      const res = await fetch(`/api/clients/${clientId}/share?advisor_id=${targetAdvisorId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchShareData();
      }
    } catch (error) {
      console.error("Error unsharing client:", error);
    } finally {
      setSharingWith(null);
    }
  };

  const handleAddInteraction = async () => {
    try {
      const duracion = newInteraction.duracion_minutos ? parseInt(newInteraction.duracion_minutos, 10) : null;
      const response = await fetch(`/api/clients/${clientId}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newInteraction,
          duracion_minutos: Number.isNaN(duracion) ? null : duracion,
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

  const handleDeleteClientConfirm = async (onDelete: () => Promise<void>) => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleInvitePortal = async () => {
    setInviting(true);
    try {
      const response = await fetch("/api/client/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client?.id }),
      });
      const data = await response.json();
      if (data.success) {
        setInviteSuccess(true);
        if (data.portalLink) setPortalLink(data.portalLink);
        if (data.warning) {
          alert("Nota: " + data.warning + "\nPuedes copiar el link de acceso desde la sección Portal.");
        }
        fetchClient();
      } else {
        alert("Error: " + (data.error || "No se pudo enviar la invitación"));
      }
    } catch (err) {
      console.error("Error inviting client:", err);
      alert("Error al enviar invitación");
    } finally {
      setInviting(false);
    }
  };

  const handleUploadContract = async (file: File) => {
    setUploadingContract(true);
    setContractError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/clients/${clientId}/contract`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        fetchClient();
      } else {
        setContractError(data.error || "Error al subir contrato");
      }
    } catch {
      setContractError("Error de conexión");
    } finally {
      setUploadingContract(false);
    }
  };

  const handleDownloadContract = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/contract`);
      const data = await res.json();
      if (data.success && data.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      // silent
    }
  };

  const handleDeleteContract = async () => {
    if (!confirm("¿Eliminar el contrato?")) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/contract`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchClient();
      }
    } catch {
      // silent
    }
  };

  const handleEditServicios = () => {
    if (!client) return;
    const s = client.servicios_adicionales;
    setServiciosForm({
      seguros: {
        activo: s?.seguros?.activo || false,
        poliza: s?.seguros?.poliza || "",
        cobertura: s?.seguros?.cobertura || "",
        beneficiarios: s?.seguros?.beneficiarios || "",
        notas: s?.seguros?.notas || "",
      },
      asesoria_tributaria: {
        activo: s?.asesoria_tributaria?.activo || false,
        descripcion: s?.asesoria_tributaria?.descripcion || "",
      },
      asesoria_inmobiliaria: {
        activo: s?.asesoria_inmobiliaria?.activo || false,
        descripcion: s?.asesoria_inmobiliaria?.descripcion || "",
      },
    });
    setEditingServicios(true);
  };

  const handleSaveServicios = async () => {
    setSavingServicios(true);
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servicios_adicionales: serviciosForm }),
      });
      const data = await response.json();
      if (data.success) {
        setEditingServicios(false);
        fetchClient();
      }
    } catch {
      alert("Error al guardar servicios");
    } finally {
      setSavingServicios(false);
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

  return {
    // Modal visibility
    showAddInteraction,
    setShowAddInteraction,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showAddFamilyModal,
    setShowAddFamilyModal,
    showShareModal,
    setShowShareModal,
    editingServicios,
    setEditingServicios,

    // Form state
    newInteraction,
    setNewInteraction,
    familyForm,
    setFamilyForm,
    serviciosForm,
    setServiciosForm,

    // Loading state
    deleting,
    inviting,
    inviteSuccess,
    portalLink,
    uploadingContract,
    contractError,
    savingFamily,
    savingServicios,
    shareLoading,
    sharingWith,
    shareAdvisors,
    currentShares,

    // Handlers
    fetchShareData,
    handleShare,
    handleUnshare,
    handleAddInteraction,
    handleDeleteClientConfirm,
    handleInvitePortal,
    handleUploadContract,
    handleDownloadContract,
    handleDeleteContract,
    handleEditServicios,
    handleSaveServicios,
    handleAddFamilyMember,
  };
}
