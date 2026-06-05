# Portal del Cliente v2 — Seguimiento + Servicios

**Fecha:** 2026-06-05
**Estado:** Spec

## Objetivo

Rediseñar el portal del cliente para que muestre toda la información de seguimiento y radiografía que ve el asesor (read-only), y una página de productos/servicios contratados. El cliente ve los resultados pero no puede intervenir (sin edición, sin agregar/eliminar snapshots).

## Navegación (PortalTopbar)

Tabs actualizados (7 tabs):

| # | Tab | Ruta | Estado |
|---|-----|------|--------|
| 1 | Inicio | `/portal/bienvenida` | Existente, sin cambios |
| 2 | Mi Portafolio | `/portal/dashboard` | Existente, sin cambios |
| 3 | Seguimiento | `/portal/seguimiento` | **NUEVO** |
| 4 | Mis Servicios | `/portal/mis-servicios` | **NUEVO** |
| 5 | Reportes | `/portal/reportes` | Existente, sin cambios |
| 6 | Mis Cartolas | `/portal/mis-cartolas` | Existente, sin cambios |
| 7 | Mensajes | `/portal/mensajes` | Existente, sin cambios |

Ícono para Seguimiento: `LineChart` (lucide). Ícono para Mis Servicios: `Briefcase` (lucide).

## Página: Seguimiento (`/portal/seguimiento`)

### Fuente de datos

Nueva ruta `GET /api/portal/seguimiento` que:
1. Autentica con `requireClient()` (de `lib/auth/require-client.ts`)
2. Obtiene `client_id` del user metadata
3. Reutiliza la misma lógica de `/api/clients/[id]/seguimiento`:
   - Carga snapshots (excluyendo `source=api-prices`)
   - Calcula métricas (retorno total, anualizado si >= 365d, volatilidad, max drawdown)
   - Carga `benchmark_config` del cliente
   - Carga `cartera_recomendada` del cliente
4. Devuelve `{ success, data: { snapshots, metrics, client, recommendation } }`

Para radiografía: nueva ruta `POST /api/portal/radiografia` que:
1. Autentica con `requireClient()`
2. Recibe `{ snapshotId }` en body (o usa el último snapshot si no se envía)
3. Verifica que el snapshot pertenece al cliente autenticado
4. Ejecuta la misma lógica de `/api/portfolio/radiografia` (clasificación, enrichment, TAC, alternativas)
5. Devuelve el resultado read-only

Para precios históricos y retornos por activo: nuevas rutas proxy:
- `POST /api/portal/historical-prices` → proxy de `/api/portfolio/historical-prices`
- `POST /api/portal/prices-at-date` → proxy de `/api/portfolio/prices-at-date`
- `GET /api/portal/benchmark-config` → proxy read-only de `/api/benchmark/config`

Cada proxy:
1. `requireClient()` para autenticar
2. Inyecta `clientId` del metadata (el cliente no puede consultar otros clientes)
3. Delega al servicio/lógica existente

### Componentes reutilizados

La página `PortalSeguimientoPage` importa y renderiza los mismos componentes que usa el asesor, con prop `readOnly={true}` o simplemente sin pasar callbacks de edición:

1. **Header** — Nombre del cliente + selector de período (1M/3M/6M/1Y/ALL)
   - Sin botones: "Agregar Snapshot", "Enviar Seguimiento", "Llenar Precios"

2. **Cards de métricas** — Retorno total %, retorno anualizado (si ≥ 365d), valor actual, valor inicial, ganancia no realizada
   - Mismos cards que en SeguimientoPage

3. **EvolucionChart** — Gráfico de línea de evolución del portafolio
   - Filtrado por período via prop `period`
   - Sin tooltip de edición

4. **PortfolioBreakdownPies** — Dos donut charts (por asset class + por moneda)
   - Componente existente, sin cambios

5. **Composición boxes** — 4 cajas (RV, RF, Alternativos, Caja) con valores inicial vs actual
   - Sin selector de fecha "Desde inicio / Desde fecha" (siempre desde inicio)

6. **HoldingReturnsPanel** — Holdings detallados
   - Toggle "Desde Cartola" / "Desde Compra" se mantiene
   - Sin botón de editar holdings
   - Equity, Fixed Income, Alternatives, Cash tabs
   - Fetches de quotes para CFI*/stocks/ETFs funcionan igual

7. **PerformanceAttribution** — Barras horizontales de contribución por posición
   - Componente existente, sin cambios

8. **RentabilidadPorActivo** — Retornos mensuales por holding
   - Selector de mes (◀▶ + Acumulado)
   - Usa `/api/portal/prices-at-date` en vez de `/api/portfolio/prices-at-date`

9. **RetornosComparados** — Portfolio vs benchmark (barras agrupadas mensuales)
   - Benchmark desde `benchmark_config` del cliente (read-only, sin editor)
   - Sin componente BenchmarkConfig (el asesor lo configura)

10. **RadiografiaCartola** — Análisis de costos completo
    - TAC por holding, alternativas más baratas, ahorro potencial
    - Sin botones de acción (el asesor actúa, el cliente solo ve)
    - Usa `/api/portal/radiografia` en vez de `/api/portfolio/radiografia`

### Componentes que NO se muestran en portal

- `AddSnapshotModal` — Solo asesor agrega snapshots
- `ReviewSnapshotModal` — Solo asesor edita holdings
- `SendSeguimientoModal` — Solo asesor envía seguimiento
- `BenchmarkConfig` editor — Solo asesor configura benchmark
- `SnapshotsTable` con acciones (delete, edit) — El cliente no necesita la tabla de snapshots raw
- `MonthlyReportSection` — Herramienta del asesor
- `ClientMonthlyClosing` — Herramienta del asesor
- Botones "Llenar Precios", "Agregar Snapshot", "Enviar Seguimiento"

### Orden de secciones en la página

```
1. Header (nombre + período)
2. Cards de métricas (3-4 cards en grid)
3. EvolucionChart
4. PortfolioBreakdownPies (2 donuts)
5. Composición boxes (RV/RF/Alt/Caja)
6. HoldingReturnsPanel (toggle Cartola/Compra)
7. PerformanceAttribution
8. RentabilidadPorActivo (selector mes)
9. RetornosComparados (vs benchmark)
10. RadiografiaCartola (costos/TAC/alternativas)
```

## Página: Mis Servicios (`/portal/mis-servicios`)

### Fuente de datos

Nueva ruta `GET /api/portal/servicios` que:
1. `requireClient()`
2. Obtiene `client_id` del metadata
3. Consulta `clients` → `servicios_adicionales` (JSONB) + advisor info (nombre, empresa)
4. Devuelve `{ success, servicios, advisor }`

### Diseño

Cards en grid (1 col mobile, 2 cols desktop):

**Card "Asesoría de Inversiones"** (siempre presente, siempre activo):
- Ícono: `TrendingUp`
- Badge verde "Activo"
- Info: nombre del asesor, empresa
- Subtítulo: "Gestión y seguimiento de tu portafolio de inversiones"

**Card "Seguros"** (si `seguros` existe en JSONB):
- Ícono: `Shield`
- Badge verde "Activo" o gris "No contratado"
- Si activo: número de póliza, cobertura, beneficiarios, notas
- Si inactivo: "Consulta con tu asesor para más información"

**Card "Asesoría Tributaria"** (si `asesoria_tributaria` existe):
- Ícono: `Calculator`
- Badge verde/gris
- Si activo: descripción del servicio

**Card "Asesoría Inmobiliaria"** (si `asesoria_inmobiliaria` existe):
- Ícono: `Building2`
- Badge verde/gris
- Si activo: descripción del servicio

### Estilo de cards

```
┌──────────────────────────────────┐
│ [Ícono]  Nombre del Servicio  🟢 │
│                                  │
│  Detalle 1: valor                │
│  Detalle 2: valor                │
│                                  │
│  Descripción o notas...          │
└──────────────────────────────────┘
```

- Border `border-gb-border`, rounded-lg, padding p-6
- Ícono en `text-gb-primary` (activo) o `text-gb-gray` (inactivo)
- Badge: `bg-green-50 text-green-700` (activo), `bg-gray-100 text-gray-500` (inactivo)
- Cards inactivas con `opacity-60`

## Archivos a crear/modificar

### Nuevos archivos

| Archivo | Descripción |
|---------|-------------|
| `app/(portal)/portal/seguimiento/page.tsx` | Página de seguimiento del portal |
| `app/(portal)/portal/mis-servicios/page.tsx` | Página de servicios contratados |
| `app/api/portal/seguimiento/route.ts` | API seguimiento para cliente |
| `app/api/portal/radiografia/route.ts` | API radiografía para cliente |
| `app/api/portal/historical-prices/route.ts` | Proxy historical-prices para cliente |
| `app/api/portal/prices-at-date/route.ts` | Proxy prices-at-date para cliente |
| `app/api/portal/benchmark-config/route.ts` | Proxy benchmark config read-only |
| `app/api/portal/servicios/route.ts` | API servicios contratados |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `components/portal/PortalTopbar.tsx` | Agregar tabs "Seguimiento" y "Mis Servicios" |
| `components/seguimiento/RadiografiaCartola.tsx` | Aceptar prop `readOnly` para ocultar botones de acción |
| `components/seguimiento/HoldingReturnsPanel` (si existe como componente separado) | Aceptar prop `readOnly` |

### Componentes que se reutilizan sin cambios

Estos componentes ya son presentacionales y no necesitan prop `readOnly`:
- `EvolucionChart`
- `PortfolioBreakdownPies`
- `PerformanceAttribution`
- `RentabilidadPorActivo`
- `RetornosComparados`

## Seguridad

- Todas las rutas `/api/portal/*` usan `requireClient()` — no `requireAdvisor()`
- El `clientId` se obtiene del user metadata, nunca del query string (el cliente no puede consultar otros clientes)
- Rutas proxy validan que el snapshot/recurso pertenece al cliente autenticado antes de procesar
- Rate limiting: mismos límites que las rutas portal existentes
- `handleApiError` en todas las rutas nuevas

## Qué NO cambia

- `/portal/dashboard` — Se mantiene como resumen rápido del portafolio
- `/portal/bienvenida` — Sin cambios
- `/portal/reportes` — Sin cambios
- `/portal/mis-cartolas` — Sin cambios
- `/portal/mensajes` — Sin cambios
- `/portal/login`, `/portal/setup-password`, `/portal/cambiar-password` — Sin cambios
- Vista del asesor (seguimiento, radiografía) — Sin cambios
