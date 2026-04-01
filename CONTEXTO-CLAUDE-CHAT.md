# Contexto de Plataforma — Greybark Advisors
## Para conversación con Claude Chat

Soy el fundador/desarrollador de **Greybark Advisors**, una plataforma SaaS de asesoría financiera enfocada en el mercado chileno con capacidad internacional. Usa Next.js 16, React 19, Supabase, TypeScript, Tailwind CSS v4, desplegada en Vercel.

---

## Qué hace la plataforma

Es una herramienta B2B para **asesores financieros** que gestiona todo el ciclo de asesoría:

### Core Features (funcionando)
1. **CRM de clientes** — CRUD completo, filtros por estado/perfil de riesgo, estadísticas, jerarquía admin/asesor
2. **Cuestionario de riesgo** — 7 pasos, scoring en 4 dimensiones (capacidad, tolerancia, percepción, compostura), genera benchmark de inversión automático
3. **Parseo de cartolas** — Sube PDF o Excel de estados de cuenta, clasifica automáticamente activos en RV/RF/Alternativas/Cash
4. **Diseñador de portafolios** — 5 modos: comparación actual vs ideal (con búsqueda universal de fondos y resumen de rebalanceo), modelos guardados (con cartera recomendada como referencia), plantillas rápidas, análisis de fondos, portafolio directo (acciones/bonos)
5. **Centro de fondos** — Búsqueda, comparación side-by-side de hasta 6 ETFs, análisis de factsheets PDF
6. **Dashboard de mercado chileno** — Catálogo de fondos mutuos con datos de Fintual y AAFM (rentabilidades, patrimonio, partícipes)
7. **Seguimiento temporal** — Snapshots de portafolio, cálculo de TWR, llenado de precios intermedios, comparación vs recomendación, rebalanceo por holding (comprar/vender/mantener), baseline vs actual
8. **Comité de inversiones** — Generación de cartera recomendada, aplicación masiva a clientes, export PDF
9. **Agenda** — Calendario semanal con sync Google Calendar (OAuth 2.0)
10. **Calculadora APV** — Simulador de ahorro previsional voluntario
11. **Educación financiera** — Contenido educativo para clientes
12. **Generación de PDFs** — Reportes con React PDF

### Integraciones activas (10)
- **Fintual API** — Catálogo de fondos mutuos chilenos + precios históricos
- **AAFM** — Precios diarios, rentabilidades (1d-1y), patrimonio, partícipes
- **Yahoo Finance** — Precios internacionales + chilenos (.SN)
- **Alpha Vantage** — Fallback de precios
- **Bolsa de Santiago** — Precios real-time acciones chilenas
- **Banco Central Chile** — Tipos de cambio (UF, USD/CLP)
- **Google Calendar** — Sync de reuniones
- **Resend** — Envío de emails
- **OpenFIGI** — Identificadores de securities
- **Finnhub** — Datos de bonos

Resolución de precios en cascada: Fintual → Bolsa Santiago → Yahoo → Alpha Vantage → manual.

### Seguridad
- Supabase Auth (email/password), middleware de sesión
- Roles: admin/advisor con RLS en PostgreSQL
- Rate limiting: Upstash Redis (production) with in-memory fallback (dev), API auth helpers (`requireAuth`, `requireAdmin`)
- Tokens OAuth protegidos con RLS estricto

### Base de datos (Supabase PostgreSQL)
- `advisors`, `clients`, `risk_profiles`
- `portfolio_snapshots` (cartolas con holdings JSONB)
- `portfolio_models`, `direct_portfolios`, `direct_portfolio_holdings`
- `fintual_providers`, `fintual_funds`, `fintual_prices`
- `security_prices_cache`, `manual_prices`, `security_yahoo_map`
- `portfolio_dividends`, `advisor_notifications`, `client_reports`, `client_report_config`
- `recommendation_versions`, `rebalance_executions`, `client_contracts`, `audit_logs`
- `advisor_meetings`, `advisor_google_tokens`

---

## Experiencia actual del usuario

### El asesor (usuario principal)
```
Login → Dashboard (stats, calendario, acciones rápidas)
  ├── Clientes: listar → ver detalle → enviar cuestionario → subir cartola → comparar vs benchmark
  ├── Vista General: métricas consolidadas → filtrar por perfil/estado → ordenar por TWR/drift/contacto → ver alertas
  ├── Portfolio Designer:
  │     ├── Comparación V2: seleccionar cliente → generar cartera IA → buscar/agregar fondos manualmente → guardar → ver resumen de rebalanceo
  │     ├── Modelo: cargar cliente → ver benchmark vs cartera recomendada guardada → ajustar tilts
  │     └── Fund Center: buscar → comparar ETFs → analizar factsheets
  ├── Market Dashboard: ver fondos chilenos → sync datos [admin]
  ├── Seguimiento: evolución TWR → comparación vs recomendación → rebalanceo por holding → registrar ejecución → baseline vs actual
  └── Agenda: ver semana → crear reuniones → sync Google
```

### El cliente (portal activo)
```
Login → Dashboard (valor portafolio, evolución, composición, cartera recomendada vs actual)
  ├── Completar perfil de riesgo (cuestionario 7 pasos, detecta si ya completado)
  ├── Subir cartolas (PDF/Excel)
  ├── Ver reportes del asesor
  ├── Mensajes con el asesor
  └── Historial de cartolas (propias + las del asesor con badge)
```

---

## Lo que funciona bien
1. Integración profunda con ecosistema financiero chileno (Fintual, AAFM, Bolsa Santiago, Banco Central)
2. Resolución de precios multi-fuente con fallback inteligente (5 fuentes)
3. Cuestionario de riesgo multi-dimensional sofisticado
4. Seguridad bien implementada (auth, RLS, rate limiting)
5. Stack técnico moderno (Next.js 16, React 19, TypeScript estricto)
6. Parseo inteligente de cartolas PDF/Excel con clasificación automática
7. 65+ API endpoints cubriendo todo el flujo de asesoría

---

## Problemas y oportunidades de mejora

### UX/Producto — Alto impacto
1. ~~**Sin portal de cliente**~~ ✅ RESUELTO — Portal completo con dashboard, reportes, cartolas, mensajes
2. ~~**Sin notificaciones**~~ ✅ RESUELTO — NotificationBell con polling, triggers automáticos en upload/cuestionario
3. ~~**Sin reportes automáticos**~~ ✅ RESUELTO — Cron L-V 12pm, email con Resend, configuración por cliente
4. ~~**Sin alertas de rebalanceo**~~ ✅ RESUELTO — Tabla de rebalanceo por holding en Seguimiento + resumen post-guardado en Portfolio Designer + cron diario check-drift con alertas automáticas + tracking de ejecuciones (buy/sell) + drift_threshold configurable por asesor.
5. ~~**Sin dashboard consolidado de rendimiento**~~ ✅ RESUELTO — Vista consolidada `/advisor/clients-overview` con métricas (AUM, TWR promedio, drift), filtros por perfil/estado, ordenamiento por 6 columnas, iconos de estado.
6. **Sin onboarding** — Un asesor nuevo no tiene flujo guiado.
7. ~~**Sin chat/mensajería**~~ ✅ RESUELTO — Sistema de mensajes integrado asesor-cliente
8. **Cartola manual** — Mejorado: cliente puede subir desde portal, pero sin conexión directa con bancos.

### Técnico — Medio impacto
9. **Sin skeleton loaders** — Las cargas son abruptas, sin feedback visual consistente.
10. **Sin SWR/React Query** — Fetch directo sin caché, re-fetching innecesario.
11. ~~**Sin Sentry/monitoring**~~ ✅ RESUELTO — Sentry integrado con client/server/edge configs, global-error.tsx, instrumentation.ts, 10% trace sampling.
12. **Google Fonts via `<link>`** — Debería usar `next/font` para mejor performance.
13. **Mezcla español/inglés en código** — UI en español, código mixto.
14. **Tests limitados** — Vitest configurado pero cobertura incierta, especialmente en cálculos financieros.
15. ~~**Sin cron jobs completos**~~ ✅ RESUELTO — Cron de reportes L-V 12pm + cron check-drift L-V 1pm + sync Fintual L-V 10am. AAFM sync manual desde admin.

### Patrones recurrentes de bugs (para futuras sesiones de Claude)
- **Normalización de strings**: assetClass viene como `"Equity"` / `"Fixed Income"` de las cartolas pero el código interno usa `"equity"` / `"fixedIncome"`. SIEMPRE usar comparación case-insensitive o normalizar.
- **RLS silenciosa**: Supabase devuelve `[]` vacío (no error) cuando RLS bloquea. Si un query retorna vacío inesperadamente, verificar si se necesita `createAdminClient()`.
- **Snapshots api-prices vs manual**: Los snapshots `source=manual` tienen precios congelados de la cartola. Los `source=api-prices` tienen precios de mercado. Componentes deben preferir api-prices para precios actuales.
- **AAFM 403**: El servidor AAFM requiere cookies de sesión. `getSetCookie()` puede no existir en algunos runtimes. Usar fallback con `get("set-cookie")` + retry.

### Bajo impacto
16. **Sin export CSV/Excel** — Para compliance y reportería masiva.
17. **Sin dark mode** — Preferencia visual.
18. **Multi-moneda parcial** — Manejo USD/CLP/UF incompleto.

---

## Números clave
- ~15 páginas/rutas
- 65+ API endpoints
- 50+ componentes React
- ~22 tablas en BD
- 10 integraciones externas
- 12 dependencias de producción
- ~15,000-20,000 líneas de código estimadas

---

## Contexto de negocio
- Mercado objetivo: asesores financieros en Chile
- Modelo: SaaS B2B
- Los asesores gestionan clientes con patrimonio variable
- El mercado chileno tiene fondos mutuos (AGFs reguladas por CMF), APV, acciones en Bolsa de Santiago, y cada vez más inversión internacional (ETFs US)
- Regulación: CMF (Comisión para el Mercado Financiero) supervisa fondos y asesores
- UF es la unidad de cuenta indexada a inflación, muy usada en Chile

---

*Usa este contexto como base para cualquier conversación sobre mejoras de producto, estrategia, UX, priorización de features, o decisiones técnicas de la plataforma.*
