import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APIFY_ACTOR = "apify~instagram-profile-scraper";

function classify(days: number | null): "ativo" | "moderado" | "inativo" | "erro" {
  if (days === null) return "erro";
  if (days <= 7) return "ativo";
  if (days <= 30) return "moderado";
  return "inativo";
}

function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").toLowerCase();
}

async function runApify(username: string): Promise<Date | null> {
  const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], resultsLimit: 5 }),
  });
  if (!res.ok) {
    console.error("[check-instagram-status] Apify error", res.status, await res.text());
    return null;
  }
  const items = await res.json();
  if (!Array.isArray(items) || items.length === 0) return null;

  const profile = items[0];
  const posts = profile.latestPosts || profile.posts || [];
  let mostRecent: Date | null = null;
  for (const p of posts) {
    const raw = p.timestamp || p.takenAt || p.taken_at_timestamp;
    if (!raw) continue;
    const d = typeof raw === "number" ? new Date(raw * (raw < 1e12 ? 1000 : 1)) : new Date(raw);
    if (!isNaN(d.getTime()) && (!mostRecent || d > mostRecent)) mostRecent = d;
  }
  return mostRecent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { username: rawUsername } = await req.json();
    if (!rawUsername || typeof rawUsername !== "string") {
      return new Response(JSON.stringify({ error: "username é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const username = normalizeUsername(rawUsername);
    if (!username) {
      return new Response(JSON.stringify({ error: "username inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();

    let lastPost: Date | null = null;
    let errored = false;
    try {
      lastPost = await runApify(username);
    } catch (e) {
      console.error("[check-instagram-status] Apify exception", e);
      errored = true;
    }

    const days = lastPost ? Math.floor((now.getTime() - lastPost.getTime()) / 86_400_000) : null;
    const status = errored ? "erro" : classify(days);

    const { data, error } = await supabase
      .from("instagram_accounts")
      .upsert(
        {
          username,
          last_post_date: lastPost ? lastPost.toISOString() : null,
          status,
          last_checked_at: now.toISOString(),
        },
        { onConflict: "username" }
      )
      .select()
      .single();

    if (error) {
      console.error("[check-instagram-status] DB error", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ account: data, days_since_last_post: days }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[check-instagram-status] fatal", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
