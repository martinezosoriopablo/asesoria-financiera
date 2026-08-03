# Recomendación / CRM — Fixes de pulido (design)

**Fecha:** 2026-08-03
**Alcance:** chico/mediano. Arreglar 4 detalles de la feature `recomendacion` (el "CRM del asesor" que consume las carteras modelo del comité). NO se construye el pipeline multi-IA (el "consejo" corre afuera y sube un JSON; eso queda fuera de alcance).

## Contexto

La feature `recomendacion` ya existe y funciona end-to-end:
- `/recomendacion/[clientId]` → `RecomendacionTabs`: pestaña **Radiografía** (diagnóstico read-only) + pestaña **Construir recomendación** (tabla de 3 columnas **Comité | Mis Fondos | Decisión**).
- Flujo: `useRecomendacion` → `GET /api/comite/recomendacion` → mapea perfil del cliente a uno de los 5 perfiles modelo, carga la `model_portfolios` más reciente, y por cada posición del comité arma la fila. El asesor edita Decisión + peso y guarda vía `POST /api/comite/aplicar-cartera` (`source:"comite_3col"`) en `clients.cartera_recomendada` + `recommendation_versions`.
- El comité corre **afuera** y produce un JSON que se sube por `ComiteReportsPanel` → `model_portfolios`. **Importante:** el JSON guarda categorías **sin prefijo de rol** (`usa_large_cap`, `ust_belly`, `gold`, `tbills`), mientras que `lib/comite-categories.ts` (`COMITE_CATEGORIES`, `PREFERRED_TO_COMITE`) usa IDs **con prefijo** (`rv_usa_large_cap`, …). El route ya salva ese desfase para la columna Comité con `resolveCategoria`, pero NO para `resolveMisFondos`.

## Los 4 fixes

### Fix 1 — "Mis Fondos" sale vacío (bug principal)

**Causa:** en `app/api/comite/recomendacion/route.ts`, la fila se arma llamando `resolveMisFondos({ categoria: p.categoria, … })` con la categoría **cruda** (sin prefijo). Dentro, `resolve.ts` hace `PREFERRED_TO_COMITE[categoria]` cuyas claves son **con prefijo** → `wantedCategories = []` → la columna solo muestra fondos con `model_fund_mapping` explícito (casi siempre vacía).

**Fix:** normalizar la categoría a su forma canónica **con prefijo** (reusando el mismo `resolveCategoria` que ya usa la columna Comité) y pasar esa forma a `resolveMisFondos`. Cambio puntual en el route; `resolve.ts` no necesita cambiar su firma. Si en el futuro se quiere robustez extra, `resolveMisFondos` podría normalizar internamente, pero la fuente de verdad de normalización queda en el route (un solo lugar).

**Test:** agregar a `lib/recomendacion/resolve.test.ts` un caso donde se pasa una categoría **sin prefijo** y se verifica que, tras normalizar, `resolveMisFondos` devuelve los fondos por `PREFERRED_TO_COMITE` (hoy no hay ningún test con input sin prefijo → por eso el bug pasó).

### Fix 2 — Categoría que se pierde (`rv_small_cap_us`) + red de seguridad

**Causa:** `upload-report` acepta `rv_small_cap_us` como pass-through, pero no existe en `COMITE_CATEGORIES` → `resolveCategoria`/`getCategoryById` devuelve undefined → la fila se **descarta en silencio** → el total queda < 100% sin aviso.

**Fix (dos partes):**
1. **Agregar categoría canónica** `rv_usa_small_cap` a `COMITE_CATEGORIES` (label "RV USA Small Cap", role `rv`, etfUS `IJR`, etfUCITS `null` — no hay small-cap UCITS en el set) + entrada en `PREFERRED_TO_COMITE` (`["RV USA", "RV Internacional"]`) + su mapeo desde el id del JSON (`rv_small_cap_us` → `rv_usa_small_cap`) en `resolveCategoria`/upload. Sumar `IJR` (y secundarios `VB`, `IJH`) al `ETF_TO_CATEGORY` para que la Radiografía también lo clasifique.
2. **Red de seguridad:** si alguna posición del comité NO resuelve a categoría, en vez de descartarla, incluirla en la respuesta del route con una marca `sin_categoria: true` (categoría cruda + peso), y mostrarla en la tabla con un aviso visible ("posiciones sin categoría — revisar"). Así el total nunca da < 100% sin explicación, para `rv_small_cap_us` y para cualquier categoría futura desconocida.

**Test:** unit sobre la normalización (`rv_small_cap_us` → categoría válida) y sobre el camino "sin categoría" (posición desconocida se conserva con la marca, no se pierde).

### Fix 3 — TAC + rentabilidad 12M en el footer

**Causa:** los tipos (`PreferredFundInput`/`MiFondoOption`) ya tienen `tac`/`rent_12m`, pero el route los deja en `null` (comentario explícito). El footer no los muestra y el orden de "Mis Fondos" por menor TAC es no-op.

**Fix:**
1. **Enriquecer** los `advisor_preferred_funds` con TAC + rent 12M reusando la MISMA fuente que ya usa la Radiografía (`/api/portfolio/radiografia` devuelve `rent1m/3m/12m` y TAC por holding: FM desde `vw_fondos_completo`, FI desde su cálculo propio). Se extrae ese enriquecimiento a un helper compartido para no duplicarlo, y el route de recomendación lo usa para poblar `tac`/`rent_12m` de cada fondo preferido (join por `fund_run` FM / `rut`+`serie` FI). Poblar los campos en el route.
2. **Footer:** en `RecomendacionTable.tsx`, calcular y mostrar **TAC ponderado** y **rent 12M ponderada** de la cartera *decidida* (ponderar por el peso de cada fila cuya Decisión sea un fondo con TAC/rent conocido; las filas sin dato — ETF comité / caja — se excluyen del ponderador y se anota la cobertura, ej. "TAC ponderado sobre X% de la cartera").

**Test:** unit del cálculo ponderado (con filas mixtas: algunas con TAC/rent, otras null) verificando que pondera solo sobre las conocidas y reporta la cobertura.

### Fix 4 — Naming Radiografía / Recomendación

**Causa:** el sidebar (`AdvisorSidebar.tsx`) y el `<h1>` de la página selectora (`app/(advisor-shell)/recomendacion/page.tsx`) dicen "Radiografia", aunque la ruta es `/recomendacion` y contiene la pestaña "Construir recomendación".

**Fix:** renombrar el ítem del sidebar y el `<h1>` a **"Recomendación"** (la sección). La pestaña interna "Radiografía" (el diagnóstico) mantiene su nombre en `RecomendacionTabs`. Cosmético, sin cambio de ruta.

## Fuera de alcance (deuda técnica identificada, NO se toca ahora)

- Retirar el doble camino de escritura de `cartera_recomendada` (rama IA legacy `generar-cartera` + `ComparisonModeV2`).
- Migración vieja duplicada (`20260523_model_portfolios.sql` vs `20260526_comite_pipeline.sql`).
- Serie "Recomendado" honesta (subproyecto B): revalorizar los instrumentos reales de la Decisión en `recommended-evolution` (hoy usa proxies genéricos por clase).
- `ticker` null para fondos AGF en `defaultDecision` (usan `fund_run`; la UI ya cae a `fund_run` al click manual; el default guardado puede quedar sin ticker). Se puede sumar si es trivial durante el plan, pero no es objetivo.

## Testing / verificación

- Unit tests nuevos en `resolve.test.ts` (fixes 1, 2, 3) + los existentes deben seguir verdes.
- `npx tsc --noEmit` limpio.
- Verificación manual en preview: con un `model_portfolios` real cargado, abrir `/recomendacion/[clientId]` y confirmar que "Mis Fondos" ya no sale vacío, que el total suma 100% (o avisa), que el footer muestra TAC/rent 12M, y que el naming dice "Recomendación".

## Archivos afectados (estimado)

- `app/api/comite/recomendacion/route.ts` (fixes 1, 2, 3)
- `lib/comite-categories.ts` (fix 2: nueva categoría + mapeo + ETF)
- `lib/recomendacion/resolve.ts` + `types.ts` (fix 2: marca `sin_categoria`; fix 3: helper de ponderado)
- `lib/recomendacion/resolve.test.ts` (tests fixes 1-3)
- `components/recomendacion/RecomendacionTable.tsx` (fix 2: aviso; fix 3: footer TAC/rent)
- `components/layout/AdvisorSidebar.tsx` + `app/(advisor-shell)/recomendacion/page.tsx` (fix 4)
- `app/api/comite/upload-report/route.ts` (fix 2: mapeo de `rv_small_cap_us`, si aplica)
