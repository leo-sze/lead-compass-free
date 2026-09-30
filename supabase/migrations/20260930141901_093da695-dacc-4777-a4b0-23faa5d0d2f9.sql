ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS incompleto_motivo text,
  ADD COLUMN IF NOT EXISTS cnpj_confidence text,
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS situacao_cadastral text,
  ADD COLUMN IF NOT EXISTS cnae text,
  ADD COLUMN IF NOT EXISTS porte text,
  ADD COLUMN IF NOT EXISTS data_abertura text,
  ADD COLUMN IF NOT EXISTS capital_social numeric,
  ADD COLUMN IF NOT EXISTS qsa jsonb,
  ADD COLUMN IF NOT EXISTS decisor_qualificacao text,
  ADD COLUMN IF NOT EXISTS temperatura text,
  ADD COLUMN IF NOT EXISTS maturidade integer,
  ADD COLUMN IF NOT EXISTS resumo_ia text,
  ADD COLUMN IF NOT EXISTS raw_sources jsonb,
  ADD COLUMN IF NOT EXISTS stage_empresa_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS stage_empresa_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_empresa_error text,
  ADD COLUMN IF NOT EXISTS stage_presenca_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS stage_presenca_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_presenca_error text,
  ADD COLUMN IF NOT EXISTS stage_ia_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS stage_ia_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_ia_error text,
  ADD COLUMN IF NOT EXISTS stage_mensagem_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS stage_mensagem_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_mensagem_error text;

CREATE OR REPLACE FUNCTION public.leads_validate_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE digits text; reasons text[] := '{}';
BEGIN
  NEW.phone_e164 := public.normalize_lead_phone(NEW.telefone);
  digits := regexp_replace(coalesce(NEW.telefone,''), '\D', '', 'g');
  IF length(digits) >= 12 AND left(digits,2) = '55' THEN digits := substr(digits,3); END IF;
  IF coalesce(trim(NEW.nome_empresa),'') = '' THEN reasons := reasons || 'sem nome'; END IF;
  IF digits = '' THEN reasons := reasons || 'sem telefone';
  ELSIF length(digits) NOT IN (10,11) THEN reasons := reasons || 'telefone inválido'; NEW.phone_e164 := NULL;
  END IF;
  IF coalesce(trim(NEW.endereco),'') = '' THEN reasons := reasons || 'sem endereço'; END IF;
  NEW.incompleto_motivo := CASE WHEN array_length(reasons,1) > 0 THEN array_to_string(reasons, ', ') ELSE NULL END;
  IF NEW.uf IS NULL AND NEW.endereco ~ '[-,/ ]\s*([A-Z]{2})(\s*,|\s*$|\s+\d{5})' THEN
    NEW.uf := substring(NEW.endereco from '[-,/ ]\s*([A-Z]{2})(?:\s*,|\s*$|\s+\d{5})');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_validate_entry ON public.leads;
CREATE TRIGGER trg_leads_validate_entry BEFORE INSERT OR UPDATE OF telefone, endereco, nome_empresa ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_validate_entry();

UPDATE public.leads SET telefone = telefone;

CREATE INDEX IF NOT EXISTS idx_leads_phone_e164 ON public.leads(phone_e164);

CREATE TABLE IF NOT EXISTS public.cnpj_cache (
  cnpj text PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cnpj_cache TO anon, authenticated;
GRANT ALL ON public.cnpj_cache TO service_role;
ALTER TABLE public.cnpj_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read cnpj_cache" ON public.cnpj_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write cnpj_cache" ON public.cnpj_cache FOR INSERT TO authenticated WITH CHECK (true);