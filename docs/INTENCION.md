# INTENCION.md — Greybark Advisors

> Documento de intención del producto.
> Define qué DEBE hacer el sistema en su estado deseado.
> La auditoría compara el código actual contra este norte.

---

## 1. Tesis del producto

Una plataforma que permite a un asesor financiero **escalar a muchos clientes** manteniendo calidad institucional, automatizando todo lo que se puede automatizar pero permitiendo edición humana en cada paso.

**Usuario primario:** el asesor (Pablo, JP, JM, futuros). Su experiencia es la prioridad — debe ser cómoda, rápida, escalable.

**Usuario secundario:** el cliente final. Su experiencia es consultiva — accede a información, no opera.

**Lo que NO es:** No ejecuta órdenes, no custodia activos, no reemplaza al asesor.

**Lo que SÍ es:** Herramienta de productividad para el asesor + motor de análisis + generador de outputs editables + portal informativo para el cliente.

---

## 2. Estado actual del sistema (lo que YA existe)

Confirmado por Pablo, abril 2026. La auditoría debe verificar que todo esto funciona bien y está coherente, NO reconstruir.

- **Agenda con Google Calendar:** asesor agenda citas, se sincronizan con su calendar
- **Seguimiento periódico de cartola:** cliente puede actualizar cartola en el tiempo, el sistema mantiene historial
- **Carga de contrato:** documento legal del cliente sube al sistema
- **Envío de reportes con frecuencia configurable:** asesor configura cada cuánto el cliente recibe reportes automáticamente
- **Cuestionario de perfil de riesgo:** se envía al cliente, se calcula perfil
- **Portal cliente con magic link:** auth de cliente vía Supabase
- **Parser de cartola:** extrae posiciones de cartolas enviadas
- **Generación de reportes:** HTML/PDF del análisis

---

## 3. Lo que faltaba o habia que ordenar (auditoria abril-mayo 2026)

### 3.1 CMF como fuente canonica — COMPLETADO
CMF es la fuente canonica para precios (fondos mutuos via `lib/cmf-auto.ts`, fondos de inversion via `lib/cmf-fi-auto.ts`). Fallback a Fintual, Yahoo Finance, AAFM. Pipeline de prioridad implementado en fill-prices y current-prices.

### 3.2 Lista de Fondos Preferidos del Asesor — COMPLETADO
Implementado en `/advisor/fondos` con CRUD via `/api/advisor/preferred-funds`. Per-client `fund_selection_mode` (only_my_list / my_list_with_fallback / all_funds). AI cartera generation inyecta fondos preferidos como soft constraint.

### 3.3 Mail al corredor/AGF pre-redactado — COMPLETADO
Implementado en `/api/portfolio/generar-carta-corredor` con Claude AI. Genera email formal chileno con instrucciones de compra/venta. Boton "copiar" en CartaCorredorModal. Editable por asesor.

### 3.4 Eliminar TWR, reemplazar por retornos puros — COMPLETADO
TWR y Sharpe eliminados. `lib/returns/calculator.ts` implementa retornos simples: < 365 dias = simple return, >= 365 dias = anualizado. Retornos por periodo (1M, 3M, 6M, 12M, YTD) en radiografia y seguimiento.

### 3.5 Fusion de herramientas duplicadas — COMPLETADO
Portfolio Designer unifica comparacion, modelo, quick build y analisis. Fund Center unifica busqueda, comparador y analisis de fondos. Redirects activos desde rutas antiguas.

### 3.6 Test real de RLS — COMPLETADO
RLS implementado y verificado en 25+ tablas. Funciones SQL `get_accessible_advisor_ids()` y `get_accessible_client_ids()` para jerarquia de asesores.

### 3.7 Frecuencia de cuestionario configurable por cliente — COMPLETADO
Columna `questionnaire_frequency` (annual/semi-annual/quarterly/biennial). `next_questionnaire_date` se computa al guardar perfil de riesgo. ClientDetail muestra badge de alerta cuando esta vencido.

---

## 4. Flujo del asesor (el central)

### 4.1 Captación / primera visita
1. Asesor crea nuevo cliente
2. Llena datos básicos
3. Configura preferencias del cliente (modo de selección de fondos, frecuencia de re-cuestionario, frecuencia de reportes automáticos)
4. Sube contrato cuando lo tenga
5. Envía cuestionario al cliente (remitente: asesor)
6. Agenda próxima reunión (sync con Google Calendar)

### 4.2 Cliente envía cartola
1. Cliente envía cartola por mail o sube al portal
2. Plataforma parsea → extrae posiciones
3. Posiciones quedan como "portafolio actual"
4. **Precios y costos: CMF como fuente canónica.** Fallback a otras solo si CMF falla.

### 4.3 Primera radiografía (quick win, antes del cuestionario)
Sin esperar el cuestionario, valor inmediato:

1. **Análisis de cartola actual:**
   - Composición del portafolio
   - TAC ponderado
   - Retornos: 1M, 3M, 6M, 12M, YTD, anualizado desde última cartola

2. **Búsqueda de fondos más baratos manteniendo perfil:**
   - Para cada fondo, alternativas con menor TAC y misma categoría
   - Búsqueda primero en lista del asesor (si aplica)
   - Si no hay opción, fallback al universo CMF (transparente, marcado en el reporte)

3. **Output editable:**
   - Reporte HTML/PDF "bonito" (marca WAOP × Greybark)
   - Texto pre-redactado para mail al corredor/AGF
   - Versión final guardada con timestamp

### 4.4 Cuestionario y perfil de riesgo
1. Cliente recibe cuestionario por mail (remitente: asesor)
2. Lo completa
3. Plataforma calcula perfil
4. Asesor recibe notificación
5. Asesor puede editar perfil con razón profesional (queda log)
6. Plataforma agenda próximo cuestionario según frecuencia configurada

### 4.5 Portafolio óptimo
1. Con perfil confirmado, plataforma genera portafolio óptimo
2. Optimización usa universo según preferencia del asesor (modo solo lista / lista + fallback / todos)
3. Restricciones: perfil de riesgo, costos como factor

### 4.6 Comparación final (3 vías)

| Eje | A | B |
|-----|---|---|
| 1 | Portfolio óptimo | Portfolio actual cliente |
| 2 | Portfolio óptimo | Benchmark de mercado |
| 3 | Portfolio actual cliente | Benchmark de mercado |

Métricas: composición, retornos (1M, 3M, 6M, 12M, YTD, anualizado), TAC, perfil de riesgo.

### 4.7 Implementación
1. Cliente recibe propuesta + texto pre-redactado para corredor
2. Cliente envía mail a su corredor desde su propio mail
3. Asesor agenda seguimiento

### 4.8 Seguimiento periódico
1. Cliente actualiza cartola periódicamente (mail o portal)
2. Plataforma compara cartola nueva vs propuesta original
3. Reportes automáticos al cliente con frecuencia configurada
4. Recordatorio de re-cuestionario según frecuencia configurada
5. Próximas citas en agenda

---

## 5. Flujo del cliente

### 5.1 Onboarding
1. Recibe mail del asesor con cuestionario
2. Completa cuestionario
3. Recibe magic link al portal
4. Primer login

### 5.2 Uso recurrente
- Ve perfil de riesgo
- Ve composición de portafolio actual
- Ve retornos
- Ve documentos compartidos por el asesor (radiografías, propuestas)
- Mensajería con el asesor
- Recibe notificación de nuevo reporte
- Recibe recordatorios de re-cuestionario cuando corresponda

---

## 6. Reglas de negocio críticas

1. **Aislamiento de datos:** Un cliente NUNCA ve datos de otro cliente. RLS testeado, no asumido.
2. **Aislamiento entre asesores:** Un asesor solo ve sus clientes asignados.
3. **CMF canónica:** Toda métrica de precio/TAC viene de CMF primero.
4. **No transaccional:** 100% informativa.
5. **Custodia del cliente:** Activos en su nombre en custodios regulados (AGF/corredora chilena o Stonex).
6. **Edición siempre disponible:** Cada output automatizado debe ser editable antes de entregarse.
7. **Mail al corredor lo envía el cliente:** La plataforma redacta, el cliente envía desde su mail.
8. **Compliance:** NCG 380 (asesoría), Ley 21.719 (datos personales), NCG 454 (riesgo operacional).
9. **Auditabilidad:** Cada edición de perfil, generación de reporte, cambio de configuración queda con timestamp y autor.

---

## 7. Stack técnico

- **Frontend:** Next.js, TypeScript, Tailwind v4
- **Backend/DB:** Supabase (Auth, Postgres con RLS, Realtime)
- **Hosting:** Vercel (confirmado)
- **Email:** Resend
- **Calendar:** Google Calendar API
- **AI:** Claude (analisis, reportes, carta corredor), Gemini 2.5 Flash (extraccion fichas PDF)
- **Parser de cartolas:** propio (TypeScript, PDF via Claude + Excel via xlsx)
- **Fuente canonica de datos:** CMF (precios, TAC, fichas)
- **Fuentes de respaldo:** Fintual API, Yahoo Finance, AAFM (localhost only)

---

## 8. Métricas de éxito

**Para el asesor:**
- Tiempo de "recibo cartola" → "entrego radiografía" < 30 minutos
- > 50 clientes activos por asesor sin sentirse desbordado
- Cero re-trabajo manual

**Para el cliente:**
- Onboarding < 15 minutos
- Cero confusión sobre custodia

**Para el negocio:**
- Cero leaks RLS (medible con tests)
- 100% outputs editables
- Audit trail completo
