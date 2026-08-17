# Repositorio de reportes — Fase 5: retiro de tablas/rutas legacy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Goal:** Retirar las 4 tablas de reportes legacy (`comite_reports`, `monthly_reports`, `model_portfolios`, `daily_reports`) y sus rutas/UI, DESPUÉS de migrar los consumidores vivos que aún las tocan al repositorio unificado (`reports`/`vw_reports_vigentes`), con un grace-period antes del drop destructivo.

**Architecture:** La Fase 4 ya re-apuntó los consumidores de LECTURA a la vista. Quedan consumidores VIVOS de escritura/lectura directa: la UI de reporte mensual (`monthly_reports`) y el upload diario (`daily_reports`). Esta fase (1) habilita búsqueda por `period` en el GET del repo, (2) re-apunta la UI mensual a `cierre_mensual`, (3) retira/re-apunta el upload diario, (4) borra el panel y las rutas legacy muertas, y (5) dropea las tablas tras el grace-period.

**Tech Stack:** Next.js 16 App Router + React 19, Supabase Postgres, Vitest.

## Global Constraints

- Rama: `feat/repositorio-reportes`. Migraciones en `supabase/migrations/` (`YYYYMMDD_description.sql`), aplicadas a mano en Supabase.
- **DESTRUCTIVO:** las Tasks 1-5 son código reversible; la Task 6 (drop de tablas) es IRREVERSIBLE — solo ejecutarla tras confirmar en PROD que el flujo nuevo funciona y que el backfill (`20260811_reports_backfill.sql`) copió todo. Grace-period ≥ 1 semana entre desplegar Tasks 1-5 y correr la Task 6.
- Auth de rutas: `requireAdvisor()` de `@/lib/auth/api-auth`; `createAdminClient()` tras auth; respuestas `successResponse`/`errorResponse` + `handleApiError`.
- Mapeo del backfill (fuente de verdad de a qué `type` va cada tabla): `comite_reports`→mismo `type` (macro/rv/rf/...); `monthly_reports`→`cierre_mensual` (period='YYYY-MM'); `daily_reports`→`diario`; `model_portfolios`→`cartera_modelo`.
- Idioma: español en UI, comentarios de DB y mensajes de error.
- Alias `@/` = raíz. Tests: `npx vitest run <archivo>`.

## Estado verificado (2026-08-12, para re-confirmar al ejecutar)

- `ComiteReportsPanel.tsx` NO se monta en ningún lado (componente muerto). Usa `/api/comite/upload` y `/api/comite/upload-report`. (`upload-report` NO es legacy: la Fase 4 lo re-apuntó a `reports`; NO borrar.)
- `/api/comite/upload` y `/api/comite/[type]` escriben/leen `comite_reports` y solo los llama el panel muerto.
- `/api/monthly-reports` (lee/escribe `monthly_reports`) está VIVO: `components/seguimiento/MonthlyReportSection.tsx` (montado en `SeguimientoPage.tsx`), `app/reporte-mensual/[month]/page.tsx`, `components/seguimiento/ClientMonthlyClosing.tsx`.
- `/api/daily-report/upload` escribe `daily_reports` (probablemente lo llamaba la máquina generadora de diarios; hoy debería usar `/api/reports/ingest`).
- Sin refs de código a `model_portfolios` fuera de migraciones (Fase 4 lo re-apuntó). Droppable.

## File Structure

**Modificados:**
- `app/api/reports/route.ts` — GET acepta filtro `period` (Task 1).
- `components/seguimiento/MonthlyReportSection.tsx`, `app/reporte-mensual/[month]/page.tsx`, `components/seguimiento/ClientMonthlyClosing.tsx` — leen/escriben `cierre_mensual` vía `/api/reports` (Task 2).

**Borrados (Task 5):**
- `app/api/comite/upload/route.ts`, `app/api/comite/[type]/route.ts`, `app/api/monthly-reports/route.ts`, `components/comite/ComiteReportsPanel.tsx`, y `app/api/daily-report/upload/route.ts` (si se confirma retirado en Task 3).

**Creados (Task 6):**
- `supabase/migrations/2026MMDD_reports_drop_legacy.sql` — drop de las 4 tablas.

---

## Task 1: Filtro `period` en `GET /api/reports`

**Files:** Modify `app/api/reports/route.ts`

**Interfaces:** Produce: `GET /api/reports?type=<t>&period=<p>` filtra por `period` exacto (habilita buscar el reporte de un mes: `period='YYYY-MM'`).

- [ ] **Step 1: Agregar el filtro**

En el handler `GET`, después de las líneas de `desde`/`hasta`:
```ts
    const period = sp.get("period");
    if (period) q = q.eq("period", period);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → 0 errores nuevos.

- [ ] **Step 3: Smoke manual**

`GET /api/reports?type=cierre_mensual&period=2026-05` (autenticado) → devuelve solo el/los reporte(s) de ese mes.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(reportes): GET /api/reports acepta filtro period"
```

---

## Task 2: Re-apuntar la UI mensual a `cierre_mensual`

**Files:** Modify `components/seguimiento/MonthlyReportSection.tsx`, `app/reporte-mensual/[month]/page.tsx`, `components/seguimiento/ClientMonthlyClosing.tsx`

**Contexto — shape viejo de `/api/monthly-reports`** (a reemplazar):
- GET `?month=YYYY-MM` → `{ report: {id, month, title, html_content, created_at} | null }`
- GET (sin month) → `{ reports: [{id, month, title, created_at}] }`
- POST JSON `{month, title?, html_content}` → `{ report: {id, month, title} }` (upsert por month)

**Mapeo al repo** (`cierre_mensual`, `period`=month, `content_html`=html):

- [ ] **Step 1: `MonthlyReportSection.tsx` — GET lista**

Reemplazar la llamada `fetch("/api/monthly-reports")` por:
```ts
const r = await fetch("/api/reports?type=cierre_mensual");
const j = await r.json();
const reports = (j.reports || []).map((x: Record<string, unknown>) => ({
  id: x.id, month: x.period, title: x.title, created_at: x.created_at,
}));
```

- [ ] **Step 2: `MonthlyReportSection.tsx` — POST (subir/actualizar)**

Reemplazar el `POST /api/monthly-reports` (JSON) por un POST multipart a `/api/reports`:
```ts
const fd = new FormData();
fd.append("type", "cierre_mensual");
fd.append("period", month);          // 'YYYY-MM'
if (title) fd.append("title", title);
fd.append("html", html_content);
const res = await fetch("/api/reports", { method: "POST", body: fd });
```
(El repo versiona en vez de upsert; `vw_reports_vigentes` devuelve la última versión por period, así que la lectura sigue mostrando la más reciente — equivalente al upsert.)

- [ ] **Step 3: `MonthlyReportSection.tsx` — GET por mes (si aplica en este componente)**

`fetch(\`/api/reports?type=cierre_mensual&period=${month}\`)` → `report = (j.reports?.[0]) ? { id, month: period, title, html_content: content_html, created_at } : null`.

- [ ] **Step 4: `app/reporte-mensual/[month]/page.tsx` — GET por mes**

Reemplazar `fetch(\`/api/monthly-reports?month=${month}\`)` por `fetch(\`/api/reports?type=cierre_mensual&period=${month}\`)` y mapear `j.reports?.[0]` → el objeto con `html_content = content_html`, `month = period`.

- [ ] **Step 5: `components/seguimiento/ClientMonthlyClosing.tsx` — GET por mes**

Igual que el Step 4: `fetch(\`/api/reports?type=cierre_mensual&period=${month}\`)` y mapear `reports[0]` (o `null`).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit` → 0 errores nuevos.

- [ ] **Step 7: Smoke manual (checkpoint output-idéntico)**

Con `npm run dev`: (a) la sección de reporte mensual lista los mismos meses que antes; (b) abrir un mes muestra el mismo HTML; (c) subir/actualizar un mes lo refleja al recargar; (d) el cierre por cliente y la página `/reporte-mensual/<mes>` muestran el mismo contenido. (Requiere que el backfill haya corrido en la BD que uses.)

- [ ] **Step 8: Commit**

```bash
git commit -am "refactor(reportes): UI de reporte mensual lee/escribe cierre_mensual desde el repositorio"
```

---

## Task 3: Retirar o re-apuntar `/api/daily-report/upload`

**Files:** (discovery) `app/api/daily-report/upload/route.ts` y sus llamadores.

- [ ] **Step 1: Descubrir llamadores**

Run: `grep -rn "daily-report/upload" app components lib` (excluir el propio route). Determinar si algún cliente interno (UI/cron) aún lo llama, o si solo lo usaba la máquina externa de diarios.

- [ ] **Step 2: Decisión**
  - Si NADIE interno lo llama y la máquina de diarios ya usa `/api/reports/ingest` (type=`diario`): marcar el route para borrado en la Task 5.
  - Si algo interno lo llama: re-apuntarlo para que inserte en `reports` (type=`diario`, `period`=am/pm, `content_html`, `audio_url`=podcast) reusando `ingestReport` o un insert equivalente; luego marcar la tabla `daily_reports` como droppable.

- [ ] **Step 3: Registrar la decisión** en este plan (editar la lista de "Borrados" de Task 5 y el drop de Task 6 según corresponda). Commit si hubo cambios de código.

---

## Task 4: Re-confirmar que las rutas comite legacy están muertas

**Files:** (verificación) `app/api/comite/upload/route.ts`, `app/api/comite/[type]/route.ts`, `components/comite/ComiteReportsPanel.tsx`.

- [ ] **Step 1: Verificar sin llamadores vivos**

Run:
```bash
grep -rn "api/comite/upload\b\|api/comite/\[type\]\|ComiteReportsPanel" app components --include=*.tsx --include=*.ts | grep -v "app/api/comite/" | grep -v "ComiteReportsPanel.tsx"
```
Expected: vacío (solo el panel muerto usaba `/api/comite/upload`; nadie monta el panel). Si aparece un llamador vivo, re-apuntarlo primero (fuera del alcance de esta task — escalar).

---

## Task 5: Borrar panel y rutas legacy muertas

**Files:** Delete (según Tasks 3-4):
- `components/comite/ComiteReportsPanel.tsx`
- `app/api/comite/upload/route.ts`
- `app/api/comite/[type]/route.ts`
- `app/api/monthly-reports/route.ts`
- `app/api/daily-report/upload/route.ts` (solo si Task 3 lo marcó retirado)

- [ ] **Step 1: Borrar los archivos** listados (los que apliquen).

- [ ] **Step 2: Verificar que no queden imports/rutas rotas**

Run: `grep -rn "ComiteReportsPanel\|api/comite/upload\b\|api/monthly-reports\|daily-report/upload" app components lib --include=*.ts --include=*.tsx` → vacío (o solo comentarios).
Run: `npx tsc --noEmit` → 0 errores. `npm run build` → sin errores de módulos faltantes.

- [ ] **Step 3: Confirmar cero refs de código a tablas legacy**

Run: `grep -rn '"comite_reports"\|"monthly_reports"\|"daily_reports"\|"model_portfolios"' app lib components --include=*.ts --include=*.tsx | grep -v supabase/migrations` → **vacío**. (Si algo aparece, NO continuar al drop.)

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(reportes): elimina panel y rutas de escritura legacy (comite/monthly/daily)"
```

---

## Task 6: Migración drop-legacy (SOLO tras grace-period + verificación en PROD)

**Files:** Create `supabase/migrations/2026MMDD_reports_drop_legacy.sql` (fecha ≥ 1 semana después del deploy de Tasks 1-5).

**PRE-REQUISITOS OBLIGATORIOS antes de correr esta migración:**
1. Tasks 1-5 desplegadas en prod y verificadas ≥ 1 semana.
2. Task 5 Step 3 (cero refs de código a las tablas) confirmado.
3. Confirmar en Supabase que el backfill copió todo:
```sql
SELECT
  (SELECT count(*) FROM comite_reports)    AS comite_src,
  (SELECT count(*) FROM monthly_reports)   AS monthly_src,
  (SELECT count(*) FROM daily_reports)     AS daily_src,
  (SELECT count(*) FROM model_portfolios)  AS model_src,
  (SELECT count(*) FROM reports WHERE type='cierre_mensual') AS cierre_dst,
  (SELECT count(*) FROM reports WHERE type='diario')         AS diario_dst,
  (SELECT count(*) FROM reports WHERE type='cartera_modelo') AS cartera_dst;
```
   Verificar que los destinos cubren los orígenes (re-correr `20260811_reports_backfill.sql`, que es idempotente, si falta algo).

- [ ] **Step 1: Escribir la migración**

```sql
-- Fase 5: drop de tablas de reportes legacy. IRREVERSIBLE.
-- Correr SOLO tras verificar backfill completo y cero refs de código (ver plan Task 6).
DROP TABLE IF EXISTS comite_reports   CASCADE;
DROP TABLE IF EXISTS monthly_reports  CASCADE;
DROP TABLE IF EXISTS daily_reports    CASCADE;
DROP TABLE IF EXISTS model_portfolios CASCADE;
```
(Excluir del drop cualquier tabla cuyo `daily-report/upload` u otra ruta siga usando según la decisión de Task 3.)

- [ ] **Step 2: (Opcional, recomendado) Backup previo**

En el dashboard de Supabase, exportar las 4 tablas (o snapshot del proyecto) antes de dropear.

- [ ] **Step 3: Aplicar en Supabase** (SQL Editor), tras los pre-requisitos.

- [ ] **Step 4: Verificar**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('comite_reports','monthly_reports','daily_reports','model_portfolios');
```
Expected: 0 filas. La app sigue funcionando (todo lee de `reports`/`vw_reports_vigentes`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026MMDD_reports_drop_legacy.sql
git commit -m "feat(reportes): Fase 5 — drop de tablas legacy (comite/monthly/daily/model_portfolios)"
```

---

## Self-Review (cobertura)

- Migrar consumidores vivos ANTES del drop → Tasks 2 (monthly UI) y 3 (daily upload). ✅
- Habilitar lookup por mes en el repo → Task 1 (filtro period). ✅
- Borrar panel + rutas legacy muertas → Task 5 (con verificación de cero refs). ✅
- Drop irreversible detrás de grace-period + verificación de backfill → Task 6 (pre-requisitos explícitos). ✅
- Riesgo clave (dropear una tabla que aún se usa) mitigado por el grep de cero-refs (Task 5 Step 3) como gate antes de Task 6. ✅

Nota: si al ejecutar aparece un llamador vivo no previsto de `/api/comite/[type]` (GET) o del upload diario, re-apuntarlo primero; NO dropear una tabla con refs de código vivas.
