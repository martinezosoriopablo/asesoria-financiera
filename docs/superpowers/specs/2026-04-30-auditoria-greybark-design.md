# Auditoria Greybark Advisors — Design Doc

> Auditar, ordenar, fusionar duplicados, completar lo que falta.
> Primer cliente real: Heraldo Alvarez.
> Plan completo, ejecucion quirurgica (solo bloqueantes ahora).

---

## 1. Estado del sistema (diagnostico de 5 agentes)

### 1.1 Lo que funciona bien (no tocar)

- CMF es fuente canonica de precios. Cadena clara: CMF -> AAFM -> Fintual -> fallback.
- RLS implementado en 19 tablas con USING + WITH CHECK. Patron auth correcto.
- Google Calendar E2E (OAuth, sync, Google Meet automatico).
- Portal cliente: login, dashboard, reportes, mensajes, subir cartola.
- Notificaciones in-app: cartola_upload, questionnaire_completed, rebalance_alert.
- Drift alerting E2E (cron diario, threshold configurable).
- Report config y sending (cron, email via Resend).
- ClientDetail como vista unica completa (1356 lineas).
- Parsers de cartola PDF (Claude AI) y Excel (XLSX) — separados intencionalmente.

### 1.2 Lo que hay que arreglar

| ID | Item | Severidad | Archivos afectados |
|----|------|-----------|-------------------|
| A1 | Eliminar TWR, reemplazar por retornos simples por posicion | BLOQUEANTE | 18 archivos |
| A2 | Tests RLS + agregar RLS a 5 tablas faltantes | BLOQUEANTE | 5 migrations + tests nuevos |
| A3 | Validar magic link edge cases | ALTO | middleware.ts, invite flow |
| A4 | Fusionar 7 endpoints de busqueda de fondos | MEDIO | 7 route files |
| A5 | Extraer utilidades duplicadas (stripAccents x3, CHILEAN_TICKERS x2) | MEDIO | ~8 archivos |
| A6 | TAC sin audit trail (upload manual sin versionado) | BAJO | api/tac/route.ts |
| A7 | generate-pdf y portfolio-comparison casi identicos | BAJO | 2 route files |

### 1.3 Lo que no existe (features nuevas)

| ID | Feature | Complejidad | Bloqueante Heraldo? |
|----|---------|-------------|---------------------|
| N1 | Retornos periodicos (1M, 3M, 6M, 12M, YTD) en portal | Media | SI |
| N2 | Fondos preferidos del asesor | Media | NO |
| N3 | Mail al corredor pre-redactado | Baja-media | NO |
| N4 | Frecuencia de cuestionario configurable | Baja | NO |
| N5 | Vista "Mi dia" / acciones pendientes | Media | NO |
| N6 | Push notifications / email reminders | Media | NO |

---

## 2. Decisiones arquitectonicas

### 2.1 Retornos: eliminar TWR, retornos simples por posicion

**Modelo de calculo:**

```
Retorno por posicion:
  r_i = (P_final / P_inicial) - 1

  Si dias < 365: mostrar r_i tal cual (retorno simple, NO anualizar)
  Si dias >= 365: anualizar -> (1 + r_i) ^ (365 / dias) - 1

Retorno del portafolio:
  R = sum(w_i * r_i)
  donde w_i = valor_posicion_i / valor_total_portafolio
  Cada r_i esta en su propia base (simple si < 1 año, anualizado si >= 1 año)

Flujos de caja:
  - Compra nueva posicion -> nueva entrada con su propia fecha, su propio retorno
  - Cash sin compra -> restar del valor inicial y final
  - Rescate -> sacar posicion del calculo inicio y final
```

**Regla de anualizacion:**
- Periodos < 1 año (1M, 3M, 6M, YTD si < 365d): retorno simple, NUNCA anualizar
- Periodos >= 1 año (12M, desde inicio si >= 365d): anualizado
- En la UI se indica claramente: "3.2%" vs "8.1% anual"

**Periodos a mostrar:** 1M, 3M, 6M, 12M, YTD, desde inicio.
Si la posicion tiene menos tiempo que el periodo solicitado, se muestra desde su fecha de compra.

**Comparacion 3 vias (cuando exista portafolio optimo):**
1. Portafolio actual vs Portafolio optimo
2. Portafolio actual vs Benchmark
3. Portafolio optimo vs Benchmark

**Archivos a crear:**
- `lib/returns/calculator.ts` — funciones puras: `positionReturn`, `annualizeReturn`, `portfolioReturn`, `periodicReturns`
- `lib/returns/calculator.test.ts` — tests con casos conocidos

**Archivos a modificar (eliminar TWR):**
- `app/api/portfolio/snapshots/route.ts` — eliminar calculo TWR (lineas 201-233)
- `app/api/clients/[id]/seguimiento/route.ts` — eliminar recalculo TWR, reemplazar metricas
- `components/seguimiento/SeguimientoPage.tsx` — usar retornos periodicos
- `components/seguimiento/SnapshotsTable.tsx` — mostrar retorno simple en vez de twr_period
- `components/seguimiento/HoldingReturnsPanel.tsx` — ya usa returnFromBase, limpiar TWR
- `components/seguimiento/PerformanceAttribution.tsx` — usar retorno simple
- `components/seguimiento/ReviewSnapshotModal.tsx` — limpiar referencias TWR
- `components/portfolio/PortfolioEvolution.tsx` — limpiar
- `app/api/portfolio/fill-prices/route.ts` — eliminar logica TWR
- `app/api/cron/send-reports/route.ts` — usar retornos periodicos en reportes
- `app/api/clients/[id]/reports/route.ts` — idem
- `app/api/advisor/clients-overview/route.ts` — idem
- `app/(portal)/portal/dashboard/page.tsx` — mostrar retornos periodicos
- `app/(portal)/portal/reportes/page.tsx` — idem
- `app/api/portal/portfolio/route.ts` — servir retornos periodicos
- `app/advisor/clients-overview/page.tsx` — idem
- `scripts/seed-demo-data.ts` — actualizar datos demo
- `app/api/portfolio/dividends/route.ts` — limpiar referencia

**Columnas DB a deprecar (no borrar datos):**
- `portfolio_snapshots.twr_period`
- `portfolio_snapshots.twr_cumulative`
- Dejar de escribirlas en nuevos snapshots. No eliminar columnas para no romper queries existentes.

### 2.2 RLS: tests + tablas faltantes

**Tablas que necesitan RLS:**
1. `client_report_config` — advisor ve solo sus clientes
2. `client_reports` — advisor ve solo sus clientes + cliente ve los suyos
3. `recommendation_versions` — advisor ve solo sus clientes
4. `meetings` — advisor ve solo las suyas
5. `client_interactions` — advisor ve solo sus clientes

**Tests RLS a escribir:**
- Test con anon key: verificar que sin sesion no se puede leer nada
- Test cross-advisor: advisor A no puede leer clientes de advisor B
- Test cross-client: cliente A no puede leer datos de cliente B
- Test manipulacion URL: client_id en query string no bypasea RLS
- Test INSERT cross-client: no se puede insertar mensaje con client_id ajeno

Framework: Vitest + Supabase client con tokens de prueba.

### 2.3 Fusion de endpoints de busqueda

**Estado actual: 7 endpoints**
```
/api/funds/search         — tabla funds (legacy?)
/api/funds/search-alpha   — Alpha Vantage API
/api/fondos/lookup        — fondos_mutuos (CMF)
/api/fondos-inversion/lookup — fondos_inversion (FI)
/api/fondos/search-price  — Bolsa Santiago + Yahoo
/api/fintual/search       — Fintual API
/api/securities/search    — acciones/bonos genericos
```

**Plan:** No fusionar en 1 mega-endpoint. En vez, consolidar por tipo de activo:
- `/api/fondos/lookup` absorbe `funds/search` y `fintual/search` (fondos mutuos chilenos)
- `/api/fondos-inversion/lookup` se mantiene (producto distinto)
- `/api/securities/search` absorbe `funds/search-alpha` y `fondos/search-price` (acciones/ETFs)
- Resultado: 3 endpoints claros en vez de 7

### 2.4 Utilidades duplicadas

**Extraer a `lib/text.ts`:**
- `stripAccents(str)` — de 3 archivos a 1
- `normalizeText(str)` — alias de stripAccents + lowercase
- `detectSerieCode(name)` — unificar las 2 implementaciones

**Extraer a `lib/constants/chilean-finance.ts`:**
- `CHILEAN_AGFS`
- `CHILEAN_TICKERS`
- `AGF_NAME_MAP`

### 2.5 IA: modelo configurable + tracking de uso

**Estado actual:** 3 endpoints usan Claude API directamente:
- `comite/generar-cartera` — genera cartera recomendada (Sonnet 4)
- `clients/[id]/reports` — genera comentario de mercado (Sonnet 4)
- `portfolio/xray-report` — genera radiografia de costos (Sonnet 4)

**Decisiones:**

**Modelo configurable por el asesor:**
- Default: Sonnet 4 (~$0.10/recomendacion)
- Premium: Opus 4 (~$0.53/recomendacion) — mejor razonamiento para decisiones complejas
- UI en perfil del asesor: selector con explicacion de cada modelo
- El modelo elegido se usa en generar-cartera y xray-report
- Reportes periodicos siempre usan Sonnet (son texto, no decisiones)

**Tracking de uso (sin bloqueo):**
```sql
CREATE TABLE advisor_ai_usage (
  advisor_id UUID REFERENCES advisors(id),
  month TEXT,              -- '2026-04'
  tokens_used BIGINT DEFAULT 0,
  cost_usd DECIMAL(10,4) DEFAULT 0,
  calls_count INT DEFAULT 0,
  PRIMARY KEY (advisor_id, month)
);
```
- Cada llamada a Claude incrementa tokens_used, cost_usd, calls_count
- Dashboard del asesor muestra: "Uso IA este mes: $X.XX (N llamadas)"
- Sin bloqueo por saldo — solo visibilidad

**Integracion fondos preferidos en prompt de IA:**
Cuando exista `advisor_preferred_funds`, agregar al prompt de generar-cartera:
```
## FONDOS PREFERIDOS DEL ASESOR
[lista con TAC, categoria, notas]

REGLA: Usa PREFERENTEMENTE fondos de esta lista. Si no hay opcion
adecuada para una clase de activo, sugiere del universo CMF marcando
claramente "FUERA DE LISTA DEL ASESOR".
```
Lista blanda: la IA puede salir de la lista pero lo marca explicitamente.

**Limpiar debug logs en produccion:**
- Eliminar console.error de debug en generar-cartera (lineas 126-135)

### 2.6 Fondos preferidos del asesor (fase 3, no ahora)

```sql
CREATE TABLE advisor_preferred_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID REFERENCES advisors(id),
  fund_run TEXT NOT NULL,         -- RUN del fondo en CMF
  fund_name TEXT,
  category TEXT,
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE,
  UNIQUE(advisor_id, fund_run)
);

-- Modo de seleccion por cliente
ALTER TABLE clients
  ADD COLUMN fund_selection_mode TEXT
  DEFAULT 'all_funds'
  CHECK (fund_selection_mode IN ('only_my_list', 'my_list_with_fallback', 'all_funds'));
```

**Motor:** `findAlternatives(fundId, advisorId, mode)` que respeta el modo:
- `only_my_list` — solo busca en advisor_preferred_funds
- `my_list_with_fallback` — busca primero en lista, si no hay match va a CMF
- `all_funds` — universo CMF completo

---

## 3. Plan de ejecucion

### Fase 1 — BLOQUEANTE para Heraldo — COMPLETADA 2026-04-30

| # | Tarea | Estado |
|---|-------|--------|
| 1.1 | Crear `lib/returns/calculator.ts` + tests (25 tests) | DONE |
| 1.2 | Integrar retornos en API seguimiento (reemplazar TWR) | DONE |
| 1.3 | Integrar retornos en portal dashboard | DONE |
| 1.4 | Integrar retornos en reportes (cron + manual) | DONE |
| 1.5 | Limpiar TWR de snapshots API (dejar de calcular) | DONE |
| 1.6 | Agregar RLS a 5 tablas faltantes (migracion SQL) | DONE |
| 1.7 | Escribir tests RLS (cross-advisor, cross-client) | PENDIENTE (test manual) |
| 1.8 | Validar magic link: test manual de edge cases | PENDIENTE (test manual) |
| 1.9 | Crear tabla advisor_ai_usage + tracking en endpoints IA | DONE |
| 1.10 | Limpiar console.error debug en generar-cartera | DONE |

### Fase 2 — ALTO — COMPLETADA 2026-04-30

| # | Tarea | Estado |
|---|-------|--------|
| 2.0 | Limpiar 31 referencias TWR residuales | DONE |
| 2.1 | Fusionar endpoints de busqueda (7 -> 3) | POSPUESTO a Fase 3 |
| 2.2 | Extraer utilidades duplicadas a lib/ | DONE |
| 2.3 | Agregar audit trail a upload de TAC | DONE |
| 2.4 | UI selector de modelo IA en perfil del asesor | DONE |

### Fase 3 — Features nuevas (sesion separada)

| # | Tarea | Complejidad |
|---|-------|-------------|
| 3.1 | Fondos preferidos del asesor (tabla + UI + motor + prompt IA) | Media |
| 3.2 | Mail al corredor pre-redactado | Baja-media |
| 3.3 | Frecuencia de cuestionario configurable | Baja |
| 3.4 | Vista "Mi dia" / acciones pendientes | Media |
| 3.5 | Comparacion 3 vias (requiere cartera recomendada) | Alta |

---

## 4. Fuera de alcance

- Reescritura de parsers (funcionan bien)
- Push notifications (nice to have, no bloqueante)
- Refactor de CMF (ya es canonico)
- Migracion de datos historicos TWR (se dejan, no se borran)
- Bloqueo por saldo de IA (solo tracking por ahora)
