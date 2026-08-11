-- Bucket privado para PDFs de reportes. MP3 reusa el bucket 'daily-reports' existente.
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports','reports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "advisors_read_reports_bucket" ON storage.objects
  FOR SELECT USING (bucket_id = 'reports' AND auth.uid() IN (SELECT id FROM advisors));
CREATE POLICY "service_write_reports_bucket" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'reports') WITH CHECK (bucket_id = 'reports');
