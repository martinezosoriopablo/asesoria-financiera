"use client";

import React from "react";
import Link from "next/link";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import {
  ArrowLeft,
  Plus,
  Loader,
  Trash2,
  FileText,
  Clock,
  Edit,
  LineChart,
  Send,
  X,
  Share2,
  UserPlus,
} from "lucide-react";
import PortfolioEvolution from "@/components/portfolio/PortfolioEvolution";
import ClientInfoCard from "@/components/clients/ClientInfoCard";
import { useClientData } from "./hooks/useClientData";
import { useClientModals } from "./hooks/useClientModals";

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
  const { advisor, loading: authLoading } = useAdvisor();

  const {
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
  } = useClientData(clientId);

  const {
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
    newInteraction,
    setNewInteraction,
    familyForm,
    setFamilyForm,
    serviciosForm,
    setServiciosForm,
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
  } = useClientModals(clientId, client, fetchClient);

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
      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Breadcrumb + actions */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-gb-gray hover:text-gb-black mb-2">
              <ArrowLeft className="w-4 h-4" />
              Clientes
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gb-black">
                {client.nombre} {client.apellido}
              </h1>
              <select
                value={client.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className={`text-xs font-medium px-2 py-0.5 rounded border-0 cursor-pointer ${
                  client.status === "activo" ? "bg-emerald-50 text-emerald-700" :
                  client.status === "prospecto" ? "bg-amber-50 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                }`}
              >
                <option value="activo">Activo</option>
                <option value="prospecto">Prospecto</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
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
              onClick={() => {
                fetchShareData();
                setShowShareModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-purple-200 text-purple-600 rounded-md hover:bg-purple-50 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Compartir
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

        {/* Share client modal */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gb-black flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-purple-600" />
                  Compartir Cliente
                </h3>
                <button onClick={() => setShowShareModal(false)} className="text-gb-gray hover:text-gb-black">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {shareLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="w-5 h-5 animate-spin text-purple-500" />
                </div>
              ) : (
                <>
                  {/* Current shares */}
                  {currentShares.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gb-gray uppercase mb-2">Compartido con</p>
                      <div className="space-y-2">
                        {currentShares.map((share) => (
                          <div key={share.id} className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-md px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-gb-black">
                                {share.advisor?.nombre} {share.advisor?.apellido}
                              </p>
                              <p className="text-xs text-gb-gray">{share.advisor?.email}</p>
                            </div>
                            <button
                              onClick={() => handleUnshare(share.advisor_id)}
                              disabled={sharingWith === share.advisor_id}
                              className="text-xs px-2 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                            >
                              {sharingWith === share.advisor_id ? (
                                <Loader className="w-3 h-3 animate-spin" />
                              ) : (
                                "Quitar"
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Available advisors to share with */}
                  {(() => {
                    const sharedIds = new Set(currentShares.map(s => s.advisor_id));
                    const available = shareAdvisors.filter(
                      a => a.id !== advisor?.id && !sharedIds.has(a.id)
                    );

                    if (available.length === 0) {
                      return (
                        <p className="text-sm text-gb-gray text-center py-4">
                          {shareAdvisors.length <= 1
                            ? "No hay otros asesores registrados"
                            : "Ya compartido con todos los asesores"}
                        </p>
                      );
                    }

                    return (
                      <div>
                        <p className="text-xs font-semibold text-gb-gray uppercase mb-2">Agregar asesor</p>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {available.map((a) => (
                            <div key={a.id} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2 hover:bg-slate-50">
                              <div>
                                <p className="text-sm font-medium text-gb-black">
                                  {a.nombre} {a.apellido}
                                </p>
                                <p className="text-xs text-gb-gray">{a.email}</p>
                              </div>
                              <button
                                onClick={() => handleShare(a.id)}
                                disabled={sharingWith === a.id}
                                className="flex items-center gap-1 text-xs px-2 py-1 text-purple-600 border border-purple-200 rounded hover:bg-purple-50 disabled:opacity-50"
                              >
                                {sharingWith === a.id ? (
                                  <Loader className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    <UserPlus className="w-3 h-3" />
                                    Compartir
                                  </>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        )}

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
                  onClick={() => handleDeleteClientConfirm(handleDeleteClient)}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Nacimiento</label>
                  <input
                    type="date"
                    value={editForm.fecha_nacimiento}
                    onChange={(e) => setEditForm({ ...editForm, fecha_nacimiento: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
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
          <ClientInfoCard
            client={client}
            parentClient={parentClient}
            associatedClients={associatedClients}
            advisorEmail={advisor?.email}
            editingServicios={editingServicios}
            serviciosForm={serviciosForm}
            setServiciosForm={setServiciosForm}
            savingServicios={savingServicios}
            setEditingServicios={setEditingServicios}
            handleEditServicios={handleEditServicios}
            handleSaveServicios={handleSaveServicios}
            setShowAddFamilyModal={setShowAddFamilyModal}
            uploadingContract={uploadingContract}
            contractError={contractError}
            handleUploadContract={handleUploadContract}
            handleDownloadContract={handleDownloadContract}
            handleDeleteContract={handleDeleteContract}
            inviting={inviting}
            inviteSuccess={inviteSuccess}
            portalLink={portalLink}
            handleInvitePortal={handleInvitePortal}
            handleRiskProfileChange={handleRiskProfileChange}
            updateQuestionnaireFrequency={updateQuestionnaireFrequency}
            updateFundMode={updateFundMode}
          />

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
