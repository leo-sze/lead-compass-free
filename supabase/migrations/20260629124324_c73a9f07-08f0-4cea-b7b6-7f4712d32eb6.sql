
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_type text,
  ADD COLUMN IF NOT EXISTS instagram_last_post_days integer,
  ADD COLUMN IF NOT EXISTS instagram_profile_is_person boolean,
  ADD COLUMN IF NOT EXISTS google_rating numeric(2,1),
  ADD COLUMN IF NOT EXISTS google_review_count integer,
  ADD COLUMN IF NOT EXISTS google_owner_replied_recently boolean,
  ADD COLUMN IF NOT EXISTS google_profile_complete boolean,
  ADD COLUMN IF NOT EXISTS commercial_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS tier text;
