# Simulador de Cambio de Custodia — Optimizador Tributario

**Fecha:** 2026-05-15
**Estado:** Revisado — pendiente aprobación usuario

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
export const ART107_TASA_UNICA = 0.10;      // 10% impuesto único (Ley 21.420, sept 2022)
export const ART104_TASA_UNICA = 0.04;      // 4% impuesto único instrumentos de deuda
export const EXENCION_NO_HABITUAL_UTA = 10; // 10 UTA exención anual (Art. 17 N°8)
export const EXENCION_RENTAS_CAPITAL_UTM = 30; // 30 UTM exención (Art. 57)

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
  taxRegime: '107' | '108' | '104' | 'apv' | '57bis' | 'general';
  preTransitional: boolean;          // adquirido antes del 2 sept 2022 (para disposición transitoria Art. 107)
  closingPrice20211231UF?: number;   // precio cierre 31/12/2021 en UF (para disposición transitoria)
  canMLT: boolean;                   // si se puede MLT al destino (rescate + reinversión, Art. 108 = diferido)
  canDCV: boolean;                   // si se puede traspasar custodia pura vía DCV (sin rescate = sin hecho gravado)
  comisionRescateUF: number | null;  // comisión de rescate anticipado (si aplica, ej. permanencia mínima no cumplida)
  tacActual: number | null;          // TAC del fondo actual
  tacPropuesto: number | null;       // TAC del fondo destino
  categoria: string;                 // Renta Variable, Renta Fija, etc.
  hasInternationalHoldings: boolean; // para aviso Art. 41 A
  confianzaBaja: boolean;            // true si el costo de adquisición es estimado, no real
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
  esInversionistaHabitual: boolean;  // default false. Si false, aplica exención 10 UTA (Art. 17 N°8)
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

### 4.3 `calcularImpuestoAnual(holdings: TaxableHolding[], rentaTrabajoAnualUF, esHabitual, selectedYears?)`
→ `{ porHolding: HoldingTaxResult[], totalImpuesto: number, detalleCalculo: string[] }`

**Importante**: El impuesto se calcula a nivel anual (no por holding individual), porque:
- Las pérdidas compensan ganancias del mismo año (tax-loss harvesting)
- Las ganancias de régimen general se suman a la renta del trabajo y pueden empujar al cliente a un tramo superior
- La exención de 10 UTA (Art. 17 N°8) es un monto global anual, no por instrumento

**Algoritmo:**

1. **Separar por régimen**: DCV puro (sin hecho gravado), Art. 107 (10% único, se calcula aparte), APV (exento), MLT/108 (diferido), General
2. **Art. 107**: Para cada holding 107:
   - Si `preTransitional` y hay `closingPrice20211231UF` → usar como costo de adquisición
   - `impuesto107 = ganancia × 0.10` (impuesto único, no suma a renta)
3. **Régimen General — neteo de pérdidas**:
   - Sumar todas las ganancias de holdings de régimen general
   - Restar todas las pérdidas de holdings de régimen general
   - `gananciaNetaGeneral = max(0, sumaGanancias - sumaPerdidas)`
   - Las pérdidas solo compensan ganancias del mismo año (no se arrastran en v1)
4. **Art. 17 N°8 (10 UTA)**: Si `!esHabitual`:
   - `gananciaNetaGeneral -= min(gananciaNetaGeneral, 10 UTA en UF)`
   - La exención se consume primero contra las ganancias más altas para maximizar beneficio
5. **Efecto salto de tramo**: La ganancia neta se suma a la renta del trabajo:
   - `rentaImponibleTotal = rentaTrabajoAnualUF + gananciaNetaGeneral`
   - Calcular impuesto sobre `rentaImponibleTotal` usando tabla progresiva
   - Restar impuesto que ya pagó por renta del trabajo: `impuestoAdicional = impuesto(total) - impuesto(soloTrabajo)`
   - Esto captura correctamente el efecto de saltar de tramo
6. **Si no hay `acquisitionCostUF`**: usar `estimatedCosts[selectedYears]` y marcar resultado como `confianzaBaja = true`

### 4.4 `calcularMitigacion(inputs)`
→ `MitigacionResult`

```typescript
interface MitigacionResult {
  regimenAPV: 'A' | 'B';
  aporteAPV_UF: number;              // UF a aportar (tope - usado)
  aporteDC_UF: number;               // UF a aportar (tope - usado)
  ahorroTributarioAPV_UF: number;    // ahorro real en UF
  ahorroTributarioDC_UF: number;     // ahorro real en UF
  compensacionPerdidas_UF: number;   // pérdidas neteadas contra ganancias
  exencion17N8_UF: number;           // monto de 10 UTA usado
  ahorroTotal_UF: number;            // APV + DC + pérdidas + 17N8
  impuestoBruto_UF: number;          // antes de mitigaciones
  impuestoNeto_UF: number;           // bruto - ahorro total
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
  fondosAVender: { fundName: string; porcentaje: number; gananciaUF: number; impuestoUF: number; regimen: string }[];
  fondosConPerdida: { fundName: string; perdidaUF: number }[];  // vendidos para compensar
  fondosMLT: { fundName: string; destinoFund: string; comisionRescateUF: number }[];
  compensacionPerdidas_UF: number;     // pérdidas neteadas contra ganancias
  exencion17N8_UF: number;             // monto de 10 UTA usado este año
  rentaImponibleConGanancias_UF: number; // renta trabajo + ganancias netas (para ver salto de tramo)
  tramoResultante: number;              // tasa marginal después de sumar ganancias
  mitigacion: MitigacionResult;
  comisionesRescate_UF: number;        // total comisiones de rescate del año
  tacPagado_UF: number;               // TAC ese año (mezcla viejo + nuevo)
  alphaGanado_UF: number;             // alpha por reasignación parcial
}
```

### Escenario A — Vender todo hoy

Año 0: vender todo, aplicar APV-B + DC. Años 1..jubilación: TAC propuesto + alpha completo.

### Escenario B — Salida escalonada óptima

Algoritmo greedy:
1. Clasificar fondos: MLT primero (diferido), luego 107 (10% único), luego pérdidas (para compensar), luego ganancia ascendente
2. Cada año:
   a. Mover todo lo que se puede vía MLT (diferido, sin impuesto hoy)
   b. Vender fondos 107 (10% único, siempre conviene no esperar si hay ahorro TAC)
   c. Vender fondos con pérdida (generan "crédito" para compensar ganancias del mismo año)
   d. Vender fondos de régimen general hasta llenar el espacio en el tramo actual:
      - `espacioTramo = topeTramoActual - rentaTrabajo`
      - Descontar exención 10 UTA si no es habitual (consume el monto global una vez al año)
      - Netear pérdidas vendidas en paso (c) contra ganancias
      - Vender hasta que `gananciaNetaAcumulada ≤ espacioTramo`
   e. Aplicar APV-B + DC para reducir base imponible
3. Fondos no migrados pagan TAC actual, migrados pagan TAC propuesto
4. Alpha proporcional al % ya migrado
5. Comisiones de rescate (`comisionRescateUF`) se restan del beneficio neto del año

### Escenario C — Mantener hasta jubilación

Años 1..N: TAC actual, sin alpha por reasignación (mantiene asignación subóptima).
Año jubilación: vender todo a tramo de jubilado (ingreso 0 o pensión baja → tramo 0-4%).

### Escenario D — Híbrido inteligente

Año 0 — orden de prioridad (menor costo tributario primero):
1. **DCV puro** (`canDCV = true`) → traspasar custodia sin rescate → **impuesto 0, sin diferimiento**
2. **MLT** (`canMLT = true`) → rescate + reinversión Art. 108 → **impuesto diferido**. Descontar `comisionRescateUF` si aplica.
3. **Fondos con pérdida** → vender → impuesto 0, genera saldo para compensar ganancias
4. **Fondos 107 LIR** → vender → impuesto 10% único. Usar precio transitorio 31/12/2021 si aplica.
5. **Fondos régimen general** con ganancia baja → vender neteando contra pérdidas del paso 3
6. Aplicar exención 10 UTA global si no es habitual (Art. 17 N°8)
7. Calcular impuesto sobre `rentaTrabajo + gananciaNetaGeneral` (captura salto de tramo)
8. Aplicar APV-B + DC para mitigar el impuesto resultante

Años 1..N: escalonado para el resto (algoritmo de Escenario B).

---

## 6. UI — Resumen en Radiografía

Nueva sección en `RadiografiaCartola.tsx` después de la Propuesta de Optimización.

### 6.1 Mapa tributario (tabla)

Por cada holding:
| Fondo | Valor (UF) | Régimen | Gan. Capital (UF) | Impuesto (UF) | MLT | Acción |
|---|---|---|---|---|---|---|
| Banchile RV Latam Serie A | 4.200 | General | 800 | 320 | No | Escalonado |
| Singular IPSA ETF | 2.100 | 107 LIR (10%) | 350 | 35 | No | Vender hoy |
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

### 7.4 Indicadores de confianza y avisos

**Warning de estimación**: Si algún holding tiene `confianzaBaja = true` (costo de adquisición estimado), se muestra un banner amarillo:
> "El costo de adquisición de X fondos es estimado a partir de precios históricos. El beneficio neto real puede diferir significativamente. Solicite al cliente los valores de compra originales para mayor precisión."

El banner aparece tanto en la tabla de escenarios como en el informe generado.

**Banner de reforma 2026**: Si hay holdings Art. 107, se muestra un banner azul prominente:
> "Reforma tributaria en discusión: Existe un proyecto de ley que podría eliminar el impuesto del 10% sobre ganancias con presencia bursátil (Art. 107). Si se aprueba, los fondos con este régimen podrían venderse sin impuesto. Considere este factor al decidir el timing de venta. Cálculos basados en ley vigente (10%)."

### 7.5 Generación de informe

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

### Art. 107 LIR — Presencia bursátil (10% impuesto único)
- Aplica a: ETFs y acciones con presencia bursátil en bolsa chilena
- Efecto: ganancia de capital gravada con **impuesto único del 10%** (Ley 21.420, vigente desde sept 2022). **NO es exenta.**
- Detección: flag `beneficio_107lir` en `fund_fichas`/`fi_fichas`
- En el simulador: estos fondos pagan 10% sobre la ganancia (mejor que tasa marginal para tramos altos)
- **Disposición transitoria**: Instrumentos adquiridos antes del 2 sept 2022 pueden usar el **precio de cierre al 31 dic 2021** como costo de adquisición (en vez del precio real de compra). Esto puede reducir significativamente la ganancia tributable.
- **Reforma 2026 pendiente**: El gobierno ha propuesto eliminar el 10% para volver a la exención total. Si se aprueba, la estrategia cambiaría. El simulador mostrará un aviso informativo.

### Art. 108 LIR — Reinversión en fondos
- Aplica a: rescate de cuotas de fondos mutuos/FI reinvertidas en otros fondos mutuos/FI
- Efecto: ganancia de capital **diferida** (no se paga hasta el rescate final)
- Requisito: reinversión directa, sin que el partícipe reciba el dinero → **MLT**
- Detección: flag `beneficio_108lir` en fichas
- Limitación clave: **NO funciona si el destino es un ETF comprado en bolsa** (es transacción bursátil, no suscripción). SÍ funciona entre fondos mutuos/FI vía suscripción.

### MLT — Mecanismo de Liquidación y Traspaso
- Regulado por NCG 365 CMF + Resolución Ex. N°136 SII (2007)
- Funciona: AGF → misma AGF, AGF → otra AGF (con convenio), fondo mutuo ↔ fondo de inversión
- También funciona: AGF → fondo distribuido por corredora (la corredora actúa como intermediario, el destino sigue siendo un FM/FI)
- NO funciona: AGF → ETF en bolsa (compra en mercado secundario ≠ suscripción)
- El simulador marca `canMLT = true` cuando el destino es un fondo (no ETF en bolsa)

### DCV — Traspaso de custodia puro (sin rescate)
- El DCV custodia cuotas de fondos mutuos (servicio "Custodia de CFM")
- Las corredoras son depositantes del DCV y pueden custodiar valores a nombre de clientes (cuenta mandante individual)
- Teóricamente posible traspasar cuotas de FM desde AGF → corredora vía DCV **sin rescatar** (no es hecho gravado)
- **En la práctica**: requiere convenio operativo entre AGF y corredora, y que el fondo esté registrado en el DCV. No es flujo estándar para FM abiertos — es más habitual para acciones y bonos.
- **Para el simulador**: se ofrece como opción avanzada. El asesor puede marcar `canDCV = true` manualmente si sabe que el convenio existe. Cuando `canDCV = true`, el traspaso no es rescate → **impuesto = 0** (no diferido, simplemente no hay hecho gravado porque no hay liquidación).
- Esta opción es potencialmente la más valiosa para clientes de alto patrimonio con posiciones grandes en fondos de régimen general.

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

### Art. 104 LIR — Instrumentos de deuda con presencia bursátil
- Aplica a: bonos corporativos, bonos bancarios, letras hipotecarias con presencia bursátil
- Efecto: intereses y ganancias de capital gravados con **impuesto único del 4%**
- Relevancia: si el cliente tiene fondos de renta fija que invierten en estos instrumentos directamente, o bonos directos
- Detección: flag `beneficio_104lir` en fichas (agregar si no existe)
- En el simulador v1: informativo. Si el fondo subyacente tiene bonos Art. 104, se menciona como nota

### Art. 17 N°8 letra a) LIR — Exención 10 UTA para no habituales
- Aplica a: personas naturales que no son inversionistas habituales
- Efecto: exención de **10 UTA anuales** (~$7.5M CLP) en ganancias de capital por venta de acciones/cuotas de fondos
- Requisito: no ser calificado como "inversionista habitual" por el SII (criterio: frecuencia y volumen de transacciones)
- En el simulador: input checkbox "¿Cliente es inversionista habitual?" (default: No). Si no es habitual, las primeras 10 UTA de ganancia se descuentan del impuesto.

### Art. 41 A LIR — Crédito por impuestos pagados en el exterior
- Aplica a: dividendos e intereses de inversiones internacionales con withholding tax
- Efecto: impuestos pagados en el exterior se pueden acreditar contra el impuesto chileno (hasta el tope del impuesto chileno)
- Ejemplo: ETF de USA retiene 15% (tratado Chile-EEUU), ese 15% se acredita contra el Global Complementario
- En el simulador v1: informativo. Se muestra un aviso si el cliente tiene holdings internacionales: "Los impuestos retenidos en el exterior pueden acreditarse contra el impuesto chileno (Art. 41 A LIR)."

### Art. 57 LIR — Exención 30 UTM para rentas de capitales mobiliarios
- Aplica a: contribuyentes con rentas bajas del capital
- Efecto: exención de hasta **30 UTM anuales** en intereses, dividendos y ganancias de instrumentos de renta fija
- Relevancia limitada: la mayoría de clientes de alto patrimonio superan este umbral
- En el simulador v1: se aplica automáticamente si la renta del capital del cliente es baja

### Estrategia de mitigación
Ante una ganancia de capital por venta de fondos:
1. Aportar APV-B por 600 UF → reduce base imponible → ahorra hasta 240 UF de impuesto (tramo 40%)
2. Aportar DC por 900 UF → reduce base imponible → ahorra hasta 360 UF de impuesto
3. Total mitigación máxima: hasta 600 UF de ahorro tributario por año
4. Art. 17 N°8: si no es habitual, primeras 10 UTA de ganancia exentas (se aplica antes de APV/DC)

---

## 10. Clasificación de certeza normativa

Cada regla del simulador tiene un nivel de certeza:

| Regla | Certeza | Notas |
|-------|---------|-------|
| DCV traspaso custodia puro = sin hecho gravado | **Vigente, operación no estándar** | Legal y sin impacto tributario (no hay rescate). Pero requiere convenio AGF↔corredora y registro en DCV. El asesor debe verificar caso a caso. |
| Art. 107 LIR = 10% único | **Vigente** | Ley 21.420, Circular SII N°39. Sin ambigüedad. |
| Art. 107 disposición transitoria (precio 31/12/2021) | **Vigente** | Circular SII N°39. Aplica solo a instrumentos pre-sept 2022. |
| Art. 108 LIR / MLT = diferimiento | **Vigente** | Ley + NCG 365 CMF. Condición: reinversión directa sin paso por caja. |
| MLT AGF→AGF funciona, AGF→ETF bolsa no | **Vigente** | NCG 365 CMF. ETF en bolsa es transacción bursátil, no suscripción. |
| APV Régimen A (15% crédito) y B (rebaja base) | **Vigente** | DL 3.500 Art. 20. Sin ambigüedad en tasas y topes. |
| Depósito Convenido (900 UF) | **Vigente** | DL 3.500 Art. 20. |
| Tramos Global Complementario | **Vigente** | Art. 52 LIR. Se actualizan anualmente en UTM→UF. |
| Art. 17 N°8 exención 10 UTA | **Vigente, criterio subjetivo** | La ley es clara, pero la calificación de "habitual" depende del SII caso a caso. El simulador la ofrece como input del asesor con advertencia. |
| Art. 104 LIR = 4% deuda | **Vigente** | Solo aplica a instrumentos directos con presencia bursátil, no a fondos que invierten en ellos indirectamente. |
| Art. 41 A crédito extranjero | **Vigente, complejidad alta** | La regla existe, pero el cálculo detallado depende del país, tratado, tipo de renta. Solo informativo en v1. |
| Art. 57 exención 30 UTM | **Vigente** | Rara vez relevante para clientes de alto patrimonio. |
| Reforma 2026 (eliminar 10% Art. 107) | **Hipótesis** | Proyecto de ley, NO es ley vigente. Solo aviso informativo, nunca afecta el cálculo. |
| Rentabilidades esperadas por clase | **Supuesto de negocio** | Configurables por el asesor. No son datos normativos. |
| Tasa de descuento real 3.5% | **Supuesto de negocio** | Configurable. |
| APV B siempre mejor para alto patrimonio | **Supuesto de negocio** | Generalmente cierto para tramos > 15%, pero el simulador calcula ambos y recomienda. |

---

## 11. Norma General Antielusión y sustancia económica

El Código Tributario (Art. 4 bis, ter, quáter) establece la **Norma General Antielusión (NGA)**. El simulador debe ser consciente de esto:

### Qué es elusión
Operaciones que, aunque formalmente legítimas, carecen de **sustancia económica** y tienen como único propósito reducir la carga tributaria. El SII puede recalificar estas operaciones.

### Qué NO es elusión
Elegir entre alternativas que la ley ofrece (Art. 4 ter: "la sola circunstancia de que el contribuyente opte por la alternativa que resulte en un menor impuesto no constituye por sí sola abuso o simulación"). Esto cubre:
- Elegir APV Régimen A vs B
- Usar MLT para traspasar fondos (es un mecanismo regulado por la CMF)
- Vender posiciones con pérdida para compensar ganancias (tax-loss harvesting)
- Escalonar ventas en distintos años tributarios

### Cómo lo maneja el simulador
1. **Cada movimiento tiene sustancia económica declarada**: menor costo (TAC), mejor asignación (perfil de riesgo), o acceso a asesoría profesional. El simulador siempre cuantifica los 3 pilares, no solo el tributario.
2. **Aviso en el informe**: "La estrategia propuesta se basa en la razonable elección entre alternativas que la ley contempla. Cada movimiento tiene motivación económica más allá del beneficio tributario."
3. **No propone estructuras artificiales**: El simulador no recomienda crear sociedades, hacer round-trips, ni estructuras cuyo único propósito sea tributario.
4. **Diferimiento ≠ eliminación**: El simulador deja explícito que Art. 108/MLT **difiere** el impuesto al rescate final, no lo elimina. El impuesto se pagará cuando el cliente retire definitivamente los fondos.

### Advertencia de habitualidad
El checkbox "inversionista habitual" viene con tooltip explicativo:
> "El SII puede calificar a un contribuyente como habitual según la frecuencia y volumen de sus transacciones bursátiles. Si su cliente realiza operaciones frecuentes, consulte con un asesor tributario. La calificación de habitual elimina la exención de 10 UTA del Art. 17 N°8."

---

## 12. Separación: cálculo tributario vs. recomendación del asesor

El simulador separa explícitamente dos capas en la UI y en el informe:

### Capa 1: Cálculo tributario (datos duros)
Presentado con certeza, basado en ley vigente:
- Régimen tributario de cada fondo (Art. 107/108/general)
- Impuesto calculado por posición (10% único, tasa marginal, o diferido)
- Efecto de APV/DC en la base imponible
- Exenciones aplicables (Art. 17 N°8 si no habitual)
- **Formato visual**: fondo blanco, sin adornos, datos con fuente normativa citada

### Capa 2: Recomendación del asesor (supuestos de negocio)
Presentado como proyección con supuestos editables:
- Ahorro en TAC (supone que el cliente se cambia al fondo propuesto)
- Alpha por reasignación (supone rentabilidades esperadas por clase)
- Punto de equilibrio (combina impuesto real con ahorro proyectado)
- Escenario recomendado
- **Formato visual**: fondo con borde punteado o background sutil, etiqueta "Proyección con supuestos del asesor"

### Por qué importa esta separación
El cliente y el asesor deben poder distinguir entre "esto es lo que dice la ley" y "esto es lo que esperamos que pase". El informe generado por Claude también mantiene esta distinción.

---

## 13. Supuestos y disclaimers

- Las rentabilidades esperadas son **supuestos del asesor, no promesas**. Se muestran explícitamente en el informe.
- La simulación de fecha de adquisición usa precios históricos reales de la BD, pero puede no reflejar el precio exacto de compra.
- El análisis MLT asume que no hay convenio AGF↔corredora para ETFs en bolsa. Si el asesor sabe que existe un convenio específico, puede marcar fondos como `canMLT = true` manualmente.
- Tramos de impuesto pueden cambiar con reformas tributarias. Las constantes son editables.
- Todo cálculo en UF (términos reales). Se muestra equivalente CLP como referencia usando UF del día.
- **Art. 107 LIR**: Desde sept 2022 (Ley 21.420), la ganancia de capital NO es exenta sino gravada con impuesto único del 10%. El simulador implementa la tasa correcta.
- **Disposición transitoria**: Para instrumentos adquiridos antes del 2 sept 2022, el cliente puede optar por usar el precio de cierre al 31/12/2021 como costo de adquisición (Circular SII N°39). El simulador lo ofrece como opción.
- **Reforma 2026 pendiente**: Existe un proyecto de ley para eliminar el 10% del Art. 107. El simulador muestra un aviso pero calcula con la ley vigente (10%). Se presenta como hipótesis, **nunca como regla del cálculo**.
- **Diferimiento ≠ eliminación**: Art. 108/MLT difiere el impuesto, no lo elimina. El impuesto se paga al rescate final. El simulador cuantifica el impuesto diferido y lo muestra como nota.
- **Habitualidad**: La calificación de "inversionista habitual" es criterio del SII caso a caso. El simulador ofrece el input como decisión del asesor con advertencia de consultar tributarista.
- **No es asesoría tributaria**: Este simulador es una herramienta de planificación financiera. Se recomienda **siempre** validar con un contador o abogado tributario antes de ejecutar cualquier estrategia. El informe incluye este disclaimer de forma prominente.

---

## 14. Archivos a crear/modificar

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

## 15. Fuera de alcance (v1)

- Persistir simulaciones en BD (se puede agregar después)
- Integración directa con AGFs para ejecutar MLT
- Cálculo de impuesto diferido multi-año en fondos 108 (se simplifica a diferido para el traspaso)
- Art. 57 bis (derogado para nuevos aportes desde 2017, solo saldos vigentes — demasiado edge case para v1)
- Cuenta 2 AFP (vehículo alternativo de ahorro, no es cambio de custodia de fondos)
- Cálculo detallado de créditos por tratados de doble tributación (solo aviso informativo Art. 41 A)
- Simulación de la reforma 2026 pendiente (solo aviso informativo)
- Detalle de Art. 104 por instrumento subyacente del fondo (solo informativo si el fondo tiene bonos)

## 16. Resumen de regímenes tributarios

| Régimen | Tasa | Condición | Implementación v1 |
|---------|------|-----------|-------------------|
| DCV puro | 0% (no hay hecho gravado) | Traspaso custodia sin rescate | Opción avanzada, asesor marca manualmente |
| Art. 107 LIR | 10% único | Presencia bursátil | Cálculo completo + disposición transitoria |
| Art. 108 LIR / MLT | Diferido | Reinversión directa AGF→AGF o vía corredora | Cálculo completo |
| Art. 104 LIR | 4% único | Deuda con presencia bursátil | Informativo |
| Art. 17 N°8 | Exento hasta 10 UTA | No habitual | Cálculo completo |
| Art. 57 LIR | Exento hasta 30 UTM | Rentas bajas del capital | Automático si aplica |
| Art. 41 A | Crédito | Impuesto pagado en exterior | Aviso informativo |
| APV Régimen A | 15% crédito | Tope 6 UTM/mes, 600 UF/año | Cálculo completo |
| APV Régimen B | Rebaja base | Tope 600 UF/año | Cálculo completo |
| Depósito Convenido | Rebaja base | Tope 900 UF/año | Cálculo completo |
| General | Tasa marginal | Sin beneficio | Cálculo completo |
