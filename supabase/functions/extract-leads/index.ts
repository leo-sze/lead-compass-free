const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const BodySchema = z.object({
  query: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  apiKey: z.string().min(1),
  provider: z.enum(["serpapi", "searchapi"]),
});

async function fetchSerpApi(searchQuery: string, apiKey: string, start: number): Promise<any[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("hl", "pt-br");
  url.searchParams.set("start", String(start));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`SerpApi error [${res.status}]: ${errBody}`);
  }
  const data = await res.json();
  return data.local_results || [];
}

async function fetchSearchApi(searchQuery: string, apiKey: string, page: number): Promise<any[]> {
  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("page", String(page));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`SearchApi error [${res.status}]: ${errBody}`);
  }
  const data = await res.json();
  return data.local_results || [];
}

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

    const allResults: any[] = [];
    const targetCount = 60;
    const maxPages = 4; // Safety limit to avoid burning API credits

    if (provider === "serpapi") {
      // SerpApi uses 'start' parameter (0, 20, 40, 60...)
      for (let page = 0; page < maxPages; page++) {
        const start = page * 20;
        console.log(`SerpApi page ${page + 1}, start=${start}`);
        const results = await fetchSerpApi(searchQuery, apiKey, start);
        if (results.length === 0) break;
        allResults.push(...results);
        if (allResults.length >= targetCount) break;
      }
    } else {
      // SearchApi uses 'page' parameter (1, 2, 3...)
      for (let page = 1; page <= maxPages; page++) {
        console.log(`SearchApi page ${page}`);
        const results = await fetchSearchApi(searchQuery, apiKey, page);
        if (results.length === 0) break;
        allResults.push(...results);
        if (allResults.length >= targetCount) break;
      }
    }

    // Deduplicate by title+phone
    const seen = new Set<string>();
    const uniqueResults = allResults.filter((r: any) => {
      const key = `${(r.title || r.name || "").toLowerCase()}_${r.phone || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const leads = uniqueResults.map((r: any) => ({
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
  if (result.links) {
    for (const link of result.links) {
      if (link.link?.includes(platform)) return link.link;
    }
  }
  if (result.website?.includes(platform)) return result.website;
  return null;
}
