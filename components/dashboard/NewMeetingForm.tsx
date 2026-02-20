"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Clock, MapPin, Video, Phone, User, X } from "lucide-react";

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
}

interface NewMeetingFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewMeetingForm({ onClose, onSuccess }: NewMeetingFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    client_id: "",
    titulo: "",
    descripcion: "",
    fecha: "",
    hora: "",
    duracion_minutos: "60",
    tipo: "presencial",
    ubicacion: "",
  });

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
      // Error silencioso - selector de clientes quedará vacío
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      // Combinar fecha y hora
      const fechaHora = `${formData.fecha}T${formData.hora}:00`;

      const payload = {
        client_id: formData.client_id,
        titulo: formData.titulo,
        descripcion: formData.descripcion || null,
        fecha: fechaHora,
        duracion_minutos: parseInt(formData.duracion_minutos),
        tipo: formData.tipo,
        ubicacion: formData.ubicacion || null,
      };

      const res = await fetch("/api/advisor/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1000);
      } else {
        setError(data.error || "Error al crear reunión");
      }
    } catch {
      setError("Error al crear reunión");
    } finally {
      setLoading(false);
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case "virtual":
        return <Video className="w-4 h-4" />;
      case "llamada":
        return <Phone className="w-4 h-4" />;
      default:
        return <MapPin className="w-4 h-4" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Nueva Reunión</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Mensaje de error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <p className="font-bold">Error:</p>
              <p>{error}</p>
              <p className="text-xs mt-2">Revisa la consola (F12) para más detalles.</p>
            </div>
          )}

          {/* Mensaje de éxito */}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              <p className="font-bold">✅ Reunión creada exitosamente</p>
              <p>Cerrando modal y recargando calendario...</p>
            </div>
          )}

          {/* Cliente */}
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

          {/* Título */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Título *
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Reunión de Seguimiento"
              value={formData.titulo}
              onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Descripción
            </label>
            <textarea
              rows={3}
              placeholder="Detalles de la reunión..."
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Fecha y Hora */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Fecha *
              </label>
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
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Hora *
              </label>
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

          {/* Duración */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Duración (minutos)
            </label>
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
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Tipo de reunión *
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, tipo: "presencial" })}
                disabled={loading}
                className={`p-4 border-2 rounded-lg flex flex-col items-center gap-2 transition-all ${
                  formData.tipo === "presencial"
                    ? "border-purple-500 bg-purple-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <MapPin className="w-6 h-6 text-purple-600" />
                <span className="text-sm font-semibold">Presencial</span>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, tipo: "virtual" })}
                disabled={loading}
                className={`p-4 border-2 rounded-lg flex flex-col items-center gap-2 transition-all ${
                  formData.tipo === "virtual"
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <Video className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-semibold">Virtual</span>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, tipo: "llamada" })}
                disabled={loading}
                className={`p-4 border-2 rounded-lg flex flex-col items-center gap-2 transition-all ${
                  formData.tipo === "llamada"
                    ? "border-green-500 bg-green-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <Phone className="w-6 h-6 text-green-600" />
                <span className="text-sm font-semibold">Llamada</span>
              </button>
            </div>
          </div>

          {/* Ubicación */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {formData.tipo === "presencial"
                ? "Ubicación"
                : formData.tipo === "virtual"
                ? "Link de reunión"
                : "Teléfono"}
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
              {loading ? "Creando..." : success ? "✓ Creada" : "Crear Reunión"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
