"use client";

import React from "react";
import Link from "next/link";
import {
  Mail,
  Phone,
  Shield,
  TrendingUp,
  Plus,
  Loader,
  FileText,
  Clock,
  User,
  Target,
  BarChart3,
  Briefcase,
  LineChart,
  Send,
  ExternalLink,
  Upload,
  Download,
  CheckCircle2,
  X,
  AlertTriangle,
  Star,
} from "lucide-react";
import ReportConfigPanel from "@/components/clients/ReportConfigPanel";
import type { Client, AssociatedClient, ParentClient } from "./hooks/useClientData";

export type ServiciosFormState = {
  seguros: { activo: boolean; poliza: string; cobertura: string; beneficiarios: string; notas: string };
  asesoria_tributaria: { activo: boolean; descripcion: string };
  asesoria_inmobiliaria: { activo: boolean; descripcion: string };
};

interface ClientInfoCardProps {
  client: Client;
  parentClient: ParentClient | null;
  associatedClients: AssociatedClient[];
  advisorEmail?: string;

  // Edit servicios
  editingServicios: boolean;
  serviciosForm: ServiciosFormState;
  setServiciosForm: React.Dispatch<React.SetStateAction<ServiciosFormState>>;
  savingServicios: boolean;
  setEditingServicios: (v: boolean) => void;
  handleEditServicios: () => void;
  handleSaveServicios: () => void;

  // Family
  setShowAddFamilyModal: (v: boolean) => void;

  // Contract
  uploadingContract: boolean;
  contractError: string | null;
  handleUploadContract: (file: File) => void;
  handleDownloadContract: () => void;
  handleDeleteContract: () => void;

  // Portal
  inviting: boolean;
  inviteSuccess: boolean;
  portalLink: string | null;
  handleInvitePortal: () => void;

  // Risk profile
  handleRiskProfileChange: (perfil: string) => void;
  updateQuestionnaireFrequency: (frequency: string) => void;

  // Fund mode
  updateFundMode: (mode: string) => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(amount);

export default function ClientInfoCard({
  client,
  parentClient,
  associatedClients,
  advisorEmail,
  editingServicios,
  serviciosForm,
  setServiciosForm,
  savingServicios,
  setEditingServicios,
  handleEditServicios,
  handleSaveServicios,
  setShowAddFamilyModal,
  uploadingContract,
  contractError,
  handleUploadContract,
  handleDownloadContract,
  handleDeleteContract,
  inviting,
  inviteSuccess,
  portalLink,
  handleInvitePortal,
  handleRiskProfileChange,
  updateQuestionnaireFrequency,
  updateFundMode,
}: ClientInfoCardProps) {
  return (
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
      <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-indigo-500 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gb-black mb-3 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-indigo-500" />
            Perfil de Riesgo
          </h2>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gb-gray mb-1">Clasificación</p>
              <select
                value={client.perfil_riesgo || ""}
                onChange={(e) => handleRiskProfileChange(e.target.value)}
                className="text-sm font-semibold border border-gb-border rounded px-2 py-1.5 w-full capitalize"
              >
                <option value="">Sin perfil</option>
                <option value="defensivo">Defensivo</option>
                <option value="conservador">Conservador</option>
                <option value="moderado">Moderado</option>
                <option value="agresivo">Agresivo</option>
                <option value="muy_agresivo">Muy Agresivo</option>
              </select>
            </div>
            {client.puntaje_riesgo > 0 && (
            <div>
              <p className="text-xs text-gb-gray mb-1">Puntaje (cuestionario)</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${client.puntaje_riesgo}%` }} />
                </div>
                <span className="text-sm font-semibold text-gb-black">{client.puntaje_riesgo}</span>
              </div>
            </div>
            )}
            {client.tolerancia_perdida > 0 && (
              <div>
                <p className="text-xs text-gb-gray">Tolerancia a Pérdida</p>
                <p className="text-base font-semibold text-gb-black">{client.tolerancia_perdida}%</p>
              </div>
            )}
            <button
              onClick={() => {
                if (!advisorEmail) return;
                const link = `/analisis-cartola?email=${encodeURIComponent(client.email)}&advisor=${encodeURIComponent(advisorEmail)}`;
                window.open(link, "_blank");
              }}
              className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <Send className="w-3.5 h-3.5" />
              Re-enviar cuestionario de riesgo
            </button>
            {/* Frecuencia de cuestionario */}
            <div className="flex items-center gap-2 mt-3">
              <Clock className="w-4 h-4 text-gb-gray" />
              <select
                value={client.questionnaire_frequency || "1y"}
                onChange={(e) => updateQuestionnaireFrequency(e.target.value)}
                className="text-sm border border-gb-border rounded px-2 py-1"
              >
                <option value="90d">Cada 90 dias</option>
                <option value="180d">Cada 6 meses</option>
                <option value="1y">Cada ano</option>
                <option value="2y">Cada 2 anos</option>
                <option value="none">No programar</option>
              </select>
              {client.next_questionnaire_date && (
                <span className="text-xs text-gb-gray">
                  Proximo: {new Date(client.next_questionnaire_date).toLocaleDateString("es-CL")}
                </span>
              )}
            </div>
            {client.next_questionnaire_date && new Date(client.next_questionnaire_date) <= new Date() && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-sm mt-2">
                <AlertTriangle className="w-4 h-4" />
                Cuestionario de riesgo vencido — re-enviar al cliente
              </div>
            )}
          </div>
        </div>

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

      {/* Fund Selection Mode */}
      <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-emerald-400 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gb-black mb-3 flex items-center gap-1.5">
          <Star className="w-4 h-4 text-emerald-500" />
          Fondos para Recomendaciones IA
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={client.fund_selection_mode || "all_funds"}
            onChange={(e) => updateFundMode(e.target.value)}
            className="text-sm border border-gb-border rounded px-2 py-1"
          >
            <option value="all_funds">Todos los fondos (universo CMF)</option>
            <option value="my_list_with_fallback">Mi lista + fallback CMF</option>
            <option value="only_my_list">Solo mi lista de fondos</option>
          </select>
        </div>
        <p className="text-xs text-gb-gray mt-2">
          Define que fondos usa la IA al generar carteras para este cliente.{" "}
          <Link href="/advisor/fondos" className="text-indigo-600 hover:underline">
            Gestionar lista de fondos
          </Link>
        </p>
      </div>

      {/* Contract */}
      <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-amber-500 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gb-black mb-3 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-amber-500" />
          Contrato de Prestación de Servicios
        </h2>
        {client.contract_url ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800">Contrato cargado</p>
                {client.contract_uploaded_at && (
                  <p className="text-xs text-green-600">
                    {new Date(client.contract_uploaded_at).toLocaleDateString("es-CL", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDownloadContract}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Ver / Descargar
              </button>
              <button
                onClick={handleDeleteContract}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Replace contract */}
            <label className="block">
              <span className="text-xs text-gb-gray cursor-pointer hover:text-gb-black">
                Reemplazar contrato...
              </span>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadContract(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        ) : (
          <div>
            <p className="text-xs text-gb-gray mb-3">
              Sube el contrato de prestación de servicios firmado (PDF, máx 10MB).
            </p>
            <label className={`flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              uploadingContract
                ? "border-amber-300 bg-amber-50"
                : "border-slate-300 hover:border-amber-400 hover:bg-amber-50"
            }`}>
              {uploadingContract ? (
                <Loader className="w-6 h-6 text-amber-500 animate-spin" />
              ) : (
                <Upload className="w-6 h-6 text-amber-500" />
              )}
              <span className="text-sm font-medium text-gb-gray">
                {uploadingContract ? "Subiendo..." : "Subir Contrato PDF"}
              </span>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                disabled={uploadingContract}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadContract(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
        {contractError && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {contractError}
          </div>
        )}
      </div>

      {/* Notes */}
      {client.notas && (
        <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-slate-400 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gb-black mb-2">Notas</h2>
          <p className="text-sm text-gb-gray whitespace-pre-wrap">{client.notas}</p>
        </div>
      )}

      {/* Servicios Adicionales */}
      <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-400 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gb-black flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-blue-500" />
            Servicios Adicionales
          </h2>
          {!editingServicios ? (
            <button
              onClick={handleEditServicios}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Editar
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditingServicios(false)}
                className="text-xs text-gb-gray hover:text-gb-black"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveServicios}
                disabled={savingServicios}
                className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {savingServicios ? "Guardando..." : "Guardar"}
              </button>
            </div>
          )}
        </div>

        {editingServicios ? (
          <div className="space-y-4">
            {/* Seguros */}
            <div className="border border-gb-border rounded-lg p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gb-black mb-2">
                <input
                  type="checkbox"
                  checked={serviciosForm.seguros.activo}
                  onChange={(e) => setServiciosForm({
                    ...serviciosForm,
                    seguros: { ...serviciosForm.seguros, activo: e.target.checked },
                  })}
                  className="rounded border-gb-border"
                />
                <Shield className="w-3.5 h-3.5 text-blue-500" />
                Seguros
              </label>
              {serviciosForm.seguros.activo && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input
                    placeholder="N° Póliza"
                    value={serviciosForm.seguros.poliza}
                    onChange={(e) => setServiciosForm({
                      ...serviciosForm,
                      seguros: { ...serviciosForm.seguros, poliza: e.target.value },
                    })}
                    className="text-sm border border-gb-border rounded px-2 py-1.5"
                  />
                  <input
                    placeholder="Beneficiarios"
                    value={serviciosForm.seguros.beneficiarios}
                    onChange={(e) => setServiciosForm({
                      ...serviciosForm,
                      seguros: { ...serviciosForm.seguros, beneficiarios: e.target.value },
                    })}
                    className="text-sm border border-gb-border rounded px-2 py-1.5"
                  />
                  <textarea
                    placeholder="Cobertura"
                    value={serviciosForm.seguros.cobertura}
                    onChange={(e) => setServiciosForm({
                      ...serviciosForm,
                      seguros: { ...serviciosForm.seguros, cobertura: e.target.value },
                    })}
                    rows={2}
                    className="text-sm border border-gb-border rounded px-2 py-1.5 col-span-2"
                  />
                  <textarea
                    placeholder="Notas"
                    value={serviciosForm.seguros.notas}
                    onChange={(e) => setServiciosForm({
                      ...serviciosForm,
                      seguros: { ...serviciosForm.seguros, notas: e.target.value },
                    })}
                    rows={1}
                    className="text-sm border border-gb-border rounded px-2 py-1.5 col-span-2"
                  />
                </div>
              )}
            </div>

            {/* Asesoría Tributaria */}
            <div className="border border-gb-border rounded-lg p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gb-black mb-2">
                <input
                  type="checkbox"
                  checked={serviciosForm.asesoria_tributaria.activo}
                  onChange={(e) => setServiciosForm({
                    ...serviciosForm,
                    asesoria_tributaria: { ...serviciosForm.asesoria_tributaria, activo: e.target.checked },
                  })}
                  className="rounded border-gb-border"
                />
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                Asesoría Tributaria
              </label>
              {serviciosForm.asesoria_tributaria.activo && (
                <textarea
                  placeholder="Descripción del servicio tributario..."
                  value={serviciosForm.asesoria_tributaria.descripcion}
                  onChange={(e) => setServiciosForm({
                    ...serviciosForm,
                    asesoria_tributaria: { ...serviciosForm.asesoria_tributaria, descripcion: e.target.value },
                  })}
                  rows={2}
                  className="text-sm border border-gb-border rounded px-2 py-1.5 w-full mt-1"
                />
              )}
            </div>

            {/* Asesoría Inmobiliaria */}
            <div className="border border-gb-border rounded-lg p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gb-black mb-2">
                <input
                  type="checkbox"
                  checked={serviciosForm.asesoria_inmobiliaria.activo}
                  onChange={(e) => setServiciosForm({
                    ...serviciosForm,
                    asesoria_inmobiliaria: { ...serviciosForm.asesoria_inmobiliaria, activo: e.target.checked },
                  })}
                  className="rounded border-gb-border"
                />
                <Target className="w-3.5 h-3.5 text-green-600" />
                Asesoría Inmobiliaria
              </label>
              {serviciosForm.asesoria_inmobiliaria.activo && (
                <textarea
                  placeholder="Descripción del servicio inmobiliario..."
                  value={serviciosForm.asesoria_inmobiliaria.descripcion}
                  onChange={(e) => setServiciosForm({
                    ...serviciosForm,
                    asesoria_inmobiliaria: { ...serviciosForm.asesoria_inmobiliaria, descripcion: e.target.value },
                  })}
                  rows={2}
                  className="text-sm border border-gb-border rounded px-2 py-1.5 w-full mt-1"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {(() => {
              const s = client.servicios_adicionales;
              const hasAny = s?.seguros?.activo || s?.asesoria_tributaria?.activo || s?.asesoria_inmobiliaria?.activo;
              if (!hasAny) return <p className="text-sm text-gb-gray italic">Sin servicios adicionales registrados</p>;
              return (
                <>
                  {s?.seguros?.activo && (
                    <div className="flex items-start gap-2 text-sm">
                      <Shield className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-gb-black">Seguros</span>
                        {s.seguros.poliza && <span className="text-gb-gray ml-1">— Póliza: {s.seguros.poliza}</span>}
                        {s.seguros.beneficiarios && <p className="text-gb-gray">Beneficiarios: {s.seguros.beneficiarios}</p>}
                        {s.seguros.cobertura && <p className="text-gb-gray">{s.seguros.cobertura}</p>}
                        {s.seguros.notas && <p className="text-gb-gray italic text-xs">{s.seguros.notas}</p>}
                      </div>
                    </div>
                  )}
                  {s?.asesoria_tributaria?.activo && (
                    <div className="flex items-start gap-2 text-sm">
                      <FileText className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-gb-black">Asesoría Tributaria</span>
                        {s.asesoria_tributaria.descripcion && <p className="text-gb-gray">{s.asesoria_tributaria.descripcion}</p>}
                      </div>
                    </div>
                  )}
                  {s?.asesoria_inmobiliaria?.activo && (
                    <div className="flex items-start gap-2 text-sm">
                      <Target className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium text-gb-black">Asesoría Inmobiliaria</span>
                        {s.asesoria_inmobiliaria.descripcion && <p className="text-gb-gray">{s.asesoria_inmobiliaria.descripcion}</p>}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Portal invite */}
      <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-emerald-500 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gb-black mb-3 flex items-center gap-1.5">
          <ExternalLink className="w-4 h-4 text-emerald-500" />
          Portal del Cliente
        </h2>
        {inviteSuccess ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-md p-3">
              <Send className="w-4 h-4" />
              Invitación enviada a {client.email}
            </div>
            {portalLink && (
              <div className="text-xs text-gb-gray bg-gray-50 rounded-md p-3">
                <p className="mb-1 font-medium">Link de acceso (si el email no llega):</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={portalLink}
                    className="flex-1 text-xs bg-white border border-gb-border rounded px-2 py-1 truncate"
                  />
                  <button
                    onClick={() => { navigator.clipboard.writeText(portalLink); }}
                    className="text-xs text-emerald-600 hover:text-emerald-800 font-medium whitespace-nowrap"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs text-gb-gray mb-3">
              Envía acceso al portal donde el cliente puede ver su perfil de riesgo, portafolio y enviarte mensajes.
            </p>
            <button
              onClick={handleInvitePortal}
              disabled={inviting || !client.email}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {inviting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Invitar al Portal
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Report configuration */}
      <ReportConfigPanel clientId={client.id} />

      {/* Quick actions */}
      <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-500 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gb-black mb-3">Acciones</h2>
        <div className="space-y-1">
          <Link
            href={`/clients/${client.id}/seguimiento`}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <LineChart className="w-4 h-4" />
            Seguimiento de Cartolas
          </Link>
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
  );
}
