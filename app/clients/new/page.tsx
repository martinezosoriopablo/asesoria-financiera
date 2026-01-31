"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  DollarSign,
  Shield,
  Target,
  Calendar,
  Save,
  Loader,
} from "lucide-react";

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    rut: "",
    patrimonio_estimado: "",
    ingreso_mensual: "",
    objetivo_inversion: "",
    horizonte_temporal: "largo_plazo",
    perfil_riesgo: "",
    puntaje_riesgo: "",
    tolerancia_perdida: "",
    notas: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Preparar datos para enviar
      const dataToSend: any = {
        nombre: formData.nombre,
        apellido: formData.apellido,
        email: formData.email,
        status: "prospecto",
      };

      // Agregar campos opcionales solo si tienen valor
      if (formData.telefono) dataToSend.telefono = formData.telefono;
      if (formData.rut) dataToSend.rut = formData.rut;
      if (formData.patrimonio_estimado) dataToSend.patrimonio_estimado = parseFloat(formData.patrimonio_estimado);
      if (formData.ingreso_mensual) dataToSend.ingreso_mensual = parseFloat(formData.ingreso_mensual);
      if (formData.objetivo_inversion) dataToSend.objetivo_inversion = formData.objetivo_inversion;
      if (formData.horizonte_temporal) dataToSend.horizonte_temporal = formData.horizonte_temporal;
      if (formData.perfil_riesgo) dataToSend.perfil_riesgo = formData.perfil_riesgo;
      if (formData.puntaje_riesgo) dataToSend.puntaje_riesgo = parseInt(formData.puntaje_riesgo);
      if (formData.tolerancia_perdida) dataToSend.tolerancia_perdida = parseFloat(formData.tolerancia_perdida);
      if (formData.notas) dataToSend.notas = formData.notas;

      const response = await fetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSend),
      });

      const data = await response.json();

      if (data.success) {
        // Redirigir al detalle del cliente creado
        router.push(`/clients/${data.client.id}`);
      } else {
        setError(data.error || "Error al crear cliente");
      }
    } catch (err: any) {
      setError(err.message || "Error al crear cliente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/clients"
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Volver a Clientes</span>
          </Link>

          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <User className="w-8 h-8 text-blue-600" />
            Nuevo Cliente
          </h1>
          <p className="text-slate-600 mt-1">
            Completa la información del nuevo cliente
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md p-8">
          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Información Personal */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              Información Personal
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nombre *
                </label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Juan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Apellido *
                </label>
                <input
                  type="text"
                  name="apellido"
                  value={formData.apellido}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Pérez"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="juan.perez@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Teléfono
                </label>
                <input
                  type="tel"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="+56912345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  RUT
                </label>
                <input
                  type="text"
                  name="rut"
                  value={formData.rut}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="12.345.678-9"
                />
              </div>
            </div>
          </div>

          {/* Información Financiera */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Información Financiera
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Patrimonio Estimado (CLP)
                </label>
                <input
                  type="number"
                  name="patrimonio_estimado"
                  value={formData.patrimonio_estimado}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="50000000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Ingreso Mensual (CLP)
                </label>
                <input
                  type="number"
                  name="ingreso_mensual"
                  value={formData.ingreso_mensual}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="3000000"
                />
              </div>
            </div>
          </div>

          {/* Perfil de Inversión */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              Perfil de Inversión
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Objetivo de Inversión
                </label>
                <input
                  type="text"
                  name="objetivo_inversion"
                  value={formData.objetivo_inversion}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Crecimiento moderado"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Horizonte Temporal
                </label>
                <select
                  name="horizonte_temporal"
                  value={formData.horizonte_temporal}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="corto_plazo">Corto Plazo (1-3 años)</option>
                  <option value="mediano_plazo">Mediano Plazo (3-7 años)</option>
                  <option value="largo_plazo">Largo Plazo (7+ años)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Perfil de Riesgo */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-600" />
              Perfil de Riesgo
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Clasificación
                </label>
                <select
                  name="perfil_riesgo"
                  value={formData.perfil_riesgo}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Seleccionar...</option>
                  <option value="conservador">Conservador</option>
                  <option value="moderado">Moderado</option>
                  <option value="agresivo">Agresivo</option>
                  <option value="muy_agresivo">Muy Agresivo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Puntaje (0-100)
                </label>
                <input
                  type="number"
                  name="puntaje_riesgo"
                  value={formData.puntaje_riesgo}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tolerancia Pérdida (%)
                </label>
                <input
                  type="number"
                  name="tolerancia_perdida"
                  value={formData.tolerancia_perdida}
                  onChange={handleChange}
                  step="0.1"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="10.0"
                />
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Notas Adicionales
            </label>
            <textarea
              name="notas"
              value={formData.notas}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Información adicional sobre el cliente..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar Cliente
                </>
              )}
            </button>
            <Link
              href="/clients"
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </Link>
          </div>

          <p className="text-sm text-slate-500 mt-4 text-center">
            * Campos obligatorios
          </p>
        </form>
      </div>
    </div>
  );
}
