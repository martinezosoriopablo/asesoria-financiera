-- Confianza del retorno calculado por snapshot.
-- 'high': el método valor cuota tuvo cobertura suficiente (>=80% del valor previo
--         matcheó) o el flujo estaba registrado → retorno confiable.
-- 'low':  cobertura baja sin flujo registrado (rebalanceo grande sin serie diaria)
--         → retorno estimado. Las pantallas deben marcarlo como estimado.
-- Ver lib/returns/unit-return.ts (computeSnapshotReturnsHybrid).

ALTER TABLE portfolio_snapshots
  ADD COLUMN IF NOT EXISTS returns_confidence TEXT;

COMMENT ON COLUMN portfolio_snapshots.returns_confidence IS
  'Confianza del cumulative_return: high (confiable) | low (estimado, cobertura baja sin flujo registrado)';
