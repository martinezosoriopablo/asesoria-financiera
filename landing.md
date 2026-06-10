# Global — Guía de marca y diseño

Este archivo define la identidad de **Global** para mantener coherencia visual y de
contenido en todo el proyecto (landing y portal). Respétalo en cada pantalla nueva.

---

## Marca y posicionamiento

- **Qué es:** boutique de gestión patrimonial, sociedad registrada y regulada por la **CMF**.
- **Audiencia:** profesionales, familias y personas de alto patrimonio. **No** es una marca
  solo para médicos ni para un gremio específico.
- **Ventaja central (el mensaje que manda):** somos **independientes y agnósticos**. No
  trabajamos con un proveedor en particular ni vendemos productos propios; comparamos el
  mercado y recomendamos lo mejor para el cliente.
- **Áreas de servicio:** gestión de inversiones, asesoría tributaria, inmobiliaria y seguros.
- **Tono:** banca privada — sobrio, confiable, cercano. Premium sin ser frío.

---

## Paleta

Usar exclusivamente estos colores. Toda la familia es azul; **no introducir verde**.

```css
:root{
  --ink:    #0B2C5E; /* texto principal, secciones oscuras */
  --deep:   #07203F; /* fondo más oscuro */
  --ring:   #14467E; /* anillo del logo, azul corporativo */
  --azure:  #2E86E0; /* acento — la "barra" del logo */
  --sky:    #6FB2EF; /* acento claro */
  --paper:  #FBFCFE; /* fondo de página */
  --mist:   #EEF3FA; /* fondo de sección claro / cards */
  --line:   #DCE7F4; /* hairlines y bordes */
  --muted:  #5B6B82; /* texto secundario */
}
```

---

## Tipografía

Tres roles, deliberados. Importar desde Google Fonts:

```
https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap
```

- **Display — `Fraunces` (serif):** titulares. Peso 400–500, leading ajustado. Usar la
  itálica para resaltar una palabra clave dentro del titular (`<em>`).
- **Cuerpo — `Hanken Grotesk` (sans):** texto, botones, navegación.
- **Datos/etiquetas — `IBM Plex Mono`:** eyebrows, cifras, métricas.

---

## Firma visual (lo que hace única a la marca)

- **La barra azul** (`--azure`) es el elemento recurrente: subraya cada *eyebrow* y divide
  secciones. Es la "barra" del logo convertida en sistema. Úsala como sello, no como adorno.
- **Eyebrows:** en `IBM Plex Mono`, MAYÚSCULAS, `letter-spacing` amplio, color `--azure`,
  precedidos de una barrita azul de ~26px.
- **Logo:** anillo abierto (navy `--ring`) + barra horizontal (`--azure`), con
  `stroke-linecap:round`. Disponible como SVG en `public/`. Snippet inline:

```html
<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M82.34 39.5 A34 34 0 1 0 82.34 60.5" fill="none" stroke="#14467E" stroke-width="13" stroke-linecap="round"/>
  <path d="M53 50 L85 50" fill="none" stroke="#2E86E0" stroke-width="13" stroke-linecap="round"/>
</svg>
```
  En fondos oscuros, el anillo va en blanco y la barra en `--sky`.

---

## Reglas de UI

- Esquinas redondeadas (cards ~16px, botones tipo *pill* 999px).
- Hairlines en `--line`; cards sobre `#fff` o `--mist`.
- Quality floor obligatorio: **responsive** hasta móvil, **focus visible** por teclado,
  y respetar **`prefers-reduced-motion`** (sin animaciones si está activo).
- Animación con criterio: un reveal sutil al hacer scroll basta. Evitar efectos por todos
  lados (se siente generado automáticamente).

---

## Contenido y copy

- **Español de Chile**, profesional. Sentence case. Verbos directos, sin relleno.
- **No nombrar socios ni personas** — el equipo aún no está definido. Referirse a
  "profesionales con vasta trayectoria en banca e instituciones financieras".
- **No nombrar clases de activos específicas** (no decir "renta fija", "acciones", etc.).
  Hablar de "todas las clases de activos".
- Reforzar siempre el ángulo **agnóstico/independiente** en servicios y proceso.

### Compliance (importante)

- Incluir disclaimer: *"La rentabilidad pasada no garantiza rentabilidades futuras. Toda
  inversión está sujeta a riesgos."*
- No afirmar nada sobre comisiones o "sin amarres" que el modelo de negocio no pueda
  sustentar (ojo con retrocesiones de proveedores).
- La página no constituye oferta ni recomendación de inversión.

---

## Placeholders por reemplazar

- Correo de contacto: `contacto@global.cl` (provisorio).
- Razón social y datos legales definitivos.
