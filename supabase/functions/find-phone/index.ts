import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ContactInput {
  index: number;
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
}

interface ContactResult {
  index: number;
  phone: string | null;
  source: "site" | "places" | null;
}

const PHONE_REGEX = /(\+?55[\s\-]?)?(\(?\d{2}\)?)[\s\-]?(9?\d{4})[\s\-]?(\d{4})/g;

async function scrapePhoneFromSite(url: string): Promise<string | null> {
  try {
    let formatted = url.trim();
    if (!formatted.startsWith("http")) formatted = `https://${formatted}`;

    const res = await fetch(formatted, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadExtract/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return null;

    const html = await res.text();
    const matches = html.match(PHONE_REGEX);
    if (matches && matches.length > 0) {
      // Return the first match, cleaned up
      return matches[0].replace(/[\s\-]/g, "").replace(/^\+?55/, "+55 ");
    }
  } catch (e) {
    console.error(`Scrape error for ${url}:`, e);
  }
  return null;
}

async function findPhoneViaPlaces(companyName: string, city: string, state: string, apiKey: string): Promise<string | null> {
  const query = [companyName, city, state].filter(Boolean).join(" ");
  if (!query.trim()) return null;

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.nationalPhoneNumber",
      },
      body: JSON.stringify({ textQuery: query }),
    });

    if (!res.ok) {
      console.error(`Places API error for "${query}": ${res.status}`);
      return null;
    }

    const data = await res.json();
    const place = data.places?.[0];
    if (place?.nationalPhoneNumber) {
      return place.nationalPhoneNumber;
    }
  } catch (e) {
    console.error(`Places error for "${query}":`, e);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contacts } = await req.json() as { contacts: ContactInput[] };

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return new Response(
        JSON.stringify({ error: "contacts array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Google Places API key from settings (optional - only needed for stage 2)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "google_places_api_key")
      .maybeSingle();

    const placesApiKey = setting?.value || "";

    const results: ContactResult[] = [];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      let phone: string | null = null;
      let source: "site" | "places" | null = null;

      // Stage 1: Scrape website
      if (contact.website) {
        phone = await scrapePhoneFromSite(contact.website);
        if (phone) source = "site";
      }

      // Stage 2: Google Places fallback
      if (!phone && placesApiKey) {
        phone = await findPhoneViaPlaces(
          contact.companyName,
          contact.city || "",
          contact.state || "",
          placesApiKey
        );
        if (phone) source = "places";
      }

      results.push({ index: contact.index, phone, source });

      // 200ms delay between requests
      if (i < contacts.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("find-phone error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
