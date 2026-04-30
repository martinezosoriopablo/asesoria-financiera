-- Audit trail for TAC uploads
CREATE TABLE IF NOT EXISTS tac_upload_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID NOT NULL REFERENCES advisors(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  records_updated INT DEFAULT 0,
  records_errored INT DEFAULT 0,
  fecha_actualizacion TEXT,
  filename TEXT,
  fondos_no_encontrados TEXT[] DEFAULT '{}',
  duration_seconds DECIMAL(6,2)
);

-- RLS: advisor sees only their own uploads
ALTER TABLE tac_upload_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_select_own_tac_logs"
  ON tac_upload_log FOR SELECT
  USING (advisor_id = auth.uid());

COMMENT ON TABLE tac_upload_log
  IS 'Audit trail for TAC (Total Annual Cost) bulk uploads';
