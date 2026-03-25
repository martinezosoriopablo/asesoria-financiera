-- Atomic function to calculate and update snapshot returns
-- Prevents race conditions from concurrent read-then-write operations

CREATE OR REPLACE FUNCTION calculate_snapshot_returns(
  p_snapshot_id UUID,
  p_total_value NUMERIC
)
RETURNS TABLE (
  daily_return NUMERIC,
  cumulative_return NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_id UUID;
  v_snapshot_date DATE;
  v_prev_value NUMERIC;
  v_first_value NUMERIC;
  v_daily_return NUMERIC;
  v_cumulative_return NUMERIC;
BEGIN
  -- Get the snapshot's client_id and date
  SELECT ps.client_id, ps.snapshot_date
    INTO v_client_id, v_snapshot_date
    FROM portfolio_snapshots ps
   WHERE ps.id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot % not found', p_snapshot_id;
  END IF;

  -- Get previous snapshot's total_value (most recent before this date)
  SELECT ps.total_value
    INTO v_prev_value
    FROM portfolio_snapshots ps
   WHERE ps.client_id = v_client_id
     AND ps.snapshot_date < v_snapshot_date
   ORDER BY ps.snapshot_date DESC
   LIMIT 1;

  -- Calculate daily return
  IF v_prev_value IS NOT NULL AND v_prev_value > 0 THEN
    v_daily_return := ROUND(
      LEAST(9999.99, GREATEST(-9999.99,
        ((p_total_value - v_prev_value) / v_prev_value) * 100
      )), 2);
  ELSE
    v_daily_return := NULL;
  END IF;

  -- Get first snapshot's total_value for cumulative return
  SELECT ps.total_value
    INTO v_first_value
    FROM portfolio_snapshots ps
   WHERE ps.client_id = v_client_id
   ORDER BY ps.snapshot_date ASC
   LIMIT 1;

  -- Calculate cumulative return
  IF v_first_value IS NOT NULL AND v_first_value > 0 THEN
    v_cumulative_return := ROUND(
      LEAST(9999.99, GREATEST(-9999.99,
        ((p_total_value - v_first_value) / v_first_value) * 100
      )), 2);
  ELSE
    v_cumulative_return := NULL;
  END IF;

  -- Atomically update the snapshot row
  UPDATE portfolio_snapshots
     SET daily_return = v_daily_return,
         cumulative_return = v_cumulative_return
   WHERE id = p_snapshot_id;

  -- Return the calculated values
  RETURN QUERY SELECT v_daily_return, v_cumulative_return;
END;
$$;
