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
  source: z.enum(["google", "linkedin"]).default("google"),
});

async function fetchSerpApi(query: string, apiKey: string, start: number, engine: string): Promise<any[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", engine);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("hl", "pt-br");
  if (engine === "google_maps") {
    url.searchParams.set("start", String(start));
  } else {
    url.searchParams.set("start", String(start));
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`SerpApi error [${res.status}]: ${errBody}`);
  }
  const data = await res.json();

  if (engine === "google_maps") {
    return data.local_results || [];
  }
  // For Google search (LinkedIn), parse organic results
  return data.organic_results || [];
}

async function fetchSearchApi(query: string, apiKey: string, page: number, engine: string): Promise<any[]> {
  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", engine);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("page", String(page));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`SearchApi error [${res.status}]: ${errBody}`);
  }
  const data = await res.json();

  if (engine === "google_maps") {
    return data.local_results || [];
  }
  return data.organic_results || [];
}

function parseGoogleMapsResult(r: any) {
  return {
    nome_empresa: r.title || r.name || "Sem nome",
    telefone: r.phone || null,
    site: r.website || r.link || null,
    endereco: r.address || null,
    instagram: extractSocialLink(r, "instagram"),
    linkedin: extractSocialLink(r, "linkedin"),
  };
}

function parseLinkedInResult(r: any) {
  // Parse LinkedIn search results from Google organic results
  const title = r.title || "";
  const snippet = r.snippet || "";
  const link = r.link || "";

  // Extract company name from title (e.g., "Company Name - CEO | LinkedIn")
  let nome = title.split(" - ")[0]?.split(" | ")[0]?.trim() || title;
  // If it looks like a person profile, try to get company from snippet
  if (link.includes("/in/")) {
    // This is a person profile, try to extract company
    const companyMatch = snippet.match(/(?:at|em|na|no)\s+([^.·|]+)/i);
    nome = companyMatch ? companyMatch[1].trim() : nome;
  } else if (link.includes("/company/")) {
    nome = title.replace(/\s*[|\-–].*/g, "").trim();
  }

  return {
    nome_empresa: nome || "Sem nome",
    telefone: null,
    site: null,
    endereco: null,
    instagram: null,
    linkedin: link.includes("linkedin.com") ? link : null,
  };
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

    const { query, location, apiKey, provider, source } = parsed.data;

    const allResults: any[] = [];
    const targetCount = 60;
    const maxPages = 4;

    if (source === "linkedin") {
      // Search Google for LinkedIn profiles/companies
      const searchQuery = `site:linkedin.com/company ${query} ${location}`;

      if (provider === "serpapi") {
        for (let page = 0; page < maxPages; page++) {
          const start = page * 20;
          console.log(`SerpApi LinkedIn page ${page + 1}, start=${start}`);
          const results = await fetchSerpApi(searchQuery, apiKey, start, "google");
          if (results.length === 0) break;
          allResults.push(...results);
          if (allResults.length >= targetCount) break;
        }
      } else {
        for (let page = 1; page <= maxPages; page++) {
          console.log(`SearchApi LinkedIn page ${page}`);
          const results = await fetchSearchApi(searchQuery, apiKey, page, "google");
          if (results.length === 0) break;
          allResults.push(...results);
          if (allResults.length >= targetCount) break;
        }
      }
    } else {
      // Google Maps search
      const searchQuery = `${query} em ${location}`;

      if (provider === "serpapi") {
        for (let page = 0; page < maxPages; page++) {
          const start = page * 20;
          console.log(`SerpApi page ${page + 1}, start=${start}`);
          const results = await fetchSerpApi(searchQuery, apiKey, start, "google_maps");
          if (results.length === 0) break;
          allResults.push(...results);
          if (allResults.length >= targetCount) break;
        }
      } else {
        for (let page = 1; page <= maxPages; page++) {
          console.log(`SearchApi page ${page}`);
          const results = await fetchSearchApi(searchQuery, apiKey, page, "google_maps");
          if (results.length === 0) break;
          allResults.push(...results);
          if (allResults.length >= targetCount) break;
        }
      }
    }

    // Deduplicate and parse
    const seen = new Set<string>();
    const leads = allResults
      .map((r) => source === "linkedin" ? parseLinkedInResult(r) : parseGoogleMapsResult(r))
      .filter((lead) => {
        const key = `${lead.nome_empresa.toLowerCase()}_${lead.telefone || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

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
