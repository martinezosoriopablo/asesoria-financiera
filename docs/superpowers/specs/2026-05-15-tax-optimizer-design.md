# Simulador de Cambio de Custodia — Optimizador Tributario

**Fecha:** 2026-05-15
**Estado:** Draft para revisión

---

## 1. Objetivo

Herramienta que calcula la **estrategia óptima de cambio de custodia** (AGF → corredora) para un cliente, considerando el impacto tributario, el ahorro en costos (TAC) y la mayor rentabilidad por reasignación al perfil de riesgo. Todos los cálculos en **UF (términos reales)**.

### Los 3 pilares del valor

| Pilar | Descripción |
|---|---|
| **Eficiencia tributaria** | Minimizar el impuesto por ganancia de capital al cambiar de custodia |
| **Eficiencia en costos** | Menor TAC en fondos propuestos vs actuales |
| **Eficiencia en asignación** | Alinear portafolio al perfil de riesgo → mayor rentabilidad esperada |

---

## 2. Ubicación en la plataforma

**Dos puntos de acceso:**

1. **Resumen en Radiografía** — Nueva sección "Análisis Tributario del Cambio" debajo de la Propuesta de Optimización. Muestra por cada fondo: régimen tributario, ganancia estimada, impuesto, si puede hacer MLT. Incluye tabla resumen de los 3 pilares.

2. **Simulador completo** — Página independiente accesible desde el sidebar (sección Herramientas). Recibe datos del cliente (auto-poblados si viene desde seguimiento) y permite configurar todos los parámetros para generar la estrategia óptima.

---

## 3. Modelo de datos

### 3.1 Constantes tributarias — `lib/constants/chilean-tax.ts`

Extraer de la calculadora APV existente y extender:

```typescript
// Tramos impuesto global complementario (en UF mensuales)
export const TRAMOS_IMPUESTO = [
  { desde: 0, hasta: 13.5, tasa: 0 },
  { desde: 13.5, hasta: 30, tasa: 0.04 },
  { desde: 30, hasta: 50, tasa: 0.08 },
  { desde: 50, hasta: 70, tasa: 0.135 },
  { desde: 70, hasta: 90, tasa: 0.23 },
  { desde: 90, hasta: 120, tasa: 0.304 },
  { desde: 120, hasta: 310, tasa: 0.355 },
  { desde: 310, hasta: Infinity, tasa: 0.40 },
];

// Franquicias tributarias
export const APV_TOPE_ANUAL_UF = 600;       // Tope APV para crédito/rebaja
export const DC_TOPE_ANUAL_UF = 900;        // Tope depósito convenido
export const APV_CREDITO_REGIMEN_A = 0.15;  // 15% crédito fiscal régimen A
export const APV_A_TOPE_MENSUAL_UTM = 6;    // Tope mensual crédito en UTM

// Rentabilidades esperadas reales por clase de activo (en UF, configurables)
export const RENTABILIDAD_ESPERADA_REAL: Record<string, number> = {
  "Renta Variable Nacional": 0.08,
  "Renta Variable Internacional": 0.07,
  "Renta Fija Nacional": 0.03,
  "Renta Fija Internacional": 0.025,
  "Balanceado": 0.05,
  "Alternativos": 0.06,
  "Otros": 0.03,
};
```

### 3.2 Tipo `TaxableHolding`

```typescript
interface TaxableHolding {
  fundName: string;
  run: number;
  serie: string;
  currentValueUF: number;           // valor actual en UF
  quantity: number;                  // cuotas
  acquisitionDate: string | null;    // fecha compra (si se conoce)
  acquisitionCostUF: number | null;  // costo total en UF (si se conoce)
  estimatedCosts: {                  // costos estimados por período
    years: number;                   // 1, 2, 3, 4, 5
    costUF: number;                  // costo estimado en UF
    gainsUF: number;                 // ganancia estimada
  }[];
  taxRegime: '107' | '108' | 'apv' | '57bis' | 'general';
  canMLT: boolean;                   // si se puede MLT al destino
  tacActual: number | null;          // TAC del fondo actual
  tacPropuesto: number | null;       // TAC del fondo destino
  categoria: string;                 // Renta Variable, Renta Fija, etc.
}
```

### 3.3 Inputs del cliente — `TaxSimulatorInputs`

```typescript
interface TaxSimulatorInputs {
  clientId: string;
  ingresoMensualCLP: number;        // ya existe en clients.ingreso_mensual
  edad: number;                      // calc desde clients.fecha_nacimiento
  edadJubilacion: number;            // default 65, editable
  apvUsadoEsteAno: number;           // UF ya usadas, default 0
  dcUsadoEsteAno: number;            // UF ya usadas, default 0
  tasaDescuentoReal: number;          // default 0.035 (3.5% real)
  rentabilidadesEsperadas: Record<string, number>; // override por asesor
  holdings: TaxableHolding[];
  perfilRiesgo: string;              // del cliente, para pilar 3
  puntajeRiesgo: number;             // para benchmark de asignación
}
```

### 3.4 Sin cambios a la BD

No se agregan columnas a `clients`. Los datos adicionales (edad jubilación, APV usado, DC usado, fecha adquisición) son **inputs del simulador por sesión**. Si en el futuro se quieren persistir, se puede agregar una tabla `tax_simulations` — pero no es necesario para v1.

---

## 4. Motor de cálculo — `lib/tax/calculator.ts`

Todas funciones puras, testeables. Todo en UF.

### 4.1 `getTramoMarginal(rentaAnualUF: number)`
→ `{ tasa: number, tramoDesde: number, tramoHasta: number }`

Retorna el tramo marginal del cliente. Usado para calcular impuesto y para determinar régimen APV óptimo.

### 4.2 `getRegimenAPVOptimo(tasaMarginal: number)`
→ `'A' | 'B'`

- Si `tasaMarginal > 0.15` → Régimen B (rebaja base imponible, ahorra más que el crédito 15%)
- Si `tasaMarginal <= 0.15` → Régimen A (crédito fiscal 15% es mejor)

### 4.3 `calcularGananciaCapital(holding: TaxableHolding, selectedYears?: number)`
→ `{ gananciaUF: number, impuestoUF: number, tasaEfectiva: number, exento: boolean, razon: string }`

- Si `taxRegime === '107'` → exento (presencia bursátil)
- Si `taxRegime === 'apv'` → exento (régimen APV)
- Si `canMLT && taxRegime === '108'` → exento (MLT sin pasar por caja)
- Si `ganancia <= 0` → impuesto = 0
- Caso general: `impuesto = ganancia × tasaMarginal`
- Si no hay `acquisitionCostUF`: usar `estimatedCosts[selectedYears]`

### 4.4 `calcularMitigacion(inputs)`
→ `MitigacionResult`

```typescript
interface MitigacionResult {
  regimenAPV: 'A' | 'B';
  aporteAPV_UF: number;              // UF a aportar (tope - usado)
  aporteDC_UF: number;               // UF a aportar (tope - usado)
  ahorroTributarioAPV_UF: number;    // ahorro real en UF
  ahorroTributarioDC_UF: number;     // ahorro real en UF
  ahorroTotal_UF: number;
  impuestoBruto_UF: number;
  impuestoNeto_UF: number;           // bruto - ahorro
}
```

Régimen B: `ahorro = aporte × tasaMarginal`
Régimen A: `ahorroAPV = min(aporte × 0.15, tope)`, `ahorroDC = aporte × tasaMarginal` (DC siempre reduce base)

### 4.5 `simularCostoAdquisicion(run, serie, quantity, añosAtras, preciosHistoricos)`
→ `{ costUF: number, precioUnitario: number, fecha: string }`

Busca precio histórico de la cuota en `fondos_rentabilidades_diarias` hace N años. Convierte a UF con UF histórica de esa fecha. Genera 5 escenarios (1-5 años).

### 4.6 `calcularAhorroTAC(valorUF, tacActual, tacPropuesto, años)`
→ `number` (UF ahorradas acumuladas, compuesto)

```
ahorro = 0
valor = valorUF
for año 1..N:
  costoActual = valor × tacActual/100
  costoPropuesto = valor × tacPropuesto/100
  ahorro += costoActual - costoPropuesto
  valor *= (1 + rentabilidadEsperada)  // el portafolio crece
return ahorro
```

### 4.7 `vpnReal(flujos: {año: number, montoUF: number}[], tasaReal: number)`
→ `number` (UF)

VPN estándar con tasa de descuento real. Como todo está en UF, no hay ajuste por inflación.

### 4.8 `calcularAlphaPorReasignacion(inputs)`
→ `AlphaResult`

```typescript
interface AlphaResult {
  asignacionActual: Record<string, number>;   // % por categoría
  asignacionObjetivo: Record<string, number>;  // % según perfil
  rentabilidadEsperadaActual: number;          // % real anual
  rentabilidadEsperadaPropuesta: number;       // % real anual
  deltaRentabilidad: number;                   // % diferencia
  impacto5Y_UF: number;                        // UF adicionales a 5 años
  impacto10Y_UF: number;                       // UF adicionales a 10 años
  impacto20Y_UF: number;                       // UF adicionales a 20 años
}
```

Usa `RENTABILIDAD_ESPERADA_REAL` (configurable) y el benchmark de asignación según `puntajeRiesgo` (ya existe en `lib/risk/benchmarks.ts`).

---

## 5. Los 4 escenarios — `lib/tax/scenarios.ts`

Cada escenario retorna un `ScenarioResult`:

```typescript
interface ScenarioResult {
  nombre: string;
  descripcion: string;
  impuestoTotal_UF: number;
  ahorroTAC_10Y_UF: number;
  alphaReasignacion_10Y_UF: number;
  costoNetoVPN_UF: number;            // VPN del costo total (menor = mejor)
  beneficioNetoVPN_UF: number;        // ahorro TAC + alpha - impuestos
  puntoEquilibrioAnos: number | null;  // cuándo se recupera el impuesto
  planAnual: YearPlan[];
  recomendado: boolean;
}

interface YearPlan {
  año: number;
  fondosAVender: { fundName: string; porcentaje: number; gananciaUF: number; impuestoUF: number }[];
  fondosMLT: { fundName: string; destinoFund: string }[];
  mitigacion: MitigacionResult;
  tacPagado_UF: number;               // TAC ese año (mezcla viejo + nuevo)
  alphaGanado_UF: number;             // alpha por reasignación parcial
}
```

### Escenario A — Vender todo hoy

Año 0: vender todo, aplicar APV-B + DC. Años 1..jubilación: TAC propuesto + alpha completo.

### Escenario B — Salida escalonada óptima

Algoritmo greedy:
1. Clasificar fondos: exentos primero (MLT, 107, ganancia ≤ 0), luego por ganancia ascendente
2. Cada año: vender hasta llenar el espacio en el tramo actual (`topeTramo - rentaTrabajo`)
3. Aplicar APV-B + DC cada año
4. Fondos no migrados pagan TAC actual, migrados pagan TAC propuesto
5. Alpha proporcional al % ya migrado

### Escenario C — Mantener hasta jubilación

Años 1..N: TAC actual, sin alpha por reasignación (mantiene asignación subóptima).
Año jubilación: vender todo a tramo de jubilado (ingreso 0 o pensión baja → tramo 0-4%).

### Escenario D — Híbrido inteligente

Año 0:
- MLT todo lo que se puede (108 LIR entre fondos) → impuesto 0
- Vender fondos con ganancia ≤ 0 → impuesto 0
- Vender fondos 107 LIR (presencia bursátil) → impuesto 0
- Aplicar APV-B + DC

Años 1..N: escalonado para el resto (algoritmo de Escenario B).

---

## 6. UI — Resumen en Radiografía

Nueva sección en `RadiografiaCartola.tsx` después de la Propuesta de Optimización.

### 6.1 Mapa tributario (tabla)

Por cada holding:
| Fondo | Valor (UF) | Régimen | Gan. Capital (UF) | Impuesto (UF) | MLT | Acción |
|---|---|---|---|---|---|---|
| Banchile RV Latam Serie A | 4.200 | General | 800 | 320 | No | Escalonado |
| Singular IPSA ETF | 2.100 | 107 LIR | 350 | 0 | No | Vender hoy |
| Moneda RF Serie APV | 1.800 | APV | 200 | 0 | Sí | MLT |

### 6.2 Tabla de 3 pilares (resumen)

| Pilar | Impacto 10Y (UF) |
|---|---|
| Menor TAC | +X |
| Mayor rentabilidad (reasignación) | +Y |
| **Beneficio bruto** | **+X+Y** |
| Costo tributario (mejor escenario) | -Z |
| **Beneficio neto** | **+W** |

### 6.3 Botón "Ver simulador completo →"

Navega a la página del simulador con datos pre-poblados.

---

## 7. UI — Simulador completo (página independiente)

Ruta: `/tax-optimizer` (dentro de `app/(advisor-shell)/`)

### 7.1 Panel izquierdo: Inputs

- **Datos del cliente** (auto-poblados si viene de seguimiento):
  - Ingreso mensual → tramo marginal (calculado, mostrado)
  - Edad → años a jubilación
  - Edad jubilación (editable, default 65)

- **Franquicias disponibles**:
  - APV usado este año (UF)
  - DC usado este año (UF)
  - Régimen APV recomendado (auto, con explicación)

- **Fecha de adquisición**:
  - Selector: "Conozco las fechas" → inputs por fondo
  - Selector: "Estimar" → slider 1-5 años atrás (aplica a todos)
  - Selector: "Por fondo" → cada fondo tiene su estimación

- **Parámetros del modelo**:
  - Tasa de descuento real (default 3.5%)
  - Rentabilidades esperadas por clase (editables, defaults predefinidos)

### 7.2 Panel central: Resultados

**Tabla comparativa de escenarios:**

| | A: Todo hoy | B: Escalonado | C: Mantener | D: Híbrido |
|---|---|---|---|---|
| Impuesto total (UF) | 5.400 | 3.800 | 1.200 | 2.100 |
| Ahorro TAC 10Y (UF) | 2.720 | 2.500 | 0 | 2.650 |
| Alpha reasignación 10Y (UF) | 9.400 | 8.100 | 0 | 9.000 |
| **Beneficio neto VPN (UF)** | 6.720 | 6.800 | -1.200 | **9.550** ← |
| Punto de equilibrio | 2.1 años | 2.4 años | nunca | 1.8 años |

El escenario recomendado se destaca visualmente.

**Plan de acción del escenario recomendado:**

Timeline visual año por año:
- Año 1: "Mover vía MLT: Fondo X, Y. Vender (exento): Fondo Z. Aportar APV-B: 600 UF. DC: 900 UF."
- Año 2: "Vender Fondo W (ganancia baja). APV-B: 600 UF."
- Año 3: "Vender resto. Portafolio 100% migrado."

### 7.3 Panel derecho: Detalle por fondo

Tabla expandible mostrando por cada fondo:
- Valor actual, costo estimado, ganancia, régimen, acción recomendada
- En qué año se recomienda venderlo y por qué

### 7.4 Generación de informe

Botón "Generar informe para cliente" → Claude genera un documento en español formal explicando:
- Situación actual del cliente
- Estrategia recomendada con los 3 pilares cuantificados
- Plan paso a paso
- Disclaimers (rentabilidades esperadas son supuestos, no promesas)

---

## 8. API Routes

### `POST /api/tax/simulate`

Input: `TaxSimulatorInputs`
Output: `{ scenarios: ScenarioResult[], recommended: 'A'|'B'|'C'|'D', taxMap: TaxableHolding[] }`

Lógica:
1. Convertir todo a UF (usando UF del día, BCCH)
2. Si no hay costos de adquisición → simular con precios históricos
3. Clasificar régimen tributario de cada fondo (usando fichas: `beneficio_107lir`, `beneficio_108lir`, `beneficio_apv`, `beneficio_57bis`)
4. Determinar `canMLT` por fondo (lógica: si destino es fondo mutuo/FI en AGF y hay convenio, sí; si destino es ETF en bolsa, no)
5. Ejecutar los 4 escenarios
6. Calcular alpha por reasignación
7. Retornar todo

### `POST /api/tax/report`

Input: `{ simulatorInputs, selectedScenario, clientName }`
Output: `{ report: string }` (markdown generado por Claude)

---

## 9. Reglas tributarias implementadas

### Art. 107 LIR — Presencia bursátil
- Aplica a: ETFs y acciones con presencia bursátil en bolsa chilena
- Efecto: ganancia de capital **exenta** de impuesto
- Detección: flag `beneficio_107lir` en `fund_fichas`/`fi_fichas`
- En el simulador: estos fondos se pueden vender sin costo tributario

### Art. 108 LIR — Reinversión en fondos
- Aplica a: rescate de cuotas de fondos mutuos/FI reinvertidas en otros fondos mutuos/FI
- Efecto: ganancia de capital **diferida** (no se paga hasta el rescate final)
- Requisito: reinversión directa, sin que el partícipe reciba el dinero → **MLT**
- Detección: flag `beneficio_108lir` en fichas
- Limitación clave: **NO funciona si el destino es un ETF comprado en bolsa** (es transacción bursátil, no suscripción). SÍ funciona entre fondos mutuos/FI vía suscripción.

### MLT — Mecanismo de Liquidación y Traspaso
- Regulado por NCG 365 CMF
- Funciona: AGF → misma AGF, AGF → otra AGF (con convenio), fondo mutuo ↔ fondo de inversión
- NO funciona: AGF → ETF en bolsa (compra en mercado secundario ≠ suscripción)
- El simulador marca `canMLT = true` solo cuando el destino es un fondo (no ETF en bolsa)

### APV — Ahorro Previsional Voluntario
- Régimen A: crédito fiscal 15% del aporte (tope 6 UTM/mes). Conviene si tramo ≤ 15%.
- Régimen B: rebaja base imponible. Ahorro = aporte × tasa marginal. Conviene si tramo > 15%.
- Tope: 600 UF/año
- **Para clientes de alto patrimonio: casi siempre Régimen B.**

### Depósito Convenido
- Empleador deposita a nombre del trabajador en cuenta de ahorro previsional
- Rebaja base imponible (mismo efecto que APV-B)
- Tope: 900 UF/año
- Tope conjunto APV + DC: no hay tope legal conjunto, pero el efecto tributario tiene límites prácticos

### Estrategia de mitigación
Ante una ganancia de capital por venta de fondos:
1. Aportar APV-B por 600 UF → reduce base imponible → ahorra hasta 240 UF de impuesto (tramo 40%)
2. Aportar DC por 900 UF → reduce base imponible → ahorra hasta 360 UF de impuesto
3. Total mitigación máxima: hasta 600 UF de ahorro tributario por año

---

## 10. Supuestos y disclaimers

- Las rentabilidades esperadas son **supuestos del asesor, no promesas**. Se muestran explícitamente en el informe.
- La simulación de fecha de adquisición usa precios históricos reales de la BD, pero puede no reflejar el precio exacto de compra.
- El análisis MLT asume que no hay convenio AGF↔corredora para ETFs en bolsa. Si el asesor sabe que existe un convenio específico, puede marcar fondos como `canMLT = true` manualmente.
- Tramos de impuesto pueden cambiar con reformas tributarias. Las constantes son editables.
- Todo cálculo en UF (términos reales). Se muestra equivalente CLP como referencia usando UF del día.

---

## 11. Archivos a crear/modificar

### Nuevos:
- `lib/constants/chilean-tax.ts` — constantes tributarias y rentabilidades esperadas
- `lib/tax/calculator.ts` — funciones puras de cálculo (4.1-4.8)
- `lib/tax/scenarios.ts` — los 4 escenarios (5.x)
- `app/api/tax/simulate/route.ts` — API del simulador
- `app/api/tax/report/route.ts` — API generación informe
- `app/(advisor-shell)/tax-optimizer/page.tsx` — página del simulador
- `components/tax/TaxSimulator.tsx` — componente principal del simulador
- `components/tax/ScenarioTable.tsx` — tabla comparativa de escenarios
- `components/tax/TaxMap.tsx` — mapa tributario por fondo
- `components/tax/ActionPlan.tsx` — timeline de plan de acción

### Modificar:
- `components/seguimiento/RadiografiaCartola.tsx` — agregar sección resumen tributario
- `components/shared/AdvisorSidebar.tsx` — agregar link al simulador
- `lib/constants/chilean-finance.ts` — mover/compartir constantes si aplica

---

## 12. Fuera de alcance (v1)

- Persistir simulaciones en BD (se puede agregar después)
- Integración directa con AGFs para ejecutar MLT
- Cálculo de impuesto diferido multi-año en fondos 108 (se simplifica a exento para el traspaso)
- Art. 57 bis (derogado, solo saldos vigentes — demasiado edge case para v1)
- Simulación de cambios en la legislación tributaria
