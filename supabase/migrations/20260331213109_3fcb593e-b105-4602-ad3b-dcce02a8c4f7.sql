
ALTER TABLE public.leads ADD COLUMN termo_pesquisa text;
ALTER TABLE public.leads ADD COLUMN cidade text;
ALTER TABLE public.leads ADD COLUMN fonte text DEFAULT 'google';
