# Journey guiado + alta simple + ingreso de fondos (v2.0 · Fase 1) — Design

**Fecha:** 2026-08-20
**Rama sugerida:** `feat/journey-guiado`
**Estado:** Diseño aprobado (decisiones tomadas). Pendiente review del spec → plan.

## Contexto y visión

Sub-proyecto **Fase 1** del roadmap v2.0 ([[project_v2_roadmap]]). La auditoría UX encontró que el "journey" del asesor (crear cliente → cuestionario → cartola → radiografía → recomendación → comparar) está **repartido en 4 lugares** (sidebar, dashboard, ficha, herramientas) con URLs inconsistentes, y el "Flujo de Asesoría" del dashboard (`advisor/page.tsx` `FLOW_STEPS`) es **decorativo** (no refleja progreso, linkea a páginas globales). No existe onboarding guiado.

**Restricción transversal:** los asesores NO son especialistas → **simple pero completo**. Todo se apoya en los primitivos de la Fase 0 (`components/shared/`: `PageContainer`, `PageHeader`, `Card`, `Button`, `Input`) y la paleta sobria (guard de ESLint activo).

Tres partes, decididas con el usuario:

## Parte A — Journey guiado (checklist de progreso)

**Qué:** un componente nuevo `ClientJourneyChecklist` embebido **arriba en la ficha del cliente** (`components/clients/ClientDetail.tsx`, antes de `ClientInfoCard` ~línea 542). No es un wizard modal bloqueante ni una ruta nueva — es un checklist siempre visible en el hub al que ya redirige el alta, colapsable cuando está completo. Reutiliza datos existentes; no obliga a un orden rígido (el asesor puede saltar pasos).

**5 pasos** (decidido: radiografía colapsada dentro de recomendación). Cada paso: círculo numerado + label en lenguaje llano + estado (✓ verde / pendiente / **siguiente sugerido** resaltado) + **1 CTA** que navega al MISMO cliente por id (sin re-seleccionar, sin `window.open`). Barra fina "X de 5".

| # | Paso | ✓ (done) si… | CTA(s) |
|---|------|-------------|--------|
| 1 | Datos del cliente | siempre (ya creado) | "Editar" → `ClientInfoCard`/editar |
| 2 | Perfil de riesgo | `client.perfil_riesgo` no vacío (por cuestionario **o** estimación manual) | **"Enviar cuestionario"** (o "Copiar link") + **"Estimar a mano"** (→ sección de riesgo en `ClientInfoCard`) |
| 3 | Subir cartola | `client.tiene_portfolio` (o existe snapshot no api-prices) | "Subir cartola" → Seguimiento / `AddSnapshotModal` |
| 4 | Recomendación (incl. radiografía) | `GET /api/clients/[id]/recommendations` devuelve una | "Generar propuesta" → `/recomendacion/[clientId]` |
| 5 | Comparar / aplicar | `client.cartera_recomendada` existe | "Comparar ideal vs actual" → Seguimiento (RetornosComparados) |

**Fuente de datos:** `useClientData` ya expone `perfil_riesgo`, `tiene_portfolio`, `status`, `last_questionnaire`, `next_questionnaire_date`. Falta saber si hay recomendación/cartera_recomendada: agregar dos flags booleanos al payload del cliente (`tiene_recomendacion`, `tiene_cartera_recomendada`) — computados en el GET del cliente (`app/api/clients/[id]/route.ts`) con un `count`/`exists` barato, o derivados de endpoints ya existentes en el hook. Preferir extender el payload del cliente para no hacer fetches extra en la ficha.

**Estilo:** primitivos Fase 0 (`Card` contenedor, `Button` para los CTA, navy/copper/neutros). El "siguiente sugerido" resaltado con borde/acento copper (regla de acento). Colapsable: una vez los 5 pasos ✓, el checklist se muestra plegado ("Journey completo ✓", expandible).

**Reemplaza** el bloque decorativo `FLOW_STEPS` del dashboard (`advisor/page.tsx` ~57-62 y ~436-459): en su lugar, el dashboard muestra "clientes con journey incompleto" reusando `clientes_sin_cartola` que ya se calcula (~línea 207), como lista de acceso rápido.

## Parte B — Alta de cliente más simple

Archivo: `app/(advisor-shell)/clients/new/page.tsx` (ya migrado a primitivos en Fase 0).

- **Visibles siempre:** nombre, apellido, email, teléfono (los 3 primeros ya obligatorios).
- **Colapsar** bajo un `<details>`/acordeón **"Datos avanzados (opcional)"**: RUT, fecha de nacimiento, y **la sección "Perfil de Riesgo (estimado)"** (puntaje/tolerancia). NO se elimina — decisión del usuario: muchos clientes no contestan el cuestionario y el asesor debe poder **estimar el perfil a mano**. Colapsada, no molesta al crear pero queda disponible.
- Sin cambios en la lógica de validación ni en el submit (`handleSubmit`, `validateForm`, `validateRut`, POST a `/api/clients`). Solo cambia qué se muestra plegado.
- Tras crear (redirect a `/clients/[id]`, ya existente), el `ClientJourneyChecklist` (Parte A) le dice el siguiente paso — resuelve el "cliente huérfano sin saber qué hacer" que notó la auditoría.

## Parte C — Ingreso de fondos más intuitivo

Archivo: `app/(advisor-shell)/advisor/fondos/page.tsx` + API `app/api/advisor/preferred-funds/route.ts`.

1. **Custodio sin default silencioso.** Hoy el selector de custodio se guarda como `'agf'` aunque el asesor nunca lo toque (POST default `custodian_type: custodian_type || "agf"`, y el `<select>` muestra "agf" por defecto) → clasificación incorrecta silenciosa (fue causa de bugs en la demo). Cambio: al AGREGAR un fondo, `custodian_type` empieza **sin elegir** ("— elegir custodio —", valor vacío); el fondo se agrega pero queda marcado visualmente como "custodio pendiente" hasta que el asesor lo fije. El POST NO fuerza 'agf' si viene vacío (guarda `null`); la UI resalta los fondos con custodio pendiente.
2. **Sugerir categoría desde la ficha CMF.** Al agregar un fondo cuya ficha (`fund_fichas`/`fi_fichas`) trae `objetivo`/`horizonte`/`familia_estudios`, pre-sugerir la `category` (dropdown de 18 opciones en `FUND_CATEGORIES`) con un mapeo simple familia→categoría; el asesor solo confirma. Si no hay ficha, queda como está (elegir a mano).
3. **Filtros de búsqueda.** En el buscador de fondos (`handleSearch`, hoy FM+FI por nombre/RUN), agregar chips de filtro rápido: **tipo (FM / FI)** y opcional **por AGF**. Es filtrado client-side sobre `searchResults` (no cambia los endpoints `lookup`).
4. Mover el info-box "esto alimenta la IA" (hoy al fondo de la página, ~548-554) a arriba, junto al botón Agregar, para que el asesor entienda el "para qué" de clasificar.

## Componentes / archivos

**Crear:**
- `components/clients/ClientJourneyChecklist.tsx` (Parte A) — presentacional, recibe el `client` + flags; usa `Card`/`Button`.
- Test: `components/clients/ClientJourneyChecklist.test.tsx` (lógica pura de "qué paso está done/next" extraída a una función testeada, ej. `computeJourneySteps(client) → Step[]`).

**Modificar:**
- `components/clients/ClientDetail.tsx` (montar el checklist).
- `app/api/clients/[id]/route.ts` (o el hook `useClientData`) — agregar flags `tiene_recomendacion` / `tiene_cartera_recomendada`.
- `app/(advisor-shell)/advisor/page.tsx` (reemplazar `FLOW_STEPS` decorativo por lista de journey incompleto).
- `app/(advisor-shell)/clients/new/page.tsx` (colapsar avanzados).
- `app/(advisor-shell)/advisor/fondos/page.tsx` (custodio pendiente, sugerir categoría, filtros, mover info-box).
- `app/api/advisor/preferred-funds/route.ts` (no forzar 'agf' si viene vacío).

## Reuso (no reimplementar)

- Primitivos Fase 0 (`components/shared/*`).
- `useClientData` (`components/clients/hooks/useClientData.ts`) — ya trae los flags base.
- La lógica de estimación de riesgo y el `<select>` de `perfil_riesgo` en `ClientInfoCard` (Parte A paso 2 "Estimar a mano" apunta ahí).
- `FUND_CATEGORIES` y el flujo de búsqueda existentes en `advisor/fondos/page.tsx`; fichas en `fund_fichas`/`fi_fichas`.
- `clientes_sin_cartola` del dashboard.

## Fuera de alcance

- Fases 2-4 (fees/ubicación, patrimonio+APV, PII).
- Un motor de wizard genérico (el checklist NO es un wizard bloqueante).
- Cambios en los endpoints de búsqueda de fondos (`lookup`) — los filtros son client-side.
- Buscador de ETFs internacionales (se decidió: internacional usa ETF del comité auto).

## Testing

- **Lógica pura:** `computeJourneySteps(client)` (qué pasos done/next dado el estado del cliente) — testeada con Vitest (`renderToStaticMarkup` para el componente, y tests unitarios para la función). Casos: cliente recién creado (solo paso 1), con perfil (1-2), con cartola (1-3), etc.
- **Sugerencia de categoría:** mapeo familia→categoría como función pura testeada.
- **Migración/UI:** verificación manual — crear cliente → ver checklist con el siguiente paso resaltado → completar pasos y ver el progreso; alta con avanzados colapsados; agregar fondo sin custodio → marcado pendiente; búsqueda con filtros.
- `tsc` 0; `npm run lint` con el guard de paleta; suite sin regresiones.

## Criterios de éxito

1. En la ficha de cualquier cliente aparece el `ClientJourneyChecklist` con 5 pasos, cada uno con estado correcto leído de datos reales y 1 CTA que navega al mismo cliente.
2. El paso 2 se marca ✓ tanto si el perfil vino del cuestionario como si se estimó a mano; ofrece ambos CTAs.
3. El dashboard ya no muestra el `FLOW_STEPS` decorativo; muestra clientes con journey incompleto.
4. El alta muestra solo nombre/apellido/email/teléfono; RUT/fecha/riesgo bajo "Datos avanzados (opcional)"; misma validación y submit.
5. Al agregar un fondo preferido sin elegir custodio, queda marcado "custodio pendiente" (no 'agf' silencioso); la categoría se pre-sugiere desde la ficha CMF cuando existe; la búsqueda tiene filtros FM/FI.
6. Todo sobrio/consistente con los primitivos Fase 0; `tsc` 0, lint y suite verdes.
