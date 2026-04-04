ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS justificativa text,
ADD COLUMN IF NOT EXISTS sinais_positivos jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS sinais_negativos jsonb DEFAULT '[]'::jsonb;