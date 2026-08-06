# Journey stepper de la ficha del cliente (Fase 2 auditoría UX)

**Fecha:** 2026-08-05 · **Alcance:** chico/mediano. Frontend (un componente + una función pura + integración), sin cambios de backend/DB.
**Origen:** `docs/auditoria-plataforma-2026-08.md` §2 (Foco A). Rama `fase2-journey-stepper` (sobre `fase1-ux-links-rotos`).

## Objetivo

Convertir la ficha del cliente (`/clients/[id]`) en un **journey guiado**: un stepper horizontal arriba de la ficha con 5 hitos, cada uno con su estado (hecho / actual / pendiente) derivado del cliente, y un botón **"Continuar →"** que lleva al primer hito pendiente ya scopeado al cliente. Reemplaza el patrón "hub-and-spoke sin guía".

## Decisiones tomadas (brainstorming)

- **5 hitos** (Radiografía NO es hito; queda dentro del CTA de Recomendación): **Datos → Perfil de Riesgo → Cartola → Recomendación → Seguimiento**.
- **Forma:** stepper **horizontal** (banner) arriba de la ficha, con "Continuar →".
- **Adelgazar** la tarjeta "Acciones" a "Más herramientas" (solo lo que NO es journey).
- **Sin queries nuevas:** todo el estado se deriva del objeto `client` que ya carga `useClientData` (`components/clients/hooks/useClientData.ts`).

## Diseño

### 1. Lógica de estado — función pura `computeJourneySteps`

`lib/clients/journey.ts`:

```ts
export type JourneyStatus = "done" | "current" | "pending";
export interface JourneyStep {
  key: "datos" | "perfil" | "cartola" | "recomendacion" | "seguimiento";
  label: string;
  status: JourneyStatus;
  detail: string;        // texto corto de estado ("cargada", "Moderado · 62", "pendiente")
  href: string;          // destino del CTA, scopeado al cliente
  warn?: boolean;        // ej. perfil por renovar
}

export interface JourneyClient {
  id: string;
  email: string | null;
  perfil_riesgo: string | null;
  puntaje_riesgo: number | null;
  tiene_portfolio: boolean | null;
  cartera_recomendada: unknown;          // JSONB; se considera "hecho" si tiene contenido
  next_questionnaire_date: string | null;
}

export function computeJourneySteps(c: JourneyClient, today: Date): JourneyStep[];
```

**Reglas de "hecho" (done):**
1. **datos** — `!!c.email` (el nombre siempre existe al crear). detail "completado" / "faltan datos". href `/clients/${id}`.
2. **perfil** — `!!c.perfil_riesgo && (c.puntaje_riesgo ?? 0) > 0`. detail = `${perfil_riesgo} · ${puntaje_riesgo}`. `warn = true` si `next_questionnaire_date` existe y `<= today` (por renovar, pero sigue done). href `/analisis-cartola?client=${email}`.
3. **cartola** — `c.tiene_portfolio === true`. detail "cargada" / "pendiente". href `/clients/${id}/seguimiento`.
4. **recomendacion** — `carteraTieneContenido(c.cartera_recomendada)` (no null, y si es objeto `{cartera:[...]}` que el array tenga ≥1; si es array, ≥1). detail "guardada" / "pendiente". href `/recomendacion/${id}`.
5. **seguimiento** — hito **continuo**: "en curso" (done) si `tiene_portfolio && recomendacion.done`; si no, pendiente. detail "en curso" / "pendiente". href `/clients/${id}/seguimiento`.

**Estado `current`:** el **primer** paso cuyo done es false pasa a `status: "current"`; los previos `done`, los siguientes `pending`. Si todos done → ninguno es current (la UI muestra "Todo al día"). `seguimiento`, por ser continuo, se marca `done` cuando corresponde y nunca bloquea el "current" de otro paso.

Firma con `today` inyectable (no usar `new Date()` dentro) para testear el caso "por renovar".

### 2. Componente `JourneyStepper`

`components/clients/JourneyStepper.tsx` (client component):
- Recibe `client` (subset `JourneyClient`), llama `computeJourneySteps(client, new Date())`.
- Render horizontal: 5 nodos numerados con conector entre ellos; ícono por estado (✓ done, ● current, ○ pending), color por estado (done verde/gb-success, current copper/gb-primary, pending gris/gb-gray); label + `detail` bajo cada nodo; badge "por renovar" si `warn`.
- Cada nodo es un `<Link href={step.href}>` (clickable). El **botón "Continuar →"** aparte apunta al `current` (o, si todos done, muestra "Todo al día" y linkea a Seguimiento).
- Responsive: en viewport chico, colapsa a lista compacta (los 5 nodos en fila scrollable `overflow-x-auto`, sin romper el layout de la página).
- Estilo con tokens del app (`gb-*`), consistente con el resto del shell.

### 3. Integración en `ClientDetail.tsx`

- Montar `<JourneyStepper client={client} />` arriba del contenido principal (después del header de nombre/estado, antes del grid de tarjetas).
- El `client` de `useClientData` ya trae los campos; si falta alguno en el tipo, extender el `select`/tipo de `useClientData` con los campos usados (`cartera_recomendada`, `next_questionnaire_date`, `tiene_portfolio`, `puntaje_riesgo`) — verificar antes; no agregar queries, solo columnas al select existente si faltaran.

### 4. Adelgazar la tarjeta "Acciones" → "Más herramientas"

En `components/clients/ClientInfoCard.tsx`, la tarjeta "Acciones" hoy tiene: Seguimiento, Perfil/Cartola, **Recomendación** (agregado en Fase 1), Comparar, Construir Modelo, Analizar Fondos.
- **Quitar** los 4 que ya cubre el stepper: Seguimiento, Perfil/Cartola, Recomendación (y el de Seguimiento).
- **Dejar** solo las herramientas que NO son hitos del journey: **Comparar Ideal vs Actual**, **Construir Modelo**, **Analizar Fondos**.
- **Renombrar** el `<h2>` de "Acciones" a **"Más herramientas"**.
- Estos 3 links ya quedaron correctos en Fase 1 (shims con `?client`, `/fund-center`) — no se tocan sus destinos.

## Data flow

`useClientData(clientId)` → `client` → `<JourneyStepper client={client} />` → `computeJourneySteps(client, new Date())` → render. Cero llamadas nuevas a API/DB. `ClientInfoCard` sigue recibiendo `client` como hoy.

## Manejo de errores / bordes

- Cliente recién creado (sin perfil/cartola/recomendación): datos done (si email), el resto pending, `current = perfil`. "Continuar" → perfil.
- Todo completo: los 5 done, sin `current`; el botón muestra "Todo al día" → Seguimiento.
- `cartera_recomendada` presente pero vacía (`{cartera:[]}` o `[]`): se trata como **no hecho** (recomendación pendiente).
- Perfil solo estimado (`perfil_riesgo` set pero `puntaje_riesgo = 0`): **no** done (aún falta el cuestionario real) → `current = perfil`.
- `next_questionnaire_date` vencida: perfil sigue done con badge `warn`.

## Testing

- **Unit (`lib/clients/journey.test.ts`)** de `computeJourneySteps` cubriendo:
  - cliente nuevo (solo email) → current = perfil.
  - con perfil real (puntaje>0) → perfil done, current = cartola.
  - perfil solo estimado (puntaje=0) → perfil NO done.
  - con cartola → current = recomendacion.
  - con recomendación (cartera con contenido) → seguimiento done ("en curso").
  - cartera_recomendada vacía → recomendacion pending.
  - next_questionnaire_date vencida → perfil done + warn.
  - todos done → sin current.
- `tsc --noEmit` y `eslint` limpios.
- Verificación manual: abrir un cliente y confirmar el estado por hito + que "Continuar" lleva al paso correcto scopeado.

## Archivos afectados

- Crear: `lib/clients/journey.ts`, `lib/clients/journey.test.ts`, `components/clients/JourneyStepper.tsx`.
- Modificar: `components/clients/ClientDetail.tsx` (montar el stepper), `components/clients/ClientInfoCard.tsx` (adelgazar "Acciones" → "Más herramientas"), y si hiciera falta `components/clients/hooks/useClientData.ts` (agregar columnas al select existente, sin nuevas queries).

## Fuera de alcance

- Cambios de backend/DB (todo se deriva de datos ya cargados).
- Un motor de "onboarding" configurable / pasos dinámicos: los 5 hitos son fijos.
- Estado de Seguimiento más fino (nº de cartolas, drift): se aproxima con `tiene_portfolio + recomendación`; refinamiento futuro.
