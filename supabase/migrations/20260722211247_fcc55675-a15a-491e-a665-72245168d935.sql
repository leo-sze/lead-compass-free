
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS enrich_business_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_business_status text,
  ADD COLUMN IF NOT EXISTS enrich_decisor_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_decisor_status text,
  ADD COLUMN IF NOT EXISTS enrich_maturity_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_maturity_status text,
  ADD COLUMN IF NOT EXISTS enrich_score_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_score_status text,
  ADD COLUMN IF NOT EXISTS decisor_telefone text,
  ADD COLUMN IF NOT EXISTS decisor_linkedin text;
