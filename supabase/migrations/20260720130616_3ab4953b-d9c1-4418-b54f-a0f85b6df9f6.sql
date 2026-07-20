ALTER TABLE public.leads ADD COLUMN kommo_imported_at timestamp with time zone;

GRANT SELECT, UPDATE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- Policy already exists; column inherits existing UPDATE policy for authenticated