-- Add send day configuration to report config
ALTER TABLE client_report_config
  ADD COLUMN IF NOT EXISTS send_day_of_week INTEGER DEFAULT 1 CHECK (send_day_of_week BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS send_day_of_month INTEGER DEFAULT 1 CHECK (send_day_of_month BETWEEN 1 AND 28);
-- send_day_of_week: 0=Domingo, 1=Lunes, ..., 5=Viernes
-- send_day_of_month: 1-28
