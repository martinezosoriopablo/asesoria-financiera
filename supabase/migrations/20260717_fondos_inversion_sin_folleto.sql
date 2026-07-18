-- Marca por fondo de inversión si la CMF no publica folleto (ficha) para él.
-- NULL = no verificado aún; TRUE = sin folleto (nada que cargar); FALSE = tiene folleto.
-- Se puebla durante la sincronización de fichas (discovery) y permite a la UI
-- distinguir "sin folleto" de fichas realmente pendientes/errores.
ALTER TABLE fondos_inversion
  ADD COLUMN IF NOT EXISTS sin_folleto BOOLEAN;
