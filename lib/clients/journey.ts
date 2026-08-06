// Deriva los 5 hitos del "journey" del cliente y su estado desde el objeto client
// ya cargado por useClientData. Función pura (today inyectable) — sin queries.

export type JourneyStatus = "done" | "current" | "pending";
export type JourneyKey = "datos" | "perfil" | "cartola" | "recomendacion" | "seguimiento";

export interface JourneyStep {
  key: JourneyKey;
  label: string;
  status: JourneyStatus;
  detail: string;
  href: string;
  warn?: boolean;
}

export interface JourneyClient {
  id: string;
  email: string | null;
  perfil_riesgo: string | null;
  puntaje_riesgo: number | null;
  tiene_portfolio: boolean | null;
  cartera_recomendada: unknown;
  next_questionnaire_date: string | null;
}

// La cartera recomendada puede venir como array o como { cartera: [...] }; se
// considera "hecha" solo si tiene al menos una posición.
function carteraTieneContenido(cr: unknown): boolean {
  if (!cr) return false;
  if (Array.isArray(cr)) return cr.length > 0;
  if (typeof cr === "object") {
    const arr = (cr as { cartera?: unknown }).cartera;
    return Array.isArray(arr) && arr.length > 0;
  }
  return false;
}

export function computeJourneySteps(c: JourneyClient, today: Date): JourneyStep[] {
  const datosOk = !!c.email;
  const perfilOk = !!c.perfil_riesgo && (c.puntaje_riesgo ?? 0) > 0;
  const cartolaOk = c.tiene_portfolio === true;
  const recomOk = carteraTieneContenido(c.cartera_recomendada);
  const seguimientoOk = cartolaOk && recomOk;

  const perfilWarn =
    perfilOk && !!c.next_questionnaire_date && new Date(c.next_questionnaire_date) <= today;

  const email = encodeURIComponent(c.email ?? "");
  const rows: Array<Omit<JourneyStep, "status"> & { done: boolean }> = [
    { key: "datos", label: "Datos", done: datosOk,
      detail: datosOk ? "completado" : "faltan datos", href: `/clients/${c.id}` },
    { key: "perfil", label: "Perfil de Riesgo", done: perfilOk,
      detail: perfilOk ? `${c.perfil_riesgo} · ${c.puntaje_riesgo}` : "pendiente",
      href: `/analisis-cartola?client=${email}`, warn: perfilWarn },
    { key: "cartola", label: "Cartola", done: cartolaOk,
      detail: cartolaOk ? "cargada" : "pendiente", href: `/clients/${c.id}/seguimiento` },
    { key: "recomendacion", label: "Recomendación", done: recomOk,
      detail: recomOk ? "guardada" : "pendiente", href: `/recomendacion/${c.id}` },
    { key: "seguimiento", label: "Seguimiento", done: seguimientoOk,
      detail: seguimientoOk ? "en curso" : "pendiente", href: `/clients/${c.id}/seguimiento` },
  ];

  // "current" = primer hito no-hecho, excluyendo Seguimiento (es continuo, nunca bloquea).
  const currentIdx = rows.findIndex((r) => !r.done && r.key !== "seguimiento");

  return rows.map((r, i) => {
    const { done, ...rest } = r;
    const status: JourneyStatus = done ? "done" : i === currentIdx ? "current" : "pending";
    return { ...rest, status };
  });
}
