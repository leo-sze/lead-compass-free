ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS mensagem_personalizada text,
  ADD COLUMN IF NOT EXISTS mensagem_gerada_em timestamptz,
  ADD COLUMN IF NOT EXISTS mensagem_status text,
  ADD COLUMN IF NOT EXISTS mensagem_pontos_usados jsonb;