
CREATE TABLE public.deleted_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telefone text,
  nome_empresa text,
  cnpj text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_deleted_leads_telefone ON public.deleted_leads(telefone) WHERE telefone IS NOT NULL;
CREATE INDEX idx_deleted_leads_cnpj ON public.deleted_leads(cnpj) WHERE cnpj IS NOT NULL;

GRANT SELECT, INSERT, DELETE ON public.deleted_leads TO anon, authenticated;
GRANT ALL ON public.deleted_leads TO service_role;

ALTER TABLE public.deleted_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view deleted_leads" ON public.deleted_leads FOR SELECT USING (true);
CREATE POLICY "Anyone can insert deleted_leads" ON public.deleted_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete deleted_leads" ON public.deleted_leads FOR DELETE USING (true);

-- Trigger: when a lead is deleted, record its phone/cnpj in the blocklist
CREATE OR REPLACE FUNCTION public.record_deleted_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.telefone IS NOT NULL OR OLD.cnpj IS NOT NULL THEN
    INSERT INTO public.deleted_leads (telefone, nome_empresa, cnpj)
    VALUES (OLD.telefone, OLD.nome_empresa, OLD.cnpj);
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_record_deleted_lead
  BEFORE DELETE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.record_deleted_lead();
