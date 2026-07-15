# Centro de Reportes — Diseño

**Fecha:** 2026-07-14
**Estado:** Aprobado (pendiente review del spec)

## 1. Contexto y problema

Los reportes globales de la firma (macro, RV, RF, asset allocation, acciones, cierre de mes, diarios, semanales) se **generan en otro computador** (workflow de análisis del comité) y hoy llegan de forma parcial y sin histórico:

- `comite_reports` (migración `20260611`) almacena los informes de comité, pero tiene `type TEXT NOT NULL UNIQUE` → **cada nuevo informe sobrescribe al anterior**. No hay histórico.
- Solo cubre comité (macro/rv/rf/asset_allocation/custom); no hay diarios/semanales/cierre global.
- Guarda HTML en una columna `content TEXT`; no hay soporte para archivos (PDF).
- Las carteras modelo viven en `model_portfolios` (ya versionadas por trigger).
- No hay una vista unificada del asesor para navegar todo esto con su histórico.

Lo **por-cliente** (seguimiento de cartola, radiografía) y el **control de envío por cliente** (`client_report_config`: qué informe y con qué frecuencia por cliente) **ya funcionan bien y quedan fuera de alcance**.

**Objetivo:** un archivo **versionado unificado** de los reportes globales, con ingesta automática por API push desde el computador externo, y una vista para el asesor. Enfoque elegido: **evolucionar `comite_reports`** (no crear una tabla paralela).

## 2. Modelo de datos

Evolucionar `comite_reports` a un archivo versionado (migración nueva):

```sql
-- Quitar la unicidad que impedía el histórico
ALTER TABLE comite_reports DROP CONSTRAINT IF EXISTS comite_reports_type_key;

-- Nuevas columnas
ALTER TABLE comite_reports
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'html',      -- 'json' | 'html' | 'pdf'
  ADD COLUMN IF NOT EXISTS payload JSONB,                            -- reportes JSON (comité estructurado)
  ADD COLUMN IF NOT EXISTS storage_path TEXT,                        -- archivo en bucket (pdf/html file)
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,           -- autoincremental por tipo
  ADD COLUMN IF NOT EXISTS frequency TEXT,                           -- 'diario'|'semanal'|'mensual'|'evento'
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true; -- marca la última versión por tipo

-- content ya no es obligatorio (puede venir en payload o storage_path)
ALTER TABLE comite_reports ALTER COLUMN content DROP NOT NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_comite_reports_type_date
  ON comite_reports (type, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_comite_reports_current
  ON comite_reports (type) WHERE is_current;
```

**Tipos permitidos (`type`):** `macro`, `rv`, `rf`, `asset_allocation`, `acciones`, `cierre_mes`, `diario`, `semanal`. (Set validado en la ingesta; `custom` se mantiene por compatibilidad.)

**Invariante de versión:** a lo más una fila con `is_current = true` por `type`. Al insertar una versión nueva se baja el `is_current` de las anteriores del mismo tipo y la nueva toma `version = max(version)+1`.

**Carteras modelo:** se quedan en `model_portfolios` (ya versionadas). El Centro las **muestra** vía el endpoint existente; NO se migran.

**Backfill de la migración:** las filas existentes de `comite_reports` quedan con `version=1`, `is_current=true`, `format='html'` (ya tienen `content`). No se pierden.

## 3. Ingesta — API push

Endpoint nuevo `POST /api/reports/ingest` (generaliza el patrón de `comite/upload`).

**Autenticación:** token de ingesta de máquina, `REPORTS_INGEST_KEY` (env), enviado como header `Authorization: Bearer <key>`. Comparación **timing-safe** (mismo patrón que se recomendó para `CRON_SECRET`). Esto permite que el computador externo envíe sin sesión de usuario. `uploaded_by = NULL` para la ingesta de máquina (la columna admite NULL).

**Destino de `comite/upload` actual:** se mantiene funcionando durante la transición (escribe la versión vigente vía la nueva lógica) y se marca deprecado; el computador externo migra a `/api/reports/ingest`. No se elimina en este alcance.

**Body — JSON:**
```json
{ "type": "macro", "title": "...", "reportDate": "2026-07-14",
  "format": "json", "payload": { ... } }
```
o `"format": "html", "content": "<html>…</html>"`.

**Body — archivo (multipart):** campo `file` (PDF/HTML) + campos `type`, `title`, `reportDate`, `frequency`. El archivo se sube al bucket `firm-reports`; se guarda `storage_path`, `format` = 'pdf'|'html'.

**Lógica:**
1. Validar token → 401 si falla.
2. Validar `type` contra el set permitido y `format` → 400 si inválido.
3. Si es archivo: validar tamaño (límite, ej. 20 MB) y content-type; subir al bucket. Si el upload falla → 502, no se crea fila.
4. Transacción/secuencia: `UPDATE comite_reports SET is_current=false WHERE type=$type AND is_current`; luego `INSERT` con `version = COALESCE(max,0)+1`, `is_current=true`.
5. **Idempotencia opcional:** si ya existe una fila con el mismo `(type, report_date)` y el mismo hash de contenido, devolver la existente sin insertar (evita duplicados en reintentos).
6. Respuesta: `{ success, id, type, version }`.

Rate limit aplicado (`applyRateLimit`).

## 4. Storage

Bucket privado de Supabase Storage `firm-reports`. `storage_path` = `firm-reports/<type>/<report_date>-v<version>.<ext>`. Lectura vía **signed URLs** generadas server-side solo para asesores autenticados (nunca URL pública).

## 5. UI — Centro de Reportes

Nueva página del asesor `/advisor/reportes` + item de sidebar ("Centro de Reportes"). Bajo `app/(advisor-shell)/`.

- **Lista por tipo** (macro, RV, RF, asset allocation, acciones, cierre mensual, diario, semanal): muestra el **último** (fecha, versión) y un desplegable **"ver histórico"** con las versiones anteriores.
- **Ver:** JSON → render con los paneles/componentes existentes (ej. `ComiteReportsPanel`); HTML inline → iframe/render; archivo (pdf/html) → abrir vía signed URL.
- **Sección Carteras Modelo:** desde `model_portfolios` (endpoint `comite/model-portfolios` + `history`), read-only.
- Datos vía `GET /api/reports` (lista + histórico) y `GET /api/reports/[id]` (detalle + signed URL).

## 6. Consumidores a ajustar

Los lectores actuales de `comite_reports` asumen una fila por tipo (por el UNIQUE). Deben pasar a leer **la versión vigente** (`is_current = true`):
- `components/comite/ComiteReportsPanel.tsx` (dashboard).
- `app/api/comite/[type]/route.ts`, `app/api/comite/status/route.ts`.
- Empaquetado en `app/api/clients/[id]/reports/route.ts` y `app/api/portal/reports/route.ts` (los `comite_reports_included`).
- `app/api/cron/send-reports/route.ts` / `lib/daily-report-distribution.ts`.

Cambio mecánico: agregar `.eq("is_current", true)` (o `.order("version", desc).limit(1)`).

## 7. Manejo de errores

- Ingesta: 401 (token), 400 (tipo/formato/campos), 413 (tamaño), 502 (bucket). Sin fila si el archivo no se sube.
- Lectura: si un `storage_path` no resuelve, degradar (mostrar "archivo no disponible"), no romper la lista.
- Migración: idempotente (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`).

## 8. Testing

- **Unit puros:** cálculo de `version` (max+1), validación de `type`/`format`, selección "última por tipo".
- **Ruta de ingesta:** auth (401), JSON válido → inserta versión 2 y baja is_current de v1, archivo → sube al bucket y guarda storage_path, tipo inválido → 400, idempotencia (mismo type+date+hash → no duplica).
- **Regresión:** un lector (ej. ComiteReportsPanel/API) devuelve la versión vigente tras insertar una nueva.

## 9. Fuera de alcance (YAGNI)

- No mover `model_portfolios` (ya versionado); solo se muestra.
- No rehacer el control de envío por-cliente (`client_report_config`) — funciona.
- No carpetas/tags/documentos genéricos arbitrarios.
- No cambiar el portal del cliente (sigue leyendo lo publicado como hoy, ahora la "versión vigente").

## 10. Pasos de implementación (alto nivel)

1. Migración `20260714_comite_reports_versioned.sql` (schema + backfill).
2. Bucket `firm-reports` + helper de signed URLs.
3. `POST /api/reports/ingest` (auth por token, JSON/archivo, versionado) + tests.
4. `GET /api/reports` y `GET /api/reports/[id]`.
5. Página `/advisor/reportes` + item sidebar.
6. Ajustar los ~6 consumidores a `is_current`.
7. Script/ejemplo de push para el computador externo (curl/snippet).
