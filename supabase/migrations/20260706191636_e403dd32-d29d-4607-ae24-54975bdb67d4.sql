
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS instagram_scrape_status text,
  ADD COLUMN IF NOT EXISTS google_scrape_status text,
  ADD COLUMN IF NOT EXISTS debug_raw_data jsonb;
