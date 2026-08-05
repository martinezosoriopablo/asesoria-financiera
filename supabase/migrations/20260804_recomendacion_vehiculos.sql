-- Vehículo de inversión por clase de activo, por cliente (fondos/etf/directo).
-- Ausente/nulo = todo "fondos" (retrocompatible con la recomendación actual).
alter table public.clients
  add column if not exists recomendacion_vehiculos jsonb;

-- Instrumentos preferidos: además de fondos, acciones y bonos directos.
alter table public.advisor_preferred_funds
  add column if not exists instrument_type text not null default 'fund',
  add column if not exists sector text;

alter table public.advisor_preferred_funds
  drop constraint if exists advisor_preferred_funds_instrument_type_check;
alter table public.advisor_preferred_funds
  add constraint advisor_preferred_funds_instrument_type_check
  check (instrument_type in ('fund', 'stock', 'bond'));
