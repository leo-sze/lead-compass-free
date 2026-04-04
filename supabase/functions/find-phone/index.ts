import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Contact {
  index: number;
  companyName: string;
  city?: string;
  state?: string;
}

async function findPhone(contact: Contact, apiKey: string): Promise<{ index: number; phone: string | null }> {
  const query = [contact.companyName, contact.city, contact.state].filter(Boolean).join(" ");
  
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
    url.searchParams.set("input", query);
    url.searchParams.set("inputtype", "textquery");
    url.searchParams.set("fields", "name,formatted_phone_number");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`Places API error for "${query}": ${res.status}`);
      return { index: contact.index, phone: null };
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    
    if (candidate?.formatted_phone_number) {
      return { index: contact.index, phone: candidate.formatted_phone_number };
    }

    // If findplacefromtext doesn't return phone, try Place Details
    if (candidate?.place_id) {
      const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      detailsUrl.searchParams.set("place_id", candidate.place_id);
      detailsUrl.searchParams.set("fields", "formatted_phone_number");
      detailsUrl.searchParams.set("key", apiKey);

      const detailsRes = await fetch(detailsUrl.toString());
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        if (detailsData.result?.formatted_phone_number) {
          return { index: contact.index, phone: detailsData.result.formatted_phone_number };
        }
      }
    }
  } catch (e) {
    console.error(`Error finding phone for "${query}":`, e);
  }

  return { index: contact.index, phone: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contacts } = await req.json() as { contacts: Contact[] };

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return new Response(
        JSON.stringify({ error: "contacts array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Google Places API key from settings table
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: setting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "google_places_api_key")
      .maybeSingle();

    const apiKey = setting?.value;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Google Places API Key não configurada. Vá em Configurações para adicioná-la." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process in batches of 5 with 200ms delay between each
    const results: { index: number; phone: string | null }[] = [];
    
    for (let i = 0; i < contacts.length; i++) {
      const result = await findPhone(contacts[i], apiKey);
      results.push(result);
      
      // 200ms delay between requests to avoid rate limit
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
