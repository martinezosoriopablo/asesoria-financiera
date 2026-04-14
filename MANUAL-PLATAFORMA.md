# Manual de Funcionamiento — Greybark Advisors

**Plataforma de Asesoria Financiera**
Ultima actualizacion: 2026-04-01

---

## 1. Vision General

Greybark Advisors es una plataforma SaaS para **asesores financieros** enfocada en el mercado chileno con capacidad internacional. Gestiona todo el ciclo de asesoria:

**Cliente nuevo → Perfil de riesgo → Cartola → Portafolio recomendado → Seguimiento → Rebalanceo → Reportes**

### Roles de usuario

| Rol | Acceso | Descripcion |
|-----|--------|-------------|
| **Admin** | Todo + gestion de asesores + sync de datos | Super usuario |
| **Asesor** | Clientes propios + herramientas | Usuario principal |
| **Cliente** | Portal con su informacion | Solo lectura + subir cartolas |

### Integraciones activas

- **Fintual** — Fondos mutuos chilenos + precios historicos
- **AAFM** — Precios diarios, rentabilidades, patrimonio, participes
- **CMF (Comision para el Mercado Financiero)** — Fondos de inversion (FIRES/FINRE), cartola de fondos mutuos
- **Yahoo Finance** — Precios internacionales + chilenos (.SN)
- **Alpha Vantage** — Fallback de precios
- **Bolsa de Santiago** — Precios real-time acciones chilenas
- **Banco Central Chile** — Tipos de cambio (UF, USD/CLP)
- **Google Calendar** — Sync de reuniones
- **Resend** — Envio de emails
- **Upstash Redis** — Rate limiting distribuido
- **Sentry** — Monitoreo de errores
- **2captcha** — Resolucion de captchas para scraping CMF

**Resolucion de precios en cascada:** Fintual → Bolsa Santiago → Yahoo → Alpha Vantage → Manual

---

## 2. Interfaz del Asesor

### 2.1 Navegacion Principal

| Menu | Ruta | Funcion |
|------|------|---------|
| Dashboard | `/advisor` | Estadisticas, calendario semanal, acciones rapidas |
| Clientes | `/clients` | CRM completo con busqueda y filtros |
| Vista General | `/advisor/clients-overview` | Metricas consolidadas de todos los clientes |
| Cartola & Riesgo | `/analisis-cartola` | Subir y analizar estados de cuenta |
| Portfolio Designer | `/portfolio-designer` | Disenar portafolios recomendados |

**Menu Herramientas:**

| Herramienta | Ruta | Funcion |
|-------------|------|---------|
| Market Dashboard | `/market-dashboard` | Catalogo de fondos mutuos chilenos |
| Centro de Fondos | `/fund-center` | Busqueda y comparacion de ETFs |
| Calculadora APV | `/calculadora-apv` | Simulador de ahorro previsional |
| Educacion | `/educacion-financiera` | Contenido educativo para clientes |

**Menu de usuario (esquina superior derecha):**
- Mi Perfil — editar datos, cambiar contrasena
- Gestion Asesores (solo admin) — CRUD de asesores
- Sincronizacion de Datos (solo admin) — sync Fintual/AAFM
- Notificaciones — campana con badge de no leidas
- Cerrar Sesion

---

### 2.2 Dashboard del Asesor

**Ruta:** `/advisor`

Al iniciar sesion, el asesor ve:

- **Tarjetas de estadisticas:** Total clientes, Clientes activos, Prospectos, AUM total, Reuniones pendientes
- **Calendario semanal:** Reuniones de la semana con sync Google Calendar
- **Acciones rapidas:** Links a crear cliente, analizar cartola, portfolio designer
- **Panel de comite:** Reportes recientes del comite de inversiones

---

### 2.3 Gestion de Clientes

**Ruta:** `/clients`

#### Lista de clientes
- Busqueda por nombre o email
- Filtros por estado (Activo/Prospecto) y perfil de riesgo
- Tabla con: nombre, email, perfil, patrimonio, estado
- Boton "Nuevo Cliente" para crear

#### Crear cliente
Campos requeridos:
- **RUT** — Validacion mod11 automatica
- **Nombre y Apellido**
- **Email** — Se usa para invitar al portal
- **Telefono** — Formato +56
- **Fecha de nacimiento** — Edad minima 18 anos
- **Patrimonio estimado**
- **Estado** — Activo / Prospecto

#### Detalle del cliente (`/clients/[id]`)

Pagina con multiples secciones:

**Informacion General**
- Datos personales editables
- Boton eliminar cliente

**Perfil de Riesgo**
- Puntaje global y 4 dimensiones: Capacidad, Tolerancia, Percepcion, Compostura
- Medidores visuales (gauges) por dimension
- Boton "Re-enviar cuestionario de riesgo"
- Perfil asignado: Conservador / Moderado / Crecimiento / Agresivo

**Portafolio Actual**
- Ultimo snapshot: fecha, valor total, composicion
- Tabla de holdings con instrumento, valor, porcentaje
- Desglose por clase de activo

**Cartera Recomendada**
- Comparacion actual vs recomendado por clase de activo
- Tabla de instrumentos recomendados

**Reportes**
- Configurar frecuencia: Diario / Semanal / Mensual
- Historial de reportes enviados

**Contrato**
- Subir PDF del contrato
- Ver, descargar, reemplazar, eliminar

**Historial de Recomendaciones**
- Timeline con todas las versiones guardadas
- Comparacion lado a lado entre versiones

**Mensajes**
- Hilo de comunicacion asesor-cliente

---

### 2.4 Vista General de Clientes

**Ruta:** `/advisor/clients-overview`

Dashboard consolidado que muestra todos los clientes con datos enriquecidos.

**Tarjetas resumen (7):**
- Clientes totales
- AUM Total
- TWR Promedio
- Con Recomendacion
- Alto Drift (>5%)
- Sin contacto 30d+
- Con Portafolio

**Filtros:**
- Busqueda por nombre o email
- Perfil de riesgo: Conservador / Moderado / Crecimiento / Agresivo
- Estado: Drift alto / Sin contacto / Sin reportes / Sin portafolio / Sin recomendacion

**Columnas ordenables:**
- Cliente (nombre)
- Perfil de riesgo
- Valor del portafolio
- TWR (rentabilidad)
- Drift (desviacion vs recomendado)
- Ultimo contacto

**Iconos de estado por cliente:**
- Target verde — tiene recomendacion
- Ojo azul — portal activo
- Check verde — alineado (drift <3%)
- Reloj rojo — sin contacto >30 dias

---

### 2.5 Portfolio Designer

**Ruta:** `/portfolio-designer`

5 modos de diseno de portafolio:

#### Modo Comparacion (principal)
1. Seleccionar cliente del dropdown
2. Se carga automaticamente:
   - Panel "Actual" con el ultimo snapshot
   - Panel "Recomendado" con sugerencia IA basada en perfil de riesgo
3. **Buscar fondos:** Modal de busqueda universal
   - Fuentes: BD local, Fintual/AAFM (fondos mutuos CL por RUN), Alpha Vantage (ETFs internacionales)
   - Click para agregar al portafolio recomendado
4. **Ajustar posiciones:** Editar porcentajes, eliminar posiciones
5. **Guardar:** Guarda como `cartera_recomendada` del cliente
6. **Resumen de rebalanceo:** Tabla automatica post-guardado con:
   - Instrumento | Accion (Comprar/Vender/Mantener) | Monto estimado

#### Modo Modelo
- Cargar cliente → ver benchmark de perfil de riesgo
- Si tiene cartera recomendada guardada, la muestra como referencia
- Ajustar tilts por clase de activo

#### Modo Rapido
- Plantillas predefinidas por perfil de riesgo
- Seleccionar → auto-llenar → guardar

#### Modo Analisis
- Buscar fondos/ETFs
- Comparar hasta 6 lado a lado
- Analisis de factsheets PDF

#### Modo Directo
- Acciones y bonos individuales
- Ingreso manual de cantidades y valores

---

### 2.6 Seguimiento de Portafolio

**Ruta:** Desde detalle del cliente → Pestaña Seguimiento

#### Grafico de Evolucion
- Doble modo: **Rentabilidad TWR** (default) o **Valor del portafolio**
- Periodos: 1M, 3M, 6M, 1Y, ALL
- Tooltips con valores exactos

#### Comparacion vs Recomendacion
- Barras comparativas: Actual vs Recomendado por clase de activo
- Muestra desviacion en puntos porcentuales

#### Tabla de Rebalanceo por Instrumento
Para cada posicion muestra:
- Instrumento (nombre + ticker)
- Clase de activo (RV/RF/ALT)
- % Actual
- % Recomendado
- Diferencia (pp)
- Accion: Comprar / Vender / Mantener

**Boton "Registrar ejecucion":** Guarda las operaciones buy/sell como historial de ejecucion.

#### Historial de Ejecuciones
- Lista expandible de trades registrados
- Fecha, instrumento, accion, % actual, % objetivo

#### Baseline vs Actual
- Comparacion del portafolio inicial (primera cartola) vs estado actual
- Muestra evolucion desde el punto de partida

#### Historial de Recomendaciones
- Timeline con todas las versiones de cartera recomendada
- Expandir para ver detalle de cada version

#### Tabla de Cartolas (Snapshots)
- Todas las cartolas ingresadas
- Fuente (manual/api-prices), valor total, TWR, fecha
- Estrella para marcar como baseline
- Click para revisar holdings

#### Atribucion de Performance
- Desglosa la rentabilidad por clase de activo
- Muestra contribucion de cada segmento al retorno total

---

### 2.7 Market Dashboard

**Ruta:** `/market-dashboard`

Catalogo de fondos mutuos chilenos con datos de Fintual y AAFM:
- Busqueda por nombre o administradora
- Rentabilidades: 1d, 7d, 30d, 90d, 365d, YTD
- Patrimonio y numero de participes
- Tipo de fondo y moneda

---

### 2.8 Centro de Fondos

**Ruta:** `/fund-center`

- Busqueda de fondos internacionales y chilenos
- Comparacion side-by-side de hasta 6 fondos/ETFs
- Analisis de factsheets PDF con IA
- Datos: rentabilidad, volatilidad, gastos, composicion

---

### 2.9 Notificaciones

La campana en el header muestra alertas automaticas:

| Tipo | Trigger | Icono |
|------|---------|-------|
| Cartola subida | Cliente sube cartola desde portal | Azul |
| Cuestionario completado | Cliente responde perfil de riesgo | Verde |
| Alerta de rebalanceo | Drift > umbral (default 5%) | Amber |
| Reporte listo | Reporte automatico enviado | Gris |

- Polling cada 30 segundos
- Click para marcar como leida
- "Marcar todas leidas" en el header del dropdown

---

### 2.10 Agenda

**Ruta:** `/advisor` (seccion calendario)

- Calendario semanal integrado
- Crear reuniones manualmente
- Sync con Google Calendar (OAuth 2.0)
- Ver reuniones pendientes de la semana

---

## 3. Portal del Cliente

### 3.1 Acceso

**Ruta:** `/portal/login`

El cliente accede con email y contrasena. El asesor envia la invitacion que incluye un link para configurar contrasena.

### 3.2 Navegacion del Portal

| Pestana | Ruta | Funcion |
|---------|------|---------|
| Inicio | `/portal/bienvenida` | Bienvenida y onboarding |
| Mi Portafolio | `/portal/dashboard` | Resumen de inversiones |
| Reportes | `/portal/reportes` | Informes del asesor |
| Mis Cartolas | `/portal/mis-cartolas` | Historial de cartolas |
| Mensajes | `/portal/mensajes` | Comunicacion con asesor |

Menu de usuario: Cambiar contrasena | Cerrar sesion

---

### 3.3 Bienvenida

**Ruta:** `/portal/bienvenida`

Pagina contextual que se adapta al estado del cliente:

**Si no tiene perfil de riesgo:**
- CTA prominente "Completar Perfil de Riesgo"
- Link directo al cuestionario de 7 pasos

**Si tiene perfil pero no portafolio:**
- Muestra perfil completado con gauges
- CTA "Subir tu primera cartola"

**Si tiene todo completo:**
- Resumen de perfil de riesgo
- Accesos rapidos a portafolio, reportes, mensajes

**Pasos de onboarding:**
1. Perfil de riesgo completado
2. Portafolio analizado
3. Recibiendo reportes

**Tarjeta del asesor:**
- Nombre, empresa, email de contacto

---

### 3.4 Mi Portafolio

**Ruta:** `/portal/dashboard`

**Tarjetas resumen:**
- Valor total del portafolio
- Rentabilidad del periodo
- Rentabilidad acumulada (TWR)

**Grafico de evolucion:**
- Linea SVG mostrando valor historico del portafolio

**Composicion actual:**
- Barras por clase de activo: Renta Variable, Renta Fija, Alternativos, Caja
- Porcentaje y valor en cada clase

**Tabla de holdings:**
- Instrumento, valor, porcentaje del portafolio

**Cartera Recomendada** (si el asesor la definio):
- Comparacion visual Actual vs Objetivo por clase de activo
- Indicadores: "sobre", "bajo", "En objetivo"
- Tabla de instrumentos recomendados con ticker, clase, % objetivo

---

### 3.5 Reportes

**Ruta:** `/portal/reportes`

- Lista de reportes enviados por el asesor
- Badge amber en reportes no leidos
- Contenido: resumen de portafolio, comentario del asesor, datos del comite
- Se marcan como leidos al abrir

---

### 3.6 Mis Cartolas

**Ruta:** `/portal/mis-cartolas`

Historial unificado de cartolas:

- **Subidas por el cliente** — desde la pagina de upload
- **Subidas por el asesor** — con badge "Asesor" azul

Cada cartola muestra:
- Titulo y descripcion
- Fecha
- Estado: Pendiente / Procesada / Error

Boton "Subir nueva" para cargar una nueva cartola.

---

### 3.7 Subir Cartola

**Ruta:** `/portal/subir-cartola`

1. Seleccionar administradora (broker)
2. Subir archivo PDF o Excel
3. El sistema procesa y clasifica automaticamente
4. El asesor recibe notificacion

---

### 3.8 Mensajes

**Ruta:** `/portal/mensajes`

- Hilo de conversacion con el asesor
- Enviar mensajes de texto
- Historial completo visible

---

### 3.9 Cambiar Contrasena

**Ruta:** `/portal/cambiar-password`

- Ingresa contrasena actual
- Define nueva contrasena
- Confirmacion de cambio

---

## 4. Funciones de Administrador

### 4.1 Gestion de Asesores

**Ruta:** `/admin/advisors`

- Crear, editar, eliminar asesores
- Asignar rol (admin/asesor)
- Personalizar logo y nombre de empresa
- Ver clientes asignados a cada asesor

### 4.2 Sincronizacion de Datos

**Ruta:** `/admin/data-sync`

- **Sync Fintual** — Actualiza catalogo de fondos mutuos y precios
- **Sync AAFM** — Actualiza rentabilidades y datos de fondos (solo desde localhost)
- **Precios manuales** — Importar Excel con precios para fondos sin cobertura automatica
- **Yahoo Map** — Mapeo CUSIP/ISIN a tickers Yahoo para fondos internacionales

### 4.3 Fondos de Inversion CMF

**Ruta:** `/admin/fondos`

Pagina de administracion con busqueda dual:
- **Tab Fondos Mutuos** — Busqueda en catalogo Fintual/AAFM
- **Tab Fondos de Inversion** — Busqueda en catalogo CMF (152 FIRES)
  - Buscar por nombre, RUT o administradora
  - Ver precios por serie (A, AE, D, E, I, etc.)
  - Historial de 15 dias con valor_libro, valor_economico, patrimonio_neto
  - Badge de estado de sync (ultimo sync, OK/error)

#### Pipeline de Sync CMF FI

El sistema descarga precios de fondos de inversion directamente desde CMF (entidad.php):

```
CMF entidad.php → 2captcha (reCAPTCHA v2) → Parse HTML → Upsert Supabase
```

**Archivos principales:**
- `lib/cmf-fi-auto.ts` — Scraper: visita pagina CMF, resuelve captcha, parsea tabla HTML
- `lib/cmf-fi-import.ts` — Importador: upsert en `fondos_inversion_precios`, calcula rent_diaria
- `scripts/sync-fi-diario.ts` — Script CLI para sync batch de todos los fondos
- `scripts/sync-fi-diario.bat` — Wrapper Windows para Task Scheduler

**Base de datos:**
- `fondos_inversion` — Catalogo de 152 fondos FIRES (rut, nombre, administradora, tipo, series_detectadas)
- `fondos_inversion_precios` — Precios diarios por serie (valor_libro, valor_economico, patrimonio_neto, n_aportantes, rent_diaria). Unique constraint: `(fondo_id, serie, fecha)`

**Ejecucion manual:**
```bash
# Sync completo (152 fondos, ~100 min, ~$0.45 de 2captcha)
npx tsx scripts/sync-fi-diario.ts --continue-on-error

# Un fondo especifico
npx tsx scripts/sync-fi-diario.ts --rut 9212

# Primeros N fondos
npx tsx scripts/sync-fi-diario.ts --limit 5

# Ventana de dias personalizada (default 7)
npx tsx scripts/sync-fi-diario.ts --days 30
```

**Automatizacion:**
- Task Scheduler de Windows: tarea `SyncFI-CMF-Diario` programada a las **21:00 diariamente**
- Logs en `logs/sync-fi-YYYYMMDD.log`
- Requiere que el PC este encendido a las 21:00
- Costo: ~$0.45/dia de 2captcha (~$13.50/mes)

**API:**
- `GET /api/fondos-inversion/lookup?q=moneda` — Busqueda por nombre, RUT o administradora
- `GET /api/fondos-inversion/lookup?id=uuid&dias=15` — Detalle con historial de precios

**Variables de entorno requeridas:**
- `TWOCAPTCHA_API_KEY` — Para resolver reCAPTCHA v2 de CMF

---

## 5. Conceptos Clave

### Clases de Activo
| Clase | Abreviacion | Descripcion |
|-------|-------------|-------------|
| Renta Variable | RV | Acciones, ETFs de renta variable |
| Renta Fija | RF | Bonos, depositos, fondos de renta fija |
| Alternativos | ALT | Commodities, real estate, hedge funds |
| Caja | Cash | Efectivo, money market |

### Perfiles de Riesgo
| Perfil | Descripcion | Tipica asignacion RV/RF |
|--------|-------------|-------------------------|
| Conservador | Minimo riesgo, preservar capital | 20/80 |
| Moderado | Balance riesgo/retorno | 40/60 |
| Crecimiento | Mayor riesgo por mayor retorno | 60/40 |
| Agresivo | Maximo retorno, alta tolerancia | 80/20 |

### Metricas de Performance
- **TWR (Time-Weighted Return)** — Rentabilidad que elimina el efecto de depositos/retiros. Es la metrica principal.
- **Drift** — Desviacion porcentual entre la composicion actual y la recomendada. Promedio de |actual_RV - rec_RV| y |actual_RF - rec_RF|.
- **AUM (Assets Under Management)** — Valor total de activos administrados.

### Snapshots de Portafolio
Cada "foto" del portafolio en un momento dado. Tiene:
- Fecha, valor total, composicion por clase
- Holdings detallados (JSONB)
- Fuente: `manual` (cartola frozen), `api-prices` (precios de mercado), `statement` (PDF), `excel`
- Flag `is_baseline` para la primera cartola (punto de partida)

### Cartera Recomendada
Array de instrumentos guardado por cliente:
```json
{
  "cartera": [
    { "ticker": "FFMM-123", "nombre": "Fondo X", "clase": "Renta Variable", "porcentaje": 30 },
    { "ticker": "FFMM-456", "nombre": "Fondo Y", "clase": "Renta Fija", "porcentaje": 70 }
  ]
}
```

---

## 6. Flujos Paso a Paso

### Onboarding de un cliente nuevo

```
1. Asesor: /clients → "Nuevo Cliente" → llenar datos → Guardar
2. Asesor: /clients/[id] → "Re-enviar cuestionario" → cliente recibe email
3. Cliente: Abre link → completa 7 pasos → perfil asignado automaticamente
4. Asesor: Recibe notificacion de cuestionario completado
5. Cliente: /portal/subir-cartola → sube PDF/Excel
6. Asesor: Recibe notificacion de cartola subida
7. Asesor: /portfolio-designer → selecciona cliente → genera recomendacion → guarda
8. Asesor: /clients/[id] → configura frecuencia de reportes
9. Asesor: /clients/[id] → sube contrato PDF
10. Cliente: Ve su portafolio y recomendacion en /portal/dashboard
```

### Rebalanceo de un cliente existente

```
1. Asesor recibe alerta de drift alto (notificacion amber)
2. Asesor: /clients/[id]/seguimiento → revisa tabla de rebalanceo
3. Ve: Instrumento A → Comprar +5pp, Instrumento B → Vender -3pp
4. Ejecuta operaciones en el broker
5. Asesor: Click "Registrar ejecucion" → guarda historial
6. Asesor: /portfolio-designer → actualiza recomendacion si es necesario
7. Siguiente snapshot refleja nueva composicion
```

### Revision periodica de cartera

```
1. Asesor: /advisor/clients-overview → ordena por TWR descendente
2. Identifica clientes con peor/mejor rendimiento
3. Filtra por "Alto Drift" → ve quien necesita rebalanceo
4. Filtra por "Sin contacto 30d+" → agenda reuniones
5. Click en cliente → revisa seguimiento detallado
6. Toma accion: rebalancear, enviar reporte, o contactar
```

---

## 7. Automatizaciones (Cron Jobs)

| Cron | Horario | Funcion |
|------|---------|---------|
| Sync Fintual | L-V 10:00 AM | Actualiza catalogo de fondos mutuos (Vercel) |
| Envio de reportes | L-V 12:00 PM | Envia reportes segun frecuencia configurada (Vercel) |
| Check de drift | L-V 1:00 PM | Verifica drift y crea alertas si > umbral (Vercel) |
| Sync FI CMF | Diario 21:00 | Sync 152 fondos de inversion desde CMF (PC local, Task Scheduler) |

---

## 8. Configuracion Tecnica

### Variables de entorno requeridas

| Variable | Proposito |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anonima Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave admin Supabase |
| `ANTHROPIC_API_KEY` | API de IA para recomendaciones |
| `RESEND_API_KEY` | Servicio de emails |
| `CRON_SECRET` | Autenticacion de cron jobs |
| `NEXT_PUBLIC_APP_URL` | URL publica de la app |

### Variables opcionales

| Variable | Proposito |
|----------|-----------|
| `UPSTASH_REDIS_REST_URL` | Rate limiting distribuido |
| `UPSTASH_REDIS_REST_TOKEN` | Token de Upstash |
| `NEXT_PUBLIC_SENTRY_DSN` | Monitoreo de errores |
| `SENTRY_ORG` | Organizacion Sentry |
| `SENTRY_PROJECT` | Proyecto Sentry |
| `SENTRY_AUTH_TOKEN` | Source maps Sentry |
| `ALPHA_VANTAGE_API_KEY` | Precios internacionales |
| `BOLSA_SANTIAGO_API_TOKEN` | Precios bolsa chilena |
| `BCCH_API_USER` | Banco Central (tipo cambio) |
| `BCCH_API_PASSWORD` | Banco Central (tipo cambio) |
| `TWOCAPTCHA_API_KEY` | Resolver captchas CMF (scraping FI) |
