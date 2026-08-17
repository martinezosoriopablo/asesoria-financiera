-- Backfill de las 4 tablas legacy → reports. Idempotente (re-ejecutable).
-- Las tablas legacy quedan intactas; siguen siendo la fuente de los consumidores hasta Phase 4.

-- Sembrar como tipo custom cualquier tipo de comite_reports que no exista en el catálogo
-- (evita violar la FK reports.type; conserva reportes de tipos custom legacy).
INSERT INTO report_types (id, label, scope_key, default_usos, formatos, is_custom, orden)
SELECT DISTINCT c.type, initcap(replace(c.type,'_',' ')), 'date',
       '{distribucion,insumo_cartera}'::text[], '{html,pdf}'::text[], true, 200
FROM comite_reports c
WHERE NOT EXISTS (SELECT 1 FROM report_types rt WHERE rt.id = c.type)
ON CONFLICT (id) DO NOTHING;

-- comite_reports (1 por tipo, sin historial). usos=NULL → hereda default del tipo.
INSERT INTO reports (type, title, report_date, content_html, usos, uploaded_by, created_at)
SELECT c.type, c.title, COALESCE(c.report_date, CURRENT_DATE), c.content, NULL, NULL, c.uploaded_at
FROM comite_reports c
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.type = c.type AND r.report_date = COALESCE(c.report_date, CURRENT_DATE)
);

-- monthly_reports → cierre_mensual, period=month ('YYYY-MM'), report_date = día 1.
INSERT INTO reports (type, title, report_date, period, content_html, created_at)
SELECT 'cierre_mensual', m.title, to_date(m.month || '-01','YYYY-MM-DD'), m.month, m.html_content, m.created_at
FROM monthly_reports m
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.type = 'cierre_mensual' AND r.period = m.month
);

-- daily_reports → diario, period=am/pm, audio_url = podcast_url.
INSERT INTO reports (type, title, report_date, period, content_html, audio_url, created_at)
SELECT 'diario', d.subject, d.report_date, d.period, d.html_content, d.podcast_url, d.created_at
FROM daily_reports d
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.type='diario' AND r.report_date=d.report_date AND r.period=d.period
);

-- model_portfolios → cartera_modelo, perfil, payload={posiciones,sleeves}. Conserva historial por report_date.
INSERT INTO reports (type, title, report_date, perfil, payload, created_at)
SELECT 'cartera_modelo',
       'Cartera modelo ' || mp.perfil,
       mp.report_date, mp.perfil,
       jsonb_build_object('posiciones', mp.posiciones, 'sleeves', mp.sleeves, 'nota_comite', mp.nota_comite),
       COALESCE(mp.created_at, now())
FROM model_portfolios mp
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.type='cartera_modelo' AND r.perfil=mp.perfil AND r.report_date=mp.report_date
);
