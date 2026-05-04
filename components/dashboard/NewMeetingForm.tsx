"use client";

import React, { useState, useEffect } from "react";
import { Calendar, MapPin, Video, Phone, X } from "lucide-react";

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
}

interface MeetingToEdit {
  id: string;
  client_id?: string;
  titulo: string;
  descripcion?: string;
  fecha: string;
  duracion_minutos?: number;
  tipo: string;
  ubicacion?: string;
}

interface NewMeetingFormProps {
  onClose: () => void;
  onSuccess: () => void;
  editMeeting?: MeetingToEdit | null;
}

export default function NewMeetingForm({ onClose, onSuccess, editMeeting }: NewMeetingFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const isEditing = !!editMeeting;

  const getInitialFormData = () => {
    if (editMeeting) {
      const dt = new Date(editMeeting.fecha);
      return {
        client_id: editMeeting.client_id || "",
        titulo: editMeeting.titulo || "",
        descripcion: editMeeting.descripcion || "",
        fecha: dt.toISOString().split("T")[0],
        hora: dt.toTimeString().slice(0, 5),
        duracion_minutos: String(editMeeting.duracion_minutos || 60),
        tipo: editMeeting.tipo || "presencial",
        ubicacion: editMeeting.ubicacion || "",
      };
    }
    return {
      client_id: "",
      titulo: "",
      descripcion: "",
      fecha: "",
      hora: "",
      duracion_minutos: "60",
      tipo: "presencial",
      ubicacion: "",
    };
  };

  const [formData, setFormData] = useState(getInitialFormData);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      if (data.success) {
        setClients(data.clients);
      }
    } catch {
      // Error silencioso
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const fechaHora = `${formData.fecha}T${formData.hora}:00`;

      if (isEditing) {
        // PATCH — editar reunión existente
        const res = await fetch("/api/advisor/meetings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editMeeting!.id,
            titulo: formData.titulo,
            descripcion: formData.descripcion || null,
            fecha: fechaHora,
            duracion_minutos: parseInt(formData.duracion_minutos),
            tipo: formData.tipo,
            ubicacion: formData.ubicacion || null,
          }),
        });

        const data = await res.json();
        if (data.success) {
          setSuccess(true);
          setTimeout(() => { onSuccess(); onClose(); }, 1000);
        } else {
          setError(data.error || "Error al actualizar reunión");
        }
      } else {
        // POST — crear reunión nueva
        const res = await fetch("/api/advisor/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: formData.client_id,
            titulo: formData.titulo,
            descripcion: formData.descripcion || null,
            fecha: fechaHora,
            duracion_minutos: parseInt(formData.duracion_minutos),
            tipo: formData.tipo,
            ubicacion: formData.ubicacion || null,
          }),
        });

        const data = await res.json();
        if (data.success) {
          setSuccess(true);
          if (data.googleError) {
            setError(data.googleError);
          }
          setTimeout(() => { onSuccess(); onClose(); }, 1500);
        } else {
          setError(data.error || "Error al crear reunión");
        }
      }
    } catch {
      setError(isEditing ? "Error al actualizar reunión" : "Error al crear reunión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {isEditing ? "Editar Reunion" : "Nueva Reunion"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              <p className="font-bold">
                {isEditing ? "Reunion actualizada" : "Reunion creada exitosamente"}
              </p>
            </div>
          )}

          {/* Cliente — solo en modo creación */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Cliente *
              </label>
              <select
                required
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              >
                <option value="">Seleccionar cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.nombre} {client.apellido} ({client.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Titulo */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Titulo *</label>
            <input
              type="text"
              required
              placeholder="Ej: Reunion de Seguimiento"
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Descripcion */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Descripcion</label>
            <textarea
              rows={3}
              placeholder="Detalles de la reunion..."
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Fecha y Hora */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha *</label>
              <input
                type="date"
                required
                value={formData.fecha}
                onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Hora *</label>
              <input
                type="time"
                required
                value={formData.hora}
                onChange={(e) => setFormData({ ...formData, hora: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
          </div>

          {/* Duracion */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Duracion (minutos)</label>
            <select
              value={formData.duracion_minutos}
              onChange={(e) => setFormData({ ...formData, duracion_minutos: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="30">30 minutos</option>
              <option value="60">1 hora</option>
              <option value="90">1.5 horas</option>
              <option value="120">2 horas</option>
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo de reunion *</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "presencial", icon: MapPin, color: "purple", label: "Presencial" },
                { key: "virtual", icon: Video, color: "blue", label: "Virtual" },
                { key: "llamada", icon: Phone, color: "green", label: "Llamada" },
              ].map(({ key, icon: Icon, color, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormData({ ...formData, tipo: key })}
                  disabled={loading}
                  className={`p-4 border-2 rounded-lg flex flex-col items-center gap-2 transition-all ${
                    formData.tipo === key
                      ? `border-${color}-500 bg-${color}-50`
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Icon className={`w-6 h-6 text-${color}-600`} />
                  <span className="text-sm font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ubicacion */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {formData.tipo === "presencial"
                ? "Ubicacion"
                : formData.tipo === "virtual"
                ? "Link de reunion"
                : "Telefono"}
            </label>
            <input
              type="text"
              placeholder={
                formData.tipo === "presencial"
                  ? "Ej: Oficina GreyBark"
                  : formData.tipo === "virtual"
                  ? "Ej: https://meet.google.com/..."
                  : "Ej: +56 9 1234 5678"
              }
              value={formData.ubicacion}
              onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 text-slate-700 font-semibold hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {loading
                ? (isEditing ? "Guardando..." : "Creando...")
                : success
                ? "Listo"
                : (isEditing ? "Guardar Cambios" : "Crear Reunion")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
