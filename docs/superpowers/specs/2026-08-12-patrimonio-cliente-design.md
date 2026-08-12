# Patrimonio del cliente — Modelo de datos + captura (Sub-proyecto A)

**Fecha:** 2026-08-12
**Rama:** `feat/patrimonio-cliente`
**Estado:** Diseño aprobado (esquema + UI). Pendiente review del spec → plan de implementación.

## Contexto y visión

Este es el **sub-proyecto A** de una iniciativa mayor en tres partes:

- **A. Modelo de datos del patrimonio del cliente** (este spec) — estructurar y capturar seguros, inmuebles y activos financieros del cliente en el lado asesor.
- **B. Página espejo — resumen de patrimonio y flujos** — vista que ve el cliente en el portal, espejada para el asesor; estimador de patrimonio neto y de flujo mensual "hoy", en UF/CLP/USD.
- **C. Simulador de jubilación y flujos de vida** — proyección a lo largo de la vida (jubilación a los 65: AFP renta vitalicia vs retiro programado, payout APV, flujo neto de arriendos, valor de la casa). **Reemplaza al actual simulador/calculadora de APV** (`app/(advisor-shell)/calculadora-apv/`, `lib/tax/apv.ts`).

El orden es A → B → C: el simulador no puede existir sin el modelo de datos, y la página espejo es la vista "hoy" del mismo modelo. Cada sub-proyecto tiene su propio ciclo spec → plan → implementación. **B y C quedan fuera del alcance de este spec.**

### Estado actual (lo que hoy existe)

- El único registro de "servicios" del cliente es delgado: `clients.servicios_adicionales` (JSONB) con flags `seguros`/`asesoria_tributaria`/`asesoria_inmobiliaria` + texto libre. Se edita en `components/clients/` (modal) y se muestra en el portal en `app/(portal)/portal/mis-servicios/page.tsx`.
- La plataforma **ya** trackea el portafolio de inversiones del cliente (portfolios, snapshots, seguimiento). Ese valor NO se re-digita aquí.
- Conversión de moneda existente: `lib/portfolio/currency.ts` (`toCLP`, `fromCLP`, `ExchangeRates`), TC observado + valor UF (fuente BCCH) que la plataforma ya obtiene.

## Decisiones de diseño (aprobadas)

1. **Inversiones = híbrido.** El valor del portafolio de fondos/acciones/ETF se toma **automático** del sistema de seguimiento (una sola fuente de verdad, no se re-digita). Solo se ingresan a mano APV, saldo AFP y ahorro periódico, que viven fuera del portafolio trackeado.
2. **Captura = sección "Patrimonio" en la ficha del cliente** (`app/(advisor-shell)/clients/[id]`), no un modal ni una página aparte. Convive con lo que ya se edita en la ficha.
3. **Moneda por campo.** Cada monto se guarda con SU moneda de origen (depto en UF, prima en CLP, etc.). El panel convierte a UF/CLP/USD al mostrar. Convención: par de columnas `*_monto numeric` + `*_moneda text CHECK IN ('CLP','UF','USD')`.
4. **Almacenamiento = tablas dedicadas** (no JSONB, no EAV). Filas relacionales con columnas tipadas que el simulador C consume directo para sumar saldos y flujos con precisión.
5. **Estructura UI = acordeón** de 3 grupos (Seguros / Inmuebles / Activos financieros), cada ítem se abre/cierra inline, tarjetas agregables.

### Frontera A ↔ C

A guarda el **estado actual + estimaciones de hoy** (valor de venta estimado hoy, saldo AFP hoy, dividendo actual). Toda la **proyección en el tiempo** (crecimiento a 65 años, jubilación, renta vitalicia vs retiro programado, payout del APV) es responsabilidad de C.

## Modelo de datos — 3 tablas

Todas con: `id uuid PK default gen_random_uuid()`, `client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE`, `created_by uuid REFERENCES advisors(id)`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`. Convención de moneda: `*_moneda text CHECK (… IN ('CLP','UF','USD'))`.

### `client_seguros` — una fila por póliza

| Columna | Tipo | Notas |
|---|---|---|
| `tipo` | text CHECK IN (`vida`,`salud`,`vida_con_ahorro`,`otros`) | |
| `compania` | text | compañía aseguradora |
| `numero_poliza` | text | |
| `prima_monto` / `prima_moneda` | numeric / text | |
| `prima_periodicidad` | text CHECK IN (`mensual`,`anual`) default `mensual` | |
| `cobertura_monto` / `cobertura_moneda` | numeric / text | monto asegurado |
| `cobertura_desc` | text | qué cubre |
| `beneficiarios` | text | |
| `devuelve_prima` | boolean default false | seguro de vida con devolución al final del periodo |
| `devolucion_pct` | numeric default 100 | % de prima que devuelve |
| `fecha_inicio` | date | |
| `fecha_termino` | date | fin del periodo (timing de la devolución) |
| `componente_ahorro_monto` / `_moneda` | numeric / text (null) | saldo de ahorro para `vida_con_ahorro` |
| `notas` | text | |

### `client_inmuebles` — una fila por propiedad

| Columna | Tipo | Notas |
|---|---|---|
| `tipo` | text CHECK IN (`inversion`,`habitacion`) | `inversion` = arrienda; `habitacion` = vive en ella |
| `etiqueta` | text | nombre corto |
| `ubicacion` | text | comuna / dirección |
| `valor_compra_monto` / `_moneda` | numeric / text | |
| `fecha_compra` | date | |
| `valor_estimado_venta_monto` / `_moneda` | numeric / text | estimación **de hoy** |
| `tiene_credito` | boolean default false | crédito hipotecario asociado (1:1, embebido) |
| `credito_saldo_monto` / `_moneda` | numeric / text | saldo actual |
| `credito_tasa_anual` | numeric | % anual |
| `credito_plazo_meses_restantes` | int | |
| `credito_cuota_monto` / `_moneda` | numeric / text | dividendo mensual |
| `se_arrienda` | boolean default false | |
| `arriendo_monto` / `_moneda` | numeric / text | arriendo mensual |
| `notas` | text | |

Flujo neto (arriendo − dividendo) es **derivado** (lo calcula B / la UI), no se persiste.

### `client_activos_financieros` — parte manual del híbrido

El portafolio de inversiones (fondos/acciones/ETF) NO va aquí: se toma del Seguimiento. Aquí solo lo que vive fuera del portafolio trackeado.

| Columna | Tipo | Notas |
|---|---|---|
| `tipo` | text CHECK IN (`apv`,`afp`,`ahorro_periodico`,`cuenta_ahorro`,`otro`) | |
| `institucion` | text | AFP / aseguradora / banco |
| `saldo_monto` / `saldo_moneda` | numeric / text (null) | saldo actual; null para flujos puros |
| `aporte_monto` / `aporte_moneda` | numeric / text (null) | aporte periódico |
| `aporte_periodicidad` | text CHECK IN (`mensual`,`anual`) (null) | |
| `aporte_es_variable` | boolean default false | ahorro periódico fijo vs variable |
| `regimen` | text CHECK IN (`A`,`B`) (null) | solo para `apv` |
| `notas` | text | |

### RLS

Igual que el resto de tablas del cliente. `ENABLE ROW LEVEL SECURITY` en las tres. Políticas de `SELECT/INSERT/UPDATE/DELETE` para asesores donde `client_id IN (SELECT get_accessible_client_ids())`. (La política de lectura para el portal del cliente — el espejo — se agrega en B.)

### Migración de datos existentes

`servicios_adicionales` actual es texto libre mínimo (un flag de seguros + notas), sin estructura mapeable 1:1. **No se migra automáticamente.** El flag/JSONB se deja intacto por ahora (lo consume `mis-servicios` y `ClientInfoCard`); su reemplazo/limpieza se evalúa en B, cuando la página espejo tome estos datos.

## Superficie de API

Auth en todas: `requireAdvisor()` + **verificación de acceso al cliente** (`client_id ∈ get_accessible_client_ids()` / helper `verifyClientAccess`) para evitar IDOR — patrón obligatorio del repo. `createAdminClient()` tras el auth. Respuestas vía `successResponse`/`errorResponse` + `handleApiError`. Rate-limit por ruta.

- `GET /api/clients/[id]/patrimonio` → `{ seguros: [], inmuebles: [], activos: [] }` (agregado para hidratar la sección).
- Seguros: `POST /api/clients/[id]/patrimonio/seguros`, `PATCH`/`DELETE /api/clients/[id]/patrimonio/seguros/[itemId]`.
- Inmuebles: `POST /api/clients/[id]/patrimonio/inmuebles`, `PATCH`/`DELETE .../inmuebles/[itemId]`.
- Activos: `POST /api/clients/[id]/patrimonio/activos`, `PATCH`/`DELETE .../activos/[itemId]`.

Validación de payload en `lib/patrimonio/validate.ts` (moneda válida, montos ≥ 0, coherencia condicional: si `tiene_credito` → campos de crédito; si `se_arrienda` → `arriendo_monto`; `regimen` solo con `tipo='apv'`).

## UI de captura

- **Nueva pestaña "Patrimonio"** en `app/(advisor-shell)/clients/[id]` (se suma a las pestañas existentes de la ficha).
- Componente `components/clients/patrimonio/PatrimonioSection.tsx` — acordeón de 3 grupos. Cada grupo: cabecera con contador + botón "Agregar", lista de tarjetas colapsables; al abrir, formulario inline; guarda vía la API de arriba.
- Sub-componentes: `SeguroCard`, `InmuebleCard`, `ActivoFinancieroCard` (cada uno con su formulario), más `MoneyInput` reutilizable (monto + selector de moneda UF/CLP/USD) en `components/shared/`.
- Paleta y tokens del app (`--gb-*`, warm off-white + navy + copper), fuentes Source Serif 4 / Inter / JetBrains Mono. Sin hardcodear hex.
- Derivaciones triviales por tarjeta (flujo neto arriendo − dividendo) pueden mostrarse client-side como ayuda visual, marcadas como calculadas. La **franja resumen** (patrimonio neto + flujo total + pull del portafolio del Seguimiento) es **B**, fuera de alcance aquí.

## Fuera de alcance (explícito)

- Sub-proyecto B: agregación de patrimonio neto/flujo total, pull del valor de portafolio desde Seguimiento, y la página espejo del portal del cliente.
- Sub-proyecto C: el simulador de jubilación/flujos y el retiro del actual simulador de APV.

## Testing

- **Lógica pura con Vitest:** `lib/patrimonio/validate.ts` (validación + coherencia condicional). Reusar `lib/portfolio/currency.ts` para cualquier conversión (no reimplementar).
- **Migraciones, rutas y UI:** verificación manual (convención del repo; migraciones se aplican a mano en Supabase). Smoke test end-to-end: crear/editar/borrar un seguro, un inmueble con crédito+arriendo y un activo, recargar la ficha y confirmar persistencia.

## Criterios de éxito

1. Las 3 tablas existen con RLS y un asesor puede hacer CRUD de seguros, inmuebles y activos de un cliente accesible (y NO de uno no accesible — IDOR cerrado).
2. Cada monto conserva su moneda de origen y se puede leer de vuelta sin pérdida.
3. La pestaña "Patrimonio" de la ficha permite ingresar, editar y borrar todos los campos del modelo, con selector de moneda por campo.
4. El seguro de vida con devolución y el inmueble con crédito+arriendo capturan todos sus campos condicionales.
5. `tsc` sin errores nuevos y tests de `lib/patrimonio` verdes.
