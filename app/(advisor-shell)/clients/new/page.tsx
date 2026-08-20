"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import PageContainer from "@/components/shared/PageContainer";
import PageHeader from "@/components/shared/PageHeader";
import Card from "@/components/shared/Card";
import Button from "@/components/shared/Button";
import Input from "@/components/shared/Input";
import {
  ArrowLeft,
  User,
  DollarSign,
  Shield,
  Target,
  Save,
  Loader,
} from "lucide-react";

// --- Validation helpers ---

function validateRut(rut: string): string | null {
  if (!rut) return null; // optional field
  // Strip dots and spaces, normalize
  const cleaned = rut.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
  // Must match XXXXXXXX-X or XXXXXXX-X (7-8 digits, dash, check char)
  if (!/^\d{7,8}-[\dK]$/.test(cleaned)) {
    return "Formato de RUT inválido. Use XX.XXX.XXX-X o XXXXXXXX-X";
  }
  const body = cleaned.slice(0, -2); // digits before dash
  const providedDv = cleaned.slice(-1); // check digit after dash
  // Modulo 11 algorithm
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  const expectedDv = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  if (providedDv !== expectedDv) {
    return "Dígito verificador del RUT incorrecto";
  }
  return null;
}

function validatePhone(phone: string): string | null {
  if (!phone) return null; // optional field
  // Strip all non-digit characters except leading +
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 9) {
    return "El teléfono debe tener al menos 9 dígitos";
  }
  // Accept +56XXXXXXXXX or 56XXXXXXXXX or 9XXXXXXXX patterns
  if (!/^(\+?56\s*)?[29]\d{8}$/.test(phone.replace(/[\s\-().]/g, ""))) {
    return "Formato de teléfono inválido. Use +56 9 XXXX XXXX";
  }
  return null;
}

function validatePositiveNumber(value: string, fieldName: string): string | null {
  if (!value) return null; // optional field
  const num = parseFloat(value);
  if (isNaN(num) || num < 0) {
    return `${fieldName} debe ser un número positivo`;
  }
  return null;
}

function validateFechaNacimiento(fecha: string): string | null {
  if (!fecha) return null; // optional field
  const birthDate = new Date(fecha);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (birthDate >= today) {
    return "La fecha de nacimiento debe ser en el pasado";
  }
  // Check at least 18 years old
  const eighteenYearsAgo = new Date(today);
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
  if (birthDate > eighteenYearsAgo) {
    return "El cliente debe tener al menos 18 años";
  }
  return null;
}

type FieldErrors = Partial<Record<string, string>>;

// --- Component ---

export default function NewClientPage() {
  const router = useRouter();
  const { advisor, loading: authLoading } = useAdvisor();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    rut: "",
    fecha_nacimiento: "",
    patrimonio_estimado: "",
    ingreso_mensual: "",
    objetivo_inversion: "",
    horizonte_temporal: "largo_plazo",
    perfil_riesgo: "",
    puntaje_riesgo: "",
    tolerancia_perdida: "",
    notas: "",
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    // Clear field error when user edits the field
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validateForm = (): FieldErrors => {
    const errors: FieldErrors = {};
    const rutErr = validateRut(formData.rut);
    if (rutErr) errors.rut = rutErr;
    const phoneErr = validatePhone(formData.telefono);
    if (phoneErr) errors.telefono = phoneErr;
    const patrimonioErr = validatePositiveNumber(formData.patrimonio_estimado, "Patrimonio estimado");
    if (patrimonioErr) errors.patrimonio_estimado = patrimonioErr;
    const ingresoErr = validatePositiveNumber(formData.ingreso_mensual, "Ingreso mensual");
    if (ingresoErr) errors.ingreso_mensual = ingresoErr;
    const toleranciaErr = validatePositiveNumber(formData.tolerancia_perdida, "Tolerancia pérdida");
    if (toleranciaErr) errors.tolerancia_perdida = toleranciaErr;
    const fechaErr = validateFechaNacimiento(formData.fecha_nacimiento);
    if (fechaErr) errors.fecha_nacimiento = fechaErr;
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Run validation
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      // Preparar datos para enviar
      const dataToSend: Record<string, string | number> = {
        nombre: formData.nombre,
        apellido: formData.apellido,
        email: formData.email,
        status: "prospecto",
      };

      // Agregar campos opcionales solo si tienen valor
      if (formData.telefono) dataToSend.telefono = formData.telefono;
      if (formData.rut) dataToSend.rut = formData.rut;
      if (formData.fecha_nacimiento) dataToSend.fecha_nacimiento = formData.fecha_nacimiento;
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear cliente");
    } finally {
      setLoading(false);
    }
  };

  const selectClassName =
    "w-full border border-gb-border rounded-[3px] px-3 py-2.5 text-sm text-gb-black bg-white focus:border-gb-primary focus:outline-none focus:ring-1 focus:ring-gb-primary/30 transition-colors";
  const errorInputClassName = (hasError: boolean) =>
    `w-full border rounded-[3px] px-3 py-2.5 text-sm text-gb-black bg-white placeholder:text-gb-gray/60 focus:outline-none focus:ring-1 focus:ring-gb-primary/30 transition-colors ${hasError ? "border-gb-danger bg-gb-danger/5 focus:border-gb-danger" : "border-gb-border focus:border-gb-primary"}`;

  return (
    <PageContainer>
      <Link
        href="/clients"
        className="flex items-center gap-2 text-gb-gray hover:text-gb-black transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Volver a Clientes</span>
      </Link>

      <PageHeader
        title="Nuevo Cliente"
        subtitle="Completa la información del nuevo cliente"
      />

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-gb-danger/10 border border-gb-danger/30 rounded-md p-4">
              <p className="text-gb-danger text-sm">{error}</p>
            </div>
          )}

          {/* Información Personal */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gb-black mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-gb-primary" />
              Información Personal
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                required
                label="Nombre *"
                placeholder="Juan"
              />
              <Input
                type="text"
                name="apellido"
                value={formData.apellido}
                onChange={handleChange}
                required
                label="Apellido *"
                placeholder="Pérez"
              />
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                label="Email *"
                placeholder="juan.perez@email.com"
              />
              <div>
                <label className="block text-sm font-medium text-gb-black mb-2">
                  Teléfono
                </label>
                <input
                  type="tel"
                  name="telefono"
                  value={formData.telefono}
                  onChange={handleChange}
                  className={errorInputClassName(!!fieldErrors.telefono)}
                  placeholder="+56912345678"
                />
                {fieldErrors.telefono && (
                  <p className="mt-1 text-sm text-gb-danger">{fieldErrors.telefono}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gb-black mb-2">
                  RUT
                </label>
                <input
                  type="text"
                  name="rut"
                  value={formData.rut}
                  onChange={handleChange}
                  className={errorInputClassName(!!fieldErrors.rut)}
                  placeholder="12.345.678-9"
                />
                {fieldErrors.rut && (
                  <p className="mt-1 text-sm text-gb-danger">{fieldErrors.rut}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gb-black mb-2">
                  Fecha de Nacimiento
                </label>
                <input
                  type="date"
                  name="fecha_nacimiento"
                  value={formData.fecha_nacimiento}
                  onChange={handleChange}
                  className={errorInputClassName(!!fieldErrors.fecha_nacimiento)}
                />
                {fieldErrors.fecha_nacimiento && (
                  <p className="mt-1 text-sm text-gb-danger">{fieldErrors.fecha_nacimiento}</p>
                )}
              </div>
            </div>
          </div>

          {/* Información Financiera */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gb-black mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gb-primary" />
              Información Financiera
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gb-black mb-2">
                  Patrimonio Estimado (CLP)
                </label>
                <input
                  type="number"
                  name="patrimonio_estimado"
                  value={formData.patrimonio_estimado}
                  onChange={handleChange}
                  className={errorInputClassName(!!fieldErrors.patrimonio_estimado)}
                  placeholder="50000000"
                />
                {fieldErrors.patrimonio_estimado && (
                  <p className="mt-1 text-sm text-gb-danger">{fieldErrors.patrimonio_estimado}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gb-black mb-2">
                  Ingreso Mensual (CLP)
                </label>
                <input
                  type="number"
                  name="ingreso_mensual"
                  value={formData.ingreso_mensual}
                  onChange={handleChange}
                  className={errorInputClassName(!!fieldErrors.ingreso_mensual)}
                  placeholder="3000000"
                />
                {fieldErrors.ingreso_mensual && (
                  <p className="mt-1 text-sm text-gb-danger">{fieldErrors.ingreso_mensual}</p>
                )}
              </div>
            </div>
          </div>

          {/* Perfil de Inversión */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gb-black mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-gb-primary" />
              Perfil de Inversión
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                type="text"
                name="objetivo_inversion"
                value={formData.objetivo_inversion}
                onChange={handleChange}
                label="Objetivo de Inversión"
                placeholder="Crecimiento moderado"
              />
              <div>
                <label className="block text-sm font-medium text-gb-black mb-2">
                  Horizonte Temporal
                </label>
                <select
                  name="horizonte_temporal"
                  value={formData.horizonte_temporal}
                  onChange={handleChange}
                  className={selectClassName}
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
            <h2 className="text-xl font-bold text-gb-black mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-gb-primary" />
              Perfil de Riesgo
              <span className="text-xs font-normal text-gb-warning bg-gb-warning/10 px-2 py-0.5 rounded-full">estimado</span>
            </h2>
            <p className="text-xs text-gb-gray -mt-2 mb-4">
              Estimacion inicial. Se actualizara automaticamente cuando el cliente complete el cuestionario.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gb-black mb-2">
                  Clasificación
                </label>
                <select
                  name="perfil_riesgo"
                  value={formData.perfil_riesgo}
                  onChange={handleChange}
                  className={selectClassName}
                >
                  <option value="">Seleccionar...</option>
                  <option value="defensivo">Defensivo</option>
                  <option value="conservador">Conservador</option>
                  <option value="moderado">Moderado</option>
                  <option value="agresivo">Agresivo</option>
                  <option value="muy_agresivo">Muy Agresivo</option>
                </select>
              </div>
              <Input
                type="number"
                name="puntaje_riesgo"
                value={formData.puntaje_riesgo}
                onChange={handleChange}
                min="0"
                max="100"
                label="Puntaje (0-100)"
                placeholder="50"
              />
              <div>
                <label className="block text-sm font-medium text-gb-black mb-2">
                  Tolerancia Pérdida (%)
                </label>
                <input
                  type="number"
                  name="tolerancia_perdida"
                  value={formData.tolerancia_perdida}
                  onChange={handleChange}
                  step="0.1"
                  className={errorInputClassName(!!fieldErrors.tolerancia_perdida)}
                  placeholder="10.0"
                />
                {fieldErrors.tolerancia_perdida && (
                  <p className="mt-1 text-sm text-gb-danger">{fieldErrors.tolerancia_perdida}</p>
                )}
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gb-black mb-2">
              Notas Adicionales
            </label>
            <textarea
              name="notas"
              value={formData.notas}
              onChange={handleChange}
              rows={4}
              className={selectClassName}
              placeholder="Información adicional sobre el cliente..."
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-4">
            <Button type="submit" disabled={loading} className="flex-1">
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
            </Button>
            <Link
              href="/clients"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-[3px] px-5 py-2.5 text-sm font-semibold bg-transparent text-gb-info border border-gb-border hover:bg-gb-light transition-colors"
            >
              Cancelar
            </Link>
          </div>

          <p className="text-sm text-gb-gray mt-4 text-center">
            * Campos obligatorios
          </p>
        </Card>
      </form>
    </PageContainer>
  );
}
