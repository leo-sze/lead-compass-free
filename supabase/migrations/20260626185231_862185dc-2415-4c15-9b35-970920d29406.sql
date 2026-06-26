CREATE OR REPLACE FUNCTION public.normalize_lead_phone(_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  digits text;
BEGIN
  IF _phone IS NULL THEN
    RETURN NULL;
  END IF;

  digits := regexp_replace(_phone, '\D', '', 'g');

  IF digits = '' THEN
    RETURN NULL;
  END IF;

  IF length(digits) >= 12 AND left(digits, 2) = '55' THEN
    digits := substr(digits, 3);
  END IF;

  RETURN '+55' || digits;
END;
$$;

UPDATE public.deleted_leads
SET telefone = public.normalize_lead_phone(telefone)
WHERE telefone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS deleted_leads_telefone_unique
ON public.deleted_leads (telefone)
WHERE telefone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS deleted_leads_cnpj_unique
ON public.deleted_leads (cnpj)
WHERE cnpj IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_deleted_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_phone text;
BEGIN
  normalized_phone := public.normalize_lead_phone(OLD.telefone);

  IF normalized_phone IS NOT NULL OR OLD.cnpj IS NOT NULL THEN
    INSERT INTO public.deleted_leads (telefone, nome_empresa, cnpj)
    VALUES (normalized_phone, OLD.nome_empresa, OLD.cnpj)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_deleted_lead ON public.leads;
CREATE TRIGGER trg_record_deleted_lead
  BEFORE DELETE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.record_deleted_lead();