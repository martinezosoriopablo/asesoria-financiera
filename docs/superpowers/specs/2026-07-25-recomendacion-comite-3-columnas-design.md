# Diseño — Recomendación por comité (vista de 3 columnas)

**Fecha:** 2026-07-25
**Sub-proyecto:** A de 3 (A: vista Recomendación · B: serie honesta + toggle benchmark · C: Portfolio Designer → "Mi Benchmark")
**Estado:** propuesta para revisión

---

## 1. Contexto y problema

Hoy conviven **dos "recomendaciones" que no se cruzan**:

- **Comité estructurado — `model_portfolios`** ("carteras JSON"): por perfil (5), con instrumentos reales por categoría (`etf_us`, `etf_ucits`, `modelo_pct`, `bench_pct`, `delta_pp`, `vista` OW/UW, `conviction`). Se sube con `POST /api/comite/upload-report` (`report_type: portfolio_recommendation`). Hoy alimenta **solo la Radiografía**. El reporte HTML "árbol" (`comite_reports`) es la versión narrativa de esta doctrina.
- **Recomendación del cliente — `clients.cartera_recomendada`**: array `{clase, ticker, nombre, porcentaje}`, editable por el asesor (ComparisonModeV2). Hoy se genera con IA usando los HTML del comité como *contexto* + el **benchmark del perfil de riesgo** para los pesos — **NO** se deriva de la cartera-modelo estructurada del comité.

La serie "Recomendado" de Seguimiento (`recommended-evolution`) lee `cartera_recomendada` pero **la colapsa a 4 clases y la mapea a proxies genéricos** (ACWI/AGG/GLD/UF), botando los instrumentos reales. En la práctica es un **benchmark por perfil de riesgo**, no la recomendación real.

**Meta del asesor** (la parte más importante del trabajo): la recomendación de un cliente debe **nacer del comité** (los pesos + el ETF/acción por categoría), **compararse con "Mis Fondos"** (porque el cliente está en una AGF/custodio específico y muchas veces no puede acceder al ETF del comité), y terminar en una **decisión editable por el asesor**. Esa decisión es la recomendación real que debe alimentar la serie.

## 2. Alcance

**Este spec cubre solo el sub-proyecto A:** la **vista "Recomendación"** — una tabla de 3 columnas (Comité · Mis Fondos · Decisión) que construye la recomendación de un cliente a partir del modelo del comité y la guarda enriquecida en `clients.cartera_recomendada`.

**Fuera de alcance (specs siguientes):**
- **B** — que `recommended-evolution` revalorice los instrumentos reales de la Decisión, que el proxy genérico pase a ser un **benchmark de mercado**, y el **toggle de benchmark** (UF+2% ↔ proxy) en RetornosComparados.
- **C** — retirar la pestaña "Comparación" de Portfolio Designer (redirect a esta vista), moverlo a Herramientas y evolucionarlo a "Mi Benchmark" del asesor (3ª opción del toggle de B).
- Cálculo de compra/venta (rebalanceo) contra los holdings actuales: eso ya lo hace la Radiografía; esta vista construye el **target**, no las órdenes.

## 3. Modelo de datos: `cartera_recomendada` enriquecida

Se **enriquece por posición** para trazabilidad y para poder re-abrir la vista, manteniendo **compatibilidad hacia atrás** con los consumidores actuales (que leen `cartera[]` con `{ticker, nombre, clase, porcentaje}`).

```jsonc
{
  // --- NUEVO: metadatos de la construcción ---
  "source": "comite_3col",              // distingue de las recomendaciones IA/manuales previas
  "comite_report_date": "2026-06-09",   // report_date de model_portfolios usado
  "perfil_modelo": "moderado_agresivo", // resultado de mapClientProfile(perfil_cliente)
  "custodios": ["agf", "internacional"],// custodios del cliente considerados
  "posiciones": [
    {
      "categoria": "rv_usa_large_cap",       // id de COMITE_CATEGORIES
      "comite": { "etf_us": "VOO", "etf_ucits": "CSPX", "modelo_pct": 22,
                  "vista": "UW", "conviction": "MEDIA" },
      "mi_fondo": { "fund_id": "…", "fund_run": 9226, "ticker": "…",
                    "nombre": "…", "custodian_type": "agf" } | null,
      "decision": {
        "fuente": "mi_fondo" | "comite_etf" | "custom" | "caja",
        "ticker": "…", "nombre": "…", "clase": "Renta Variable",
        "custodian_type": "agf", "porcentaje": 22
      }
    }
  ],

  // --- COMPAT: los consumidores actuales siguen leyendo esto ---
  "cartera": [ { "clase": "Renta Variable", "ticker": "…", "nombre": "…", "porcentaje": 22 } ],

  // metadatos existentes que aplicar-cartera ya guarda
  "resumenEjecutivo": "…", "cliente": { … }, "generadoEn": "…",
  "aplicadoEn": "…", "aplicadoPor": "…"
}
```

- `cartera[]` se **deriva** de `posiciones[].decision` al guardar (una entrada por decisión con instrumento real). Así B (la serie) y el resto leen instrumentos reales sin conocer la estructura nueva.
- `clase` de cada decisión se deriva del `role` de la categoría (`rv→Renta Variable`, `rf→Renta Fija`, `alt→Alternativos`, `cash→Cash`).
- Se **versiona** en `recommendation_versions` como hoy (vía `aplicar-cartera`), guardando el objeto completo (incluida la estructura enriquecida).

## 4. Flujo de la vista

Ruta nueva **`/recomendacion`** (standalone con `ClientSelector`, mismo patrón que `/seguimiento`), y accesible desde el detalle del cliente. Ítem en el sidebar (Principal).

1. **Elegir cliente** → se detecta su **perfil de riesgo** (`risk_profiles` más reciente / `clients.perfil_riesgo`) y se mapea con `mapClientProfile()` a uno de los 5 perfiles del comité.
2. Se detecta el/los **custodios del cliente** (ver §6). Si hay más de uno, un selector arriba permite filtrar.
3. Se carga la **cartera-modelo** de ese perfil (`model_portfolios` del `report_date` más reciente): `posiciones[]` con categoría + `etf_us/etf_ucits` + `modelo_pct` + `vista` + `conviction`.
4. **Tabla por categoría** con 3 columnas (§5).
5. Al pie: **suma de pesos** (debe = 100%, con validación visual), resumen por rol **RV/RF/Alt/Caja**, y (reusando la Radiografía) **TAC ponderado** y rentabilidad 12M ponderada de la Decisión.
6. **Guardar** → `POST /api/comite/aplicar-cartera` (extendido) escribe `cartera_recomendada` enriquecida + `cartera[]` derivada + versión.

## 5. Resolución de las 3 columnas

Por cada `posicion` del modelo del comité (una fila por categoría con `modelo_pct > 0`):

**Col 1 — Comité** (solo lectura): `label` de la categoría (`COMITE_CATEGORIES`), `modelo_pct`, instrumento (`etf_us` / `etf_ucits`), badge de `vista` (OW/UW/N) y `conviction`. `delta_pp` vs bench como dato secundario.

**Col 2 — Mis Fondos** (sugerencia): el fondo del asesor disponible para esa categoría **en el custodio del cliente**:
1. **Mapeo explícito confirmado:** `model_fund_mapping` where `advisor_id + categoria + custodian_type(cliente)` → `advisor_preferred_funds`.
2. **Sugerencia:** si no hay mapeo, buscar en `advisor_preferred_funds` where `category ∈ PREFERRED_TO_COMITE[categoria]` **y** `custodian_type = custodio del cliente`. Badge **"MI FONDO"**. Si hay varios, se listan (el mejor por TAC/rent arriba).
3. **Sin equivalente:** si no hay fondo del asesor en ese custodio → estado "sin equivalente" + buscador manual (reusa el buscador de `XrayProposalTable` / `/api/fondos/search-price`).

**Col 3 — Decisión** (editable): instrumento final + **peso editable** (default = `modelo_pct`). Regla de default de `fuente`:
- Custodio **internacional / corredora** (puede comprar ETFs de bolsa) → default = **ETF del comité** si no hay un Mi Fondo mejor.
- Custodio **AGF** → default = **Mi Fondo** si existe; si no, "sin equivalente" y el asesor decide: buscar otro, forzar el ETF del comité, o mandar el peso a **caja**.
- El asesor siempre puede sobre-escribir (buscar cualquier instrumento). Cambios se marcan visualmente (patrón de override de la Radiografía).

## 6. Custodio del cliente

- Se obtiene de los **`custodian_type` distintos** presentes en los `portfolio_snapshots` del cliente (fuente ya usada por la Radiografía). Valores: `agf | corredora | internacional`.
- **Un custodio:** la vista filtra Mis Fondos a ese custodio directamente.
- **Varios custodios:** selector arriba (multi u opción por custodio); por defecto se consideran todos y cada decisión guarda su `custodian_type`.
- **Sin custodio detectable:** se pide elegirlo manualmente (fallback), o se asume `internacional` (acceso a ETFs) con aviso.

## 7. Guardado y versionado

- `POST /api/comite/aplicar-cartera` se **extiende** para aceptar el payload enriquecido (`source: "comite_3col"`, `posiciones[]`, `comite_report_date`, etc.), derivar `cartera[]`, y seguir versionando en `recommendation_versions` + `clients.cartera_recomendada`.
- Se elimina el segundo camino de escritura directa desde el browser (el de `ComparisonModeV2.saveCartera`) como parte del sub-proyecto C (que retira esa pestaña). En A no se toca ComparisonModeV2.

## 8. Qué se reusa (no reinventar)

- **`lib/comite-categories.ts`**: `COMITE_CATEGORIES` (14 categorías), `mapClientProfile()`, `PREFERRED_TO_COMITE`, `classifyHolding` (si se muestra la comparación con holdings actuales, opcional).
- **`model_portfolios`** (Col 1) y **`model_fund_mapping` / `advisor_preferred_funds`** (Col 2) — mismas tablas y patrón que `radiografia/route.ts:340–503`.
- **Buscador de fondos con badge "MI FONDO"** y override por fila: patrón de `components/seguimiento/XrayProposalTable.tsx`; endpoint `/api/fondos/search-price`.
- **`ClientSelector`** (`components/shared/ClientSelector`).
- **Resumen de costo/rentabilidad** (TAC ponderado, rent 12M): lógica de `useXrayProposal` / `XrayProposalTable`.
- **`aplicar-cartera` + `recommendation_versions`** para guardar/versionar.

## 9. Casos borde y reglas

- **Cliente sin perfil de riesgo:** se pide completar el perfil antes (link a Cartola & Riesgo); no se puede mapear a un modelo.
- **Sin `model_portfolios` para el perfil/fecha:** aviso "no hay cartera del comité cargada para este perfil"; link a subir el JSON del comité (ComiteReportsPanel).
- **Categoría sin `etf_us`/`etf_ucits`** (ej. `rf_chile`, `rv_chile` sin UCITS): la Col 1 puede no tener ETF; la Decisión se apoya en Mi Fondo o custom.
- **Suma de pesos ≠ 100%:** validación visual (no se puede guardar hasta cuadrar, con tolerancia ±0.5pp) y botón "normalizar".
- **Categorías con `modelo_pct = 0`:** se ocultan por defecto (toggle "mostrar todas").

## 10. Testing

- **Unit** (`lib/`): derivación de `cartera[]` desde `posiciones[].decision`; regla de default de `fuente` por custodio; resolución Col 2 (mapeo explícito → sugerencia por `PREFERRED_TO_COMITE` + custodio → sin equivalente). Estas se extraen a funciones puras testeables (p. ej. `lib/recomendacion/resolve-columns.ts`).
- **Integración/E2E** (preview): cliente con perfil + `model_portfolios` cargado → la tabla muestra las 3 columnas correctas; guardar produce `cartera_recomendada` con `posiciones[]` + `cartera[]` coherentes y versión nueva.

## 11. Dependencias hacia B y C

- **B** consumirá `cartera_recomendada.cartera[]` (instrumentos reales) para la serie; por eso `cartera[]` debe quedar bien derivada en A.
- **C** (Mi Benchmark) es independiente de A salvo por el toggle de B; no bloquea A.

## 12. Decisiones resueltas y verificación

Confirmado con el asesor (2026-07-25):

1. **Holdings actuales:** la vista **no** duplica los holdings del cliente. Solo un **enlace a la Radiografía** para el contexto de compra/venta. Esta vista construye el *target*.
2. **Selector de custodio: multi.** Se consideran todos los custodios del cliente a la vez; **cada decisión guarda su `custodian_type`**. El selector permite filtrar la vista por custodio pero la recomendación es una sola.
3. **Caja permitida:** cuando no hay equivalente en la AGF, la Decisión puede **mandar el peso a caja** (además de forzar el ETF del comité o buscar otro instrumento).

**Verificación pendiente en implementación (no bloquea el diseño):** confirmar que `portfolio_snapshots.custodian_type` está poblado de forma confiable para los clientes existentes; si no, aplica el fallback manual de §6 (elegir custodio a mano / asumir `internacional` con aviso).
