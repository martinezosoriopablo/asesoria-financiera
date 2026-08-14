# Fotos y cargos del equipo en el sitio — Diseño

Fecha: 2026-08-13 · Rama: `sitio-web-marca`

## Objetivo

Poblar las secciones de equipo del sitio marketing con las fotos reales del
asesor (hoy todas usan el mismo placeholder gris inline), ajustar cargos y
agregar los miembros que faltan. Crear la sección de equipo de Global Corporate.

## Fuente de fotos

`~/Downloads/fotos/<area>/` con subcarpetas `corporates, markets, planning,
propierties, wealth`. Formato del nombre: `Nombre.jpg` o `Nombre-Cargo.jpg`.

## Decisiones tomadas

1. **Cargo**: si el nombre de archivo trae cargo → se usa ese (sobrescribe el de
   la página); si no trae → se mantiene el cargo ya presente en la página.
2. **Almacenamiento**: archivos en `public/media/team/`, un JPG por persona,
   referenciado por URL y reutilizado entre páginas (no inline base64).
3. **data-bio**: patrón `"<Cargo> en Global Companies. Biografía por completar."`

## Procesamiento de imagen

Originales: 2252×4000 upright (orient 6), personas centradas. sharp:
`.rotate()` (endereza) → `.extract()` **headshot** (ancho 1750 centrado, alto
2030 = aspecto 200/232 del `.tphoto`, tope anclado ~8% sobre la cabeza de cada
persona — `top` por foto) → `.resize(440,510)` → JPEG q84. Estilo de referencia:
headshots de Arrayán Asset (cabeza arriba, cara protagonista, hombros al ancho).
Salida en `public/media/team/`. NO usar `cover`/`attention` a ciegas: dejaba
demasiado aire arriba y la cara chica.

8 personas distintas → 8 archivos:
`ignacio-reeves, cristian-gomez, daniela-cordova, eugenio-leiton,
francisca-bustos, pablo-martinez, luis-coria, juan-pablo-velasco`.

## Cambios por página

- **wealth**: agregar foto a Juan Pablo Velasco, Pablo Martínez, Luis Coria
  (cargos intactos). Resto sigue con placeholder.
- **planning**: Ignacio Reeves → `Founder & Executive Manager` + foto;
  Daniela Cordova → `Head of Client & Partner Relations` + foto;
  agregar Cristian Gomez, Eugenio Leiton, Francisca Bustos (Senior Advisor) + foto.
- **properties**: reemplazar los 2 "Por confirmar" por Ignacio Reeves
  (`Founder & Executive Manager`) y Daniela Cordova
  (`Head of Client & Partner Relations`) + foto.
- **markets**: agregar foto a Pablo Martínez (Head of Strategy) y Luis Coria
  (Head of Analytics). Cargos intactos.
- **corporate**: crear sección `.equipo` (misma estructura/estilos que planning)
  con Ignacio Reeves (`Founder & Executive Manager`) y Cristian Gomez
  (`Head of Corporate Finance`) + foto.

## Fuera de alcance

- No se tocan biografías reales (quedan "por completar").
- No se reconcilian los cargos cruzados de markets vs wealth (Pablo/Luis) — se
  respeta el cargo de cada página.
- No se agregan fotos a miembros de wealth sin foto disponible.
