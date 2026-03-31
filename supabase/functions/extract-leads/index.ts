import { corsHeaders } from "@supabase/supabase-js/cors";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const BodySchema = z.object({
  query: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  apiKey: z.string().min(1),
  provider: z.enum(["serpapi", "searchapi"]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { query, location, apiKey, provider } = parsed.data;
    const searchQuery = `${query} em ${location}`;

    let results: any[] = [];

    if (provider === "serpapi") {
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_maps");
      url.searchParams.set("q", searchQuery);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("hl", "pt-br");

      const res = await fetch(url.toString());
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`SerpApi error [${res.status}]: ${errBody}`);
      }
      const data = await res.json();
      results = data.local_results || [];
    } else {
      const url = new URL("https://www.searchapi.io/api/v1/search");
      url.searchParams.set("engine", "google_maps");
      url.searchParams.set("q", searchQuery);
      url.searchParams.set("api_key", apiKey);

      const res = await fetch(url.toString());
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`SearchApi error [${res.status}]: ${errBody}`);
      }
      const data = await res.json();
      results = data.local_results || [];
    }

    const leads = results.map((r: any) => ({
      nome_empresa: r.title || r.name || "Sem nome",
      telefone: r.phone || null,
      site: r.website || r.link || null,
      endereco: r.address || null,
      instagram: extractSocialLink(r, "instagram"),
      linkedin: extractSocialLink(r, "linkedin"),
    }));

    return new Response(
      JSON.stringify({ leads, total: leads.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("extract-leads error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractSocialLink(result: any, platform: string): string | null {
  // Check in links array if available
  if (result.links) {
    for (const link of result.links) {
      if (link.link?.includes(platform)) return link.link;
    }
  }
  // Check website
  if (result.website?.includes(platform)) return result.website;
  return null;
}
