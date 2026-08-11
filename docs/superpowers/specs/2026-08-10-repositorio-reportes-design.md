# Repositorio unificado de reportes — Diseño (Spec 1: Fundación)

**Fecha:** 2026-08-10
**Estado:** Diseño aprobado, pendiente de plan de implementación
**Alcance:** Este spec cubre SOLO la fundación (repositorio + ingesta + migración + re-apuntado de consumidores existentes). Los consumidores nuevos van en specs aparte (ver §7).

## 1. Contexto y problema

Los reportes que produce el comité / Global Markets alimentan hoy varios consumidores, pero viven en **4 tablas fragmentadas** con formas distintas y sin historial unificado:

| Tabla | Forma | Historial | Consumidor actual |
|-------|-------|-----------|-------------------|
| `comite_reports` | HTML por **tipo** (`macro`/`rv`/`rf`/`asset_allocation` + custom), PK=`type` UNIQUE | ❌ se sobreescribe (1 por tipo) | IA `comite/generar-cartera`; comentario en `client_reports` |
| `monthly_reports` | HTML por **mes** (`YYYY-MM`) | ✅ por mes | IA `client-closings` → explicación de resultados al cliente |
| `daily_reports` | HTML + podcast MP3 por **fecha + AM/PM** | ✅ por fecha | distribución diaria a clientes |
| `model_portfolios` | JSON carteras por **perfil** (posiciones/sleeves), versionado por trigger | ✅ versionado | recomendación 3-columnas (`comite/recomendacion`) |

Problemas concretos:
1. No hay repositorio único; 4 tablas con 3 formas distintas.
2. `comite_reports` no tiene historial (subir un Macro nuevo borra el anterior).
3. No hay noción de **"usos"**: qué reporte alimenta la IA de cartera, cuál se distribuye a clientes, cuál alimenta el cierre.
4. El flujo **nuevo** de recomendación (3-col) no consume reportes; la IA que sí los usa es el flujo viejo (`generar-cartera`).

## 2. Objetivo

Un **repositorio central único** de reportes, con tipo + historial + **tags de uso**, del que leen todos los consumidores. Este spec establece esa fundación y migra los consumidores existentes sin romperlos. Habilita (en specs posteriores) la IA de construcción de cartera y la distribución curada a clientes.

## 3. Decisiones de diseño (tomadas en brainstorming)

- **Propiedad:** biblioteca **central global** (los reportes los produce el comité, los ven todos los asesores). Sin reportes por asesor en v1.
- **Alcance del modelo:** el repositorio unifica **todo**, incluidas las **carteras modelo** (JSON) como un tipo más.
- **Usos:** **default por tipo + override por reporte**. Usos posibles: `distribucion`, `insumo_cartera`, `insumo_cierre`.
- **Taxonomía:** set **curado (~10 tipos) + permitir custom**.
- **Vigencia:** **historial completo + última = vigente automáticamente** (sin pin manual). Los consumidores leen la vigente.
- **Formatos:** `html` (inline), `json` (estructurado), `mp3` (podcast, Storage), `pdf` (Storage).

## 4. Modelo de datos

### 4.1 Catálogo de tipos — `report_types`

Data-driven (permite alta de tipos custom sin tocar código).

```sql
CREATE TABLE report_types (
  id            text PRIMARY KEY,          -- 'macro','rv',...,'cartera_modelo', + custom
  label         text NOT NULL,             -- "Macro", "Cartera Modelo", …
  scope_key     text NOT NULL,             -- 'date' | 'period' | 'month' | 'perfil'
  default_usos  text[] NOT NULL DEFAULT '{}',  -- {'distribucion','insumo_cartera','insumo_cierre'}
  formatos      text[] NOT NULL DEFAULT '{html}', -- {'html','json','pdf','mp3'}
  is_custom     boolean NOT NULL DEFAULT false,
  orden         int NOT NULL DEFAULT 100,
  created_at    timestamptz DEFAULT now()
);
```

**`scope_key`** define qué identifica una versión (y qué pide la UI al subir):
- `date` → solo `report_date` (macro, rv, rf, asset_allocation, arbol_decision, sectorial, seleccion_acciones)
- `period` → `report_date` + `period ∈ {am,pm}` (diario)
- `month` → `period = 'YYYY-MM'` (cierre_mensual)
- `perfil` → `report_date` + `perfil` (cartera_modelo)

**Seed inicial (~10 tipos):**

| id | label | scope_key | default_usos | formatos |
|----|-------|-----------|--------------|----------|
| `macro` | Macro | date | `{distribucion,insumo_cartera}` | `{html,pdf}` |
| `rv` | Renta Variable | date | `{distribucion,insumo_cartera}` | `{html,pdf}` |
| `rf` | Renta Fija | date | `{distribucion,insumo_cartera}` | `{html,pdf}` |
| `asset_allocation` | Asset Allocation | date | `{insumo_cartera}` | `{html,json,pdf}` |
| `arbol_decision` | Árbol de Decisión | date | `{insumo_cartera}` | `{html,json,pdf}` |
| `sectorial` | Análisis sectorial/coyuntura | date | `{distribucion,insumo_cartera}` | `{html,pdf}` |
| `seleccion_acciones` | Selección de acciones | date | `{insumo_cartera}` | `{html,pdf}` |
| `diario` | Reporte diario (AM/PM) | period | `{distribucion}` | `{html,mp3}` |
| `cierre_mensual` | Cierre mensual | month | `{insumo_cierre,distribucion}` | `{html,pdf}` |
| `cartera_modelo` | Cartera modelo | perfil | `{}` | `{json}` |

> Los defaults son punto de partida; el asesor puede ajustarlos por reporte al subir, y editar el catálogo. `cartera_modelo` no tiene usos: la consume directamente la tabla de recomendación, no la IA ni la distribución.

### 4.2 Reportes — `reports`

```sql
CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL REFERENCES report_types(id),
  title         text,
  report_date   date NOT NULL,
  period        text,          -- 'am'/'pm' (diario) · 'YYYY-MM' (cierre) · null resto
  perfil        text,          -- solo cartera_modelo (conservador..agresivo)
  content_html  text,          -- HTML inline
  payload       jsonb,         -- JSON estructurado (carteras: {posiciones, sleeves, …})
  pdf_url       text,          -- Supabase Storage (bucket 'reports')
  audio_url     text,          -- Supabase Storage (bucket 'daily-reports')
  usos          text[],        -- override; si NULL, hereda default_usos del tipo
  uploaded_by   uuid REFERENCES advisors(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_reports_type_date ON reports(type, report_date DESC);
CREATE INDEX idx_reports_scope ON reports(type, period, perfil, report_date DESC);
```

- **Siempre INSERT, nunca upsert** → cada subida es una versión nueva (historial).
- `usos` NULL = "usa el default del tipo". Un array vacío `{}` = "sin usos" (explícito). Los consumidores resuelven: `COALESCE(reports.usos, report_types.default_usos)`.
- **Usos efectivos como vista/expresión:** los consumidores filtran por uso usando el efectivo (override ∨ default), no por `reports.usos` crudo.

### 4.3 Vigencia automática — `vw_reports_vigentes`

```sql
CREATE VIEW vw_reports_vigentes AS
SELECT DISTINCT ON (r.type, COALESCE(r.period,''), COALESCE(r.perfil,''))
       r.*,
       COALESCE(r.usos, rt.default_usos) AS usos_efectivos
FROM reports r
JOIN report_types rt ON rt.id = r.type
ORDER BY r.type, COALESCE(r.period,''), COALESCE(r.perfil,''),
         r.report_date DESC, r.created_at DESC;
```

- Devuelve **una fila por (tipo, clave-de-scope)**: la más reciente.
- Expone `usos_efectivos` ya resuelto (override ∨ default) para simplificar los consumidores.
- El historial completo queda en `reports`; la UI de historial consulta `reports` directo.

### 4.4 RLS y Storage

- `reports` y `report_types`: replican la policy de `comite_reports` — **lectura** para advisors autenticados (`auth.uid() IN (SELECT id FROM advisors)`), **escritura** service-role.
- Buckets Storage: **MP3** reusa `daily-reports`; **PDF** va a bucket nuevo `reports`. Ambos privados; se sirve vía URL firmada o proxy autenticado (seguir el patrón actual de `daily-reports`).

## 5. Ingesta y API

Un endpoint único reemplaza `comite/upload`, `comite/upload-report`, `comite/[type]` (GET/DELETE) y `monthly-reports`; y absorbe la escritura de `daily-report/upload`.

```
POST   /api/reports          multipart: type, report_date, period?, perfil?, usos[]?,
                             + archivos (html text|file, pdf file, mp3 file) | payload json
GET    /api/reports          filtros: ?type=&vigente=true&desde=&hasta=
GET    /api/reports/[id]
DELETE /api/reports/[id]
GET    /api/report-types
POST   /api/report-types     alta de tipo custom (is_custom=true)
```

**Reglas de validación en `POST /api/reports`:**
1. `requireAdvisor()` + `applyRateLimit`.
2. `type` debe existir en `report_types`.
3. Según `scope_key` del tipo, exigir los campos de clave: `date`→`report_date`; `period`→`report_date`+`period∈{am,pm}`; `month`→`period` con formato `YYYY-MM`; `perfil`→`report_date`+`perfil` válido.
4. Cada formato subido debe estar en `report_types.formatos`; validar MIME/tamaño con `validateUpload` (patrón existente).
5. PDF/MP3 → subir a Storage, guardar `pdf_url`/`audio_url`. HTML/JSON → inline.
6. `title` desde `<title>` del HTML si viene (regex actual de `comite/upload`), o del campo `title`.
7. **INSERT** (nunca upsert).
8. **Aviso de insumo sin texto:** si `usos` efectivos incluyen `insumo_cartera` o `insumo_cierre` y NO hay `content_html` ni `payload` (solo PDF/MP3), responder con `warning` (no error) — la IA no podrá leerlo. La fila se crea igual.

`daily-report/upload` mantiene su **auth por API-key externa** (`DAILY_REPORT_API_KEY`) pero internamente inserta en `reports` con `type='diario'`.

## 6. UI: Página "Repositorio de reportes"

Ruta nueva `/advisor/reportes` (sidebar bajo Comité/Research). Reemplaza al `ComiteReportsPanel` disperso.

- **Vista por tipo** (del catálogo): tarjeta con `label`, **badges de usos**, "vigente: <fecha>", acciones _Subir_ / _Historial_.
- **Modal de subida** (flujo único): elige tipo → según `scope_key` pide fecha / AM-PM / mes / perfil; según `formatos` habilita HTML/PDF/MP3/JSON; **usos precargados** del default del tipo, editables (override).
- **Historial por tipo:** lista de versiones (fecha, quién subió, ver/descargar, eliminar); la vigente marcada (auto = la última).
- **＋ Nuevo tipo (custom):** id, label, `scope_key`, `default_usos`, `formatos`.
- **Viewer multiformato** (`/reporte/[id]` o modal): HTML→iframe sandbox (como hoy, sin sanitizar) · PDF→embed/descarga · MP3→player · JSON de cartera→tabla (reusa la vista de carteras del `ComiteReportsPanel`).
- **Enlaces existentes:** donde hoy se embebe `ComiteReportsPanel` (advisor home, fund-mapping) → enlazar a la nueva página o embeber una versión compacta de solo-lectura.

## 7. Consumidores: re-apuntado (migración)

El repositorio es la única fuente; cada consumidor deja de leer su tabla vieja y lee de `vw_reports_vigentes`. **Tabla por tabla**, verificando antes de borrar las viejas.

| Consumidor | Lee de (viejo) | Pasa a leer de (nuevo) |
|-----------|----------------|------------------------|
| `comite/recomendacion` (3-col) | `model_portfolios` por perfil | `vw_reports_vigentes` · `type='cartera_modelo'`, `perfil=X` → `payload.posiciones` |
| `client-closings` (cierre → IA resultados) | `monthly_reports` por mes | `type='cierre_mensual'`, `period=YYYY-MM` |
| distribución diaria (`lib/daily-report-distribution`) | `daily_reports` | `type='diario'`, `period=am/pm`, `audio_url` |
| comentario en `client_reports` | `comite_reports` | vigentes con `insumo`/`distribucion` según corresponda (macro/rv/rf/aa) |
| IA `comite/generar-cartera` | `comite_reports` | vigentes con `usos_efectivos @> {insumo_cartera}` |

**Consumidores NUEVOS (fuera de este spec):**
- **Spec 2 — IA de cartera en el flujo nuevo (3-col):** la IA lee reportes `insumo_cartera` y propone/justifica la cartera dentro de "Construir recomendación"; el asesor aprueba/edita. Depende de esta fundación.
- **Spec 3 — Distribución curada a clientes:** curar y enviar reportes `distribucion` (portal/correo), config por cliente. Depende de esta fundación.

## 8. Migración de datos (backfill idempotente)

Script/migración que copia las 4 tablas viejas → `reports`. Idempotente (re-ejecutable sin duplicar; usar `ON CONFLICT` o chequeo de existencia por clave natural).

- `comite_reports` → `reports` (type tal cual, `content_html`, `report_date`, `usos`=NULL→hereda default). 1:1 (sin historial previo).
- `monthly_reports` → `type='cierre_mensual'`, `period=month`, `content_html`, `report_date` derivado del mes.
- `daily_reports` → `type='diario'`, `period=am/pm`, `content_html`, `audio_url=podcast_url`, `report_date`.
- `model_portfolios` → `type='cartera_modelo'`, `perfil`, `payload={posiciones,sleeves}`, `report_date` (conserva **todo el historial**).

## 9. Fases de implementación (cada una verificable)

| Fase | Qué | Verificación |
|------|-----|--------------|
| 0 | `report_types` + `reports` + `vw_reports_vigentes` + buckets + RLS + **seed** de tipos | migración corre limpia; seed presente; RLS niega a no-advisor |
| 1 | Endpoints `/api/reports` + `/api/report-types` | subir HTML/PDF/MP3/JSON crea filas/URLs correctas; validación de scope/formato; warning de insumo-sin-texto |
| 2 | **Backfill** de las 4 tablas viejas (idempotente). Viejas siguen siendo la fuente de los consumidores | conteos calzan; carteras conservan historial por fecha; re-ejecución no duplica |
| 3 | Página **Repositorio de reportes** + viewer multiformato | subir/ver/historial/eliminar de punta a punta |
| 4 | **Re-apuntar consumidores** uno a uno (recomendación → cierre → diario → comentario cliente → generar-cartera) | tabla de recomendación **idéntica** al output previo; cierre sigue generando; diario sigue enviando |
| 5 | `DROP` tablas y rutas de escritura viejas (`comite_reports`, `monthly_reports`, `daily_reports`, `model_portfolios`; rutas `comite/upload`, `comite/upload-report`, `comite/[type]`, `monthly-reports`) | `npm run build` + `npm run test:run` verdes; grep sin referencias a tablas/rutas viejas |

**Checkpoint crítico (Fase 4):** antes de tocar `model_portfolios`, capturar el output actual de `comite/recomendacion` para un cliente de prueba y comparar byte a byte tras el re-apuntado.

## 10. Fuera de alcance (YAGNI)

- Reportes por asesor / multi-tenant (solo global en v1).
- Vigente manual con pin (es automática).
- Extracción de texto de PDF para IA (la IA lee HTML/JSON; PDF/MP3 son para leer/descargar/distribuir). Un reporte insumo debe tener cuerpo HTML/JSON.
- La IA de construcción de cartera en el flujo nuevo (Spec 2) y la distribución curada (Spec 3).

## 11. Riesgos

- **Re-apuntar `model_portfolios`** es la parte de mayor riesgo: toca código que ya anda (recomendación 3-col, generar-cartera, history, ComiteReportsPanel). Mitigación: aislarlo en su fase, con verificación de output idéntico antes del DROP.
- **HTML sin sanitizar** en iframe sandbox: se mantiene el patrón actual (los reportes vienen de fuente confiable / comité). No introducir sanitización que rompa estilos (bug histórico ya documentado en `comite/upload`).
- **Storage de PDF/MP3**: seguir el patrón de acceso de `daily-reports` (privado + URL firmada/proxy), no exponer público sin querer.
