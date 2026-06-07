# ZONAS_CALIENTES.md — Greybark Advisors

> Hipótesis priorizada de auditoría.
> Severidad: BLOQUEANTE / ALTO / MEDIO / COSMÉTICO

---

## ZONA 1 — Fuente de precios y costos: CMF como canonica [RESUELTO]

**Estado:** COMPLETADO (Abril 2026)

CMF es la fuente canonica implementada:
- `lib/cmf-auto.ts` — sync diario de fondos mutuos (2500+ fondos, cron 21:00 L-V)
- `lib/cmf-fi-auto.ts` — sync de fondos de inversion via 2captcha
- Pipeline de prioridad en fill-prices: CMF FM > CMF FI > Fintual > Yahoo > AAFM > manual > snapshot fallback
- Fichas CMF extraidas con Gemini AI (`lib/ficha-extract.ts`) para TAC, horizonte, beneficio tributario
- Cache en BD (`fondos_rentabilidades_diarias`, `fondos_inversion_precios`), no martilla CMF

---

## ZONA 2 — Aislamiento de datos entre clientes (RLS Supabase) [RESUELTO]

**Estado:** COMPLETADO (Abril 2026)

RLS implementado en 25+ tablas con politicas USING + WITH CHECK. Funciones SQL:
- `get_accessible_advisor_ids()` — self + subordinados
- `get_accessible_client_ids()` — propios + subordinados + compartidos + huerfanos
- API routes usan `createAdminClient()` solo despues de `requireAdvisor()` verificado
- Portal usa `requireClient()` con verificacion de `active_role === 'client'`

---

## ZONA 3 — Cuestionario de perfil de riesgo [RESUELTO]

**Estado:** COMPLETADO (Abril 2026)

1. **Remitente correcto** — Email via Resend con nombre del asesor
2. **Datos guardados** — Validacion por paso, wizard con RiskProfileWizard
3. **Reenviable** — 1 click desde ClientDetail
4. **Frecuencia configurable** — `questionnaire_frequency` (annual/semi-annual/quarterly/biennial), `next_questionnaire_date` auto-calculado, badge de alerta en ClientDetail
5. **Edicion posterior** — Asesor puede ajustar perfil con log

---

## ZONA 4 — Magic link y autenticación cliente [ALTO]

**Pablo no confía en este flujo. Auditarlo a fondo.**

**Casos borde:**
- Magic link en browser distinto → ¿qué pasa?
- Magic link expira (1h default) → ¿el cliente ve mensaje claro o página rota?
- Cliente usa link 2 veces → ¿segundo uso falla con mensaje claro?
- Cliente sin rol asignado → ¿página blanca o redirect correcto?
- Token expira mid-session → ¿refresh automático o cliente atascado?
- Estado inconsistente client/server (Next.js + Supabase): post-login, server components ven `null` user mientras client components ya ven user. ¿Se maneja?

**Testing:** Playwright E2E que cubra invite → mail → click → login → dashboard.

---

## ZONA 5 — Calculo de retornos del portafolio [RESUELTO]

**Estado:** COMPLETADO (Abril 2026)

- TWR eliminado, reemplazado por retornos simples en `lib/returns/calculator.ts`
- Regla: < 365 dias = retorno simple (nunca anualizar), >= 365 dias = anualizado
- Tests con Vitest (`lib/returns/calculator.test.ts`)
- Referencias a TWR/Sharpe removidas de componentes y reportes
- Radiografia muestra retornos por periodo (1M, 3M, 6M, 12M, YTD)

---

## ZONA 6 — Lista de Fondos Preferidos del Asesor [RESUELTO]

**Estado:** COMPLETADO (Abril 2026)

- UI en `/advisor/fondos` con CRUD completo via `/api/advisor/preferred-funds`
- Per-client `fund_selection_mode` en tabla `clients` (only_my_list / my_list_with_fallback / all_funds)
- AI cartera generation inyecta fondos preferidos como soft constraint en el prompt
- Tabla `advisor_preferred_funds` con RLS por advisor_id

---

## ZONA 7 — Generador "Mail al Corredor/AGF" [RESUELTO]

**Estado:** COMPLETADO (Abril 2026)

- `/api/portfolio/generar-carta-corredor` genera email formal chileno via Claude AI
- CartaCorredorModal con editor de texto editable
- Boton "copiar al clipboard" para que el cliente pegue en su mail
- Formato profesional: saludo, instrucciones de compra/venta por fondo, despedida

---

## ZONA 8 — Fusión de herramientas duplicadas [MEDIO]

**Pablo:** *"que herramientas que hagan lo mismo o algo parecido se fusionen"*.

**Auditar:**
- Inventario de todos los módulos
- Identificar duplicados:
  - ¿Dos parsers de cartola distintos?
  - ¿Dos lugares donde se calculan retornos?
  - ¿Múltiples componentes de chart con APIs distintas?
- Plan de consolidación

**Por qué importa:** Duplicados = bugs duplicados. En proyectos con Claude Code en sesiones largas es común tener duplicados accidentales.

---

## ZONA 9 — Productividad del asesor [ALTO]

**Pablo:** *"para el asesor debe ser herramienta de trabajo, agendar, que le recuerde sus citas, que tenga toda la info del cliente"*.

**Auditar qué hay y qué falta:**
- ¿Existe agenda de citas?
- ¿Hay recordatorios automáticos (mail/push) antes de citas?
- ¿Vista única "Mi cliente X" con TODA la info (datos + cartola + perfil + reportes + próximas acciones)?
- ¿Vista "Mi día" con acciones pendientes del asesor?
- ¿Alertas cuando un cliente necesita re-cuestionario o revisión periódica?

**Crítica para la tesis del producto.** Si la plataforma no le ahorra trabajo al asesor, no escala.

---

## ZONA 10 — Reportes (HTML/PDF "bonitos") [MEDIO]

- Marca WAOP × Greybark
- Acentos y caracteres chilenos (ñ, tildes)
- Formato de moneda chileno: $1.234.567
- Fechas DD/MM/YYYY
- Editables antes de enviarse
- Versionados (cada radiografía queda en historial)

---

## ZONA 11 — Deuda técnica LLM [COSMÉTICO]

Limpieza tras la auditoría funcional. Buscar:
- `console.log` olvidados
- `any` que debería ser tipo específico
- Imports no usados
- Archivos huérfanos
- Variables hardcodeadas que deberían ser env vars

---

## Resumen de estado (Mayo 2026)

| # | Zona | Severidad | Estado |
|---|------|-----------|--------|
| 1 | CMF fuente canonica | BLOQUEANTE | RESUELTO |
| 2 | Aislamiento RLS | BLOQUEANTE | RESUELTO |
| 3 | Cuestionario | ALTO | RESUELTO |
| 4 | Magic link | ALTO | PENDIENTE (funcional, falta E2E test) |
| 5 | Retornos (eliminar TWR) | ALTO | RESUELTO |
| 6 | Fondos preferidos | ALTO | RESUELTO |
| 7 | Mail al corredor | MEDIO-ALTO | RESUELTO |
| 8 | Fusion duplicados | MEDIO | RESUELTO |
| 9 | Productividad asesor | ALTO | PARCIAL (agenda OK, faltan recordatorios push) |
| 10 | Reportes | MEDIO | PARCIAL (funcional, marca pendiente) |
| 11 | Deuda tecnica | COSMETICO | EN PROGRESO |
