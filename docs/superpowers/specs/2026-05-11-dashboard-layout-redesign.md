# Dashboard & Layout Redesign — Design Spec

**Date:** 2026-05-11
**Approach:** B — New Layout Shell + Dashboard Redesign

## 1. Identity & Visual System

### Typography
- **Font family:** Plus Jakarta Sans (replaces Inter)
- **Titles:** weight 600-700
- **Body:** weight 400-500
- Loaded from Google Fonts

### Color Palette (Fintech Moderna)
```css
--gb-primary:       #0D9488   /* teal-600, brand color */
--gb-primary-dark:  #0F766E   /* teal-700, hover */
--gb-primary-light: #CCFBF1   /* teal-100, badges/highlights */
--gb-sidebar:       #0F172A   /* slate-900, sidebar bg */
--gb-sidebar-hover: #1E293B   /* slate-800, sidebar hover */
--gb-topbar:        #FFFFFF   /* topbar bg */
--background:       #F8FAFC   /* slate-50, page bg */
--gb-black:         #0F172A   /* primary text */
--gb-gray:          #64748B   /* secondary text */
--gb-border:        #E2E8F0   /* borders */
--gb-success:       #059669
--gb-warning:       #D97706
--gb-danger:        #DC2626
```

## 2. Layout Structure

### Architecture
```
app/advisor/layout.tsx   ← NEW: wraps all /advisor/* routes
  ├── AdvisorSidebar     ← NEW component
  ├── AdvisorTopBar      ← NEW component
  └── {children}         ← page content
```

`AdvisorHeader.tsx` is NOT deleted — it remains for non-advisor routes that still use it. Advisor routes stop importing it since the layout provides navigation.

### Sidebar (`components/shared/AdvisorSidebar.tsx`)
- **Width:** 240px expanded, 64px collapsed
- **Background:** slate-900 (`--gb-sidebar`)
- **Top:** Advisor logo (white-label, falls back to Greybark). Size: `h-10 max-w-[160px]`
- **Nav sections:**
  - Principal: Dashboard, Clientes, Vista General, Cartola & Riesgo, Portfolio Designer
  - Herramientas: Centro de Fondos, Mis Fondos, Calculadora APV, Educacion
- **Active item:** bg teal with opacity (`bg-teal-600/20`), left border teal 3px, text white
- **Inactive items:** text slate-400, hover → text slate-300 + bg slate-800
- **Collapsed state:** icons only (64px), tooltip on hover with label
- **Bottom:** collapse/expand toggle button
- **Mobile:** hidden by default, opens as overlay triggered by hamburger in TopBar
- **Collapse state persisted** in `localStorage`

### Top Bar (`components/shared/AdvisorTopBar.tsx`)
- **Height:** `h-16` (64px)
- **Background:** white, border-bottom slate-200
- **Left:** hamburger (mobile only) + page title / greeting
- **Right:** NotificationBell + avatar with name + dropdown menu
- **Dropdown:** Mi Perfil, admin links (if isAdmin), switch to client role (if hasClientRole), logout

## 3. Dashboard (advisor/page.tsx)

### Greeting
- Time-contextual: "Buenos dias" / "Buenas tardes" / "Buenas noches"
- Subtitle: formatted date (capitalized)

### Stats Cards (4-column grid)
- Total Clientes, Activos, Prospectos, AUM Total
- **AUM card:** teal background with white text (primary KPI)
- Other 3: white bg, icon in teal-light circle
- Entry animation: staggered fade-in-up (0, 50ms, 100ms, 150ms)
- Hover: `translate-y-[-1px]` + shadow-md

### Main Column (2/3 width)

**Agenda de Hoy:**
- Vertical timeline of today's meetings
- Each meeting: time, client name, type badge (color-coded), edit/delete actions
- "Ver semana completa" expandable section with redesigned weekly calendar
- "Nueva Reunion" button above timeline
- Google Calendar connect as subtle banner below agenda

### Side Column (1/3 width)

**Alertas & Pendientes (replaces "Acciones Rapidas"):**
- Alerts from existing data: reuniones pendientes (from stats), cuestionarios vencidos, drift alerts
- Each alert links to the relevant action
- Visual urgency: red/amber badges

**Flujo de Asesoria:**
- Horizontal stepper with numbered circles connected by lines
- 4 steps: Clientes → Riesgo & Cartola → Comparacion → Modelo
- Click navigates to each step
- Compact, not a full list

**Comite Reports:** Existing `ComiteReportsPanel`, colors adapted to new theme.

### Loading State
- Skeleton loaders instead of generic spinner
- Skeleton for stats (4 rectangles), agenda (3 lines), alerts (list)

## 4. Micro-interactions
- Stats cards: staggered entry animation with `@keyframes fadeInUp`
- Cards: `hover:translate-y-[-1px] hover:shadow-md transition-all`
- Sidebar: smooth width transition on collapse/expand (200ms ease)
- Active nav item: left border slides in

## 5. Files Changed

| File | Action |
|------|--------|
| `app/globals.css` | Update palette, font, add animations |
| `app/layout.tsx` | Update font import (Plus Jakarta Sans) |
| `app/advisor/layout.tsx` | NEW — layout shell with sidebar + topbar |
| `components/shared/AdvisorSidebar.tsx` | NEW — sidebar component |
| `components/shared/AdvisorTopBar.tsx` | NEW — top bar component |
| `app/advisor/page.tsx` | Redesign dashboard content |
| `components/dashboard/WeeklyCalendar.tsx` | Adapt colors to new theme |
| `components/dashboard/GoogleCalendarConnect.tsx` | Adapt colors to new theme |

`AdvisorHeader.tsx` is kept for non-advisor routes. No deletion.

## 6. Out of Scope
- Other advisor sub-pages (profile, fondos, fichas-review, clients-overview) — they inherit the layout automatically but their content is not redesigned
- Portal (client) routes — separate design
- Backend/API changes — none needed
- New API endpoints for alerts — use existing stats data; future enhancement
