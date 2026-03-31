const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

async function searchFirecrawl(query: string, apiKey: string, limit = 3): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ["markdown"] } }),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.data || [])
        .map((r: any) => `${r.title || ""}\n${(r.markdown || r.description || "").slice(0, 1500)}`)
        .join("\n---\n");
    }
  } catch (e) { console.error("Firecrawl search error:", e); }
  return "";
}

async function lookupCnpjBatch(leads: any[], firecrawlKey: string, lovableKey: string): Promise<any[]> {
  const BATCH_SIZE = 5;
  const results = [...leads];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const searches = await Promise.all(
      batch.map((lead) =>
        searchFirecrawl(
          `"${lead.nome_empresa}" CNPJ sócio OR proprietário OR quadro societário`,
          firecrawlKey,
          3
        )
      )
    );

    // Use AI to extract CNPJ + decisor from search results
    const extractionPromises = batch.map(async (lead, idx) => {
      const content = searches[idx];
      if (!content.trim()) return { cnpj: null, nome_decisor: lead.nome_decisor, cidade: null };

      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "Extraia CNPJ, nome do decisor principal (sócio/proprietário/diretor) e cidade da empresa. Retorne null se não encontrar. NUNCA invente dados." },
              { role: "user", content: `Empresa: "${lead.nome_empresa}"\n\nConteúdo:\n${content.slice(0, 4000)}` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "extract_cnpj",
                parameters: {
                  type: "object",
                  properties: {
                    cnpj: { type: "string", description: "CNPJ no formato XX.XXX.XXX/XXXX-XX" },
                    nome_decisor: { type: "string", description: "Nome do sócio/proprietário/diretor" },
                    cidade: { type: "string", description: "Cidade da empresa" },
                  },
                  required: ["cnpj", "nome_decisor", "cidade"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "extract_cnpj" } },
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            const args = JSON.parse(toolCall.function.arguments);
            return {
              cnpj: args.cnpj && args.cnpj !== "null" ? args.cnpj.trim() : null,
              nome_decisor: args.nome_decisor && args.nome_decisor !== "null" ? args.nome_decisor.trim() : lead.nome_decisor,
              cidade: args.cidade && args.cidade !== "null" ? args.cidade.trim() : null,
            };
          }
        }
      } catch (e) { console.error("AI extract error:", e); }
      return { cnpj: null, nome_decisor: lead.nome_decisor, cidade: null };
    });

    const extracted = await Promise.all(extractionPromises);
    for (let j = 0; j < batch.length; j++) {
      const idx = i + j;
      results[idx] = {
        ...results[idx],
        cnpj: extracted[j].cnpj || results[idx].cnpj || null,
        nome_decisor: extracted[j].nome_decisor || results[idx].nome_decisor,
        cidade: extracted[j].cidade || results[idx].cidade || null,
      };
    }
  }

  return results;
}

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
  url.searchParams.set("start", String(start));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`SerpApi error [${res.status}]: ${errBody}`);
  }
  const data = await res.json();
  return engine === "google_maps" ? (data.local_results || []) : (data.organic_results || []);
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
  return engine === "google_maps" ? (data.local_results || []) : (data.organic_results || []);
}

function parseGoogleMapsResult(r: any) {
  return {
    nome_empresa: r.title || r.name || "Sem nome",
    telefone: r.phone || null,
    site: r.website || r.link || null,
    endereco: r.address || null,
    instagram: extractSocialLink(r, "instagram"),
    linkedin: extractSocialLink(r, "linkedin"),
    nome_decisor: null,
  };
}

function parseLinkedInResult(r: any) {
  const title = r.title || "";
  const snippet = r.snippet || "";
  const link = r.link || "";

  let nome_empresa = "";
  let nome_decisor: string | null = null;

  if (link.includes("/company/")) {
    // Company page: extract company name from title
    nome_empresa = title.replace(/\s*[|\-–].*LinkedIn.*/gi, "").replace(/\s*LinkedIn$/i, "").trim();
  } else if (link.includes("/in/")) {
    // Person profile: the title IS the person, extract company from snippet
    nome_decisor = title.replace(/\s*[|\-–].*LinkedIn.*/gi, "").replace(/\s*LinkedIn$/i, "").trim();
    
    // Try to find company name in snippet
    const companyPatterns = [
      /(?:at|em|na|no|@)\s+([^.·|,\-–]+)/i,
      /(?:CEO|Fundador|Sócio|Diretor|Proprietário|Owner|Founder|Managing)\s+(?:at|em|na|no|de|da|do|@|-|–)\s*([^.·|,]+)/i,
    ];
    for (const pattern of companyPatterns) {
      const match = snippet.match(pattern);
      if (match) {
        nome_empresa = match[1].trim();
        break;
      }
    }

    // If no company found, use first meaningful part of snippet
    if (!nome_empresa) {
      nome_empresa = snippet.split(/[.·|]/)[0]?.trim() || title;
    }
  } else {
    nome_empresa = title.replace(/\s*[|\-–].*LinkedIn.*/gi, "").trim();
  }

  return {
    nome_empresa: nome_empresa || "Sem nome",
    telefone: null,
    site: null,
    endereco: null,
    instagram: null,
    linkedin: link.includes("linkedin.com") ? link : null,
    nome_decisor,
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
      const queryLower = query.toLowerCase();
      // Use intitle to force term in page title; separate queries for companies vs people
      const searchQueries = [
        `site:linkedin.com/company intitle:"${query}" "${location}"`,
        `site:linkedin.com/in "${query}" "${location}" (proprietário OR dono OR CEO OR fundador OR diretor OR sócio OR owner OR founder)`,
      ];

      for (const searchQuery of searchQueries) {
        if (provider === "serpapi") {
          for (let page = 0; page < maxPages; page++) {
            const start = page * 10;
            console.log(`SerpApi LinkedIn page ${page + 1}, start=${start}, q=${searchQuery}`);
            const results = await fetchSerpApi(searchQuery, apiKey, start, "google");
            if (results.length === 0) break;
            // Post-filter: title or snippet must mention the search term
            const filtered = results.filter((r: any) => {
              const t = (r.title || "").toLowerCase();
              const s = (r.snippet || "").toLowerCase();
              return t.includes(queryLower) || s.includes(queryLower);
            });
            allResults.push(...filtered);
            if (allResults.length >= targetCount) break;
          }
        } else {
          for (let page = 1; page <= maxPages; page++) {
            console.log(`SearchApi LinkedIn page ${page}, q=${searchQuery}`);
            const results = await fetchSearchApi(searchQuery, apiKey, page, "google");
            if (results.length === 0) break;
            const filtered = results.filter((r: any) => {
              const t = (r.title || "").toLowerCase();
              const s = (r.snippet || "").toLowerCase();
              return t.includes(queryLower) || s.includes(queryLower);
            });
            allResults.push(...filtered);
            if (allResults.length >= targetCount) break;
          }
        }
        if (allResults.length >= targetCount) break;
      }
    } else {
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
    let leads = allResults
      .map((r) => source === "linkedin" ? parseLinkedInResult(r) : parseGoogleMapsResult(r))
      .filter((lead) => {
        const key = `${lead.nome_empresa.toLowerCase()}_${lead.telefone || ""}`;
        if (seen.has(key) || lead.nome_empresa === "Sem nome") return false;
        seen.add(key);
        return true;
      });

    // Lookup CNPJ + decisor via Firecrawl + AI before returning
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (FIRECRAWL_API_KEY && LOVABLE_API_KEY) {
      console.log(`Looking up CNPJ for ${leads.length} leads...`);
      leads = await lookupCnpjBatch(leads, FIRECRAWL_API_KEY, LOVABLE_API_KEY);
      console.log("CNPJ lookup complete");
    }

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
