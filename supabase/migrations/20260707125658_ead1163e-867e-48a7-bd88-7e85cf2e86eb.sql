
CREATE TABLE public.instagram_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  last_post_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'erro' CHECK (status IN ('ativo','moderado','inativo','erro')),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_accounts TO anon, authenticated;
GRANT ALL ON public.instagram_accounts TO service_role;

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view instagram_accounts" ON public.instagram_accounts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert instagram_accounts" ON public.instagram_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update instagram_accounts" ON public.instagram_accounts FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete instagram_accounts" ON public.instagram_accounts FOR DELETE USING (true);
