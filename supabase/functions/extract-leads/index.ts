const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ─── Shared Utilities ───────────────────────────────────────────

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return null;
  return `+55${digits}`;
}

function extractSocialLink(r: any, platform: string): string | null {
  if (r[platform]) return r[platform];
  const website = r.website || r.link || "";
  if (website.includes(`${platform}.com`)) return website;
  return null;
}

// ─── Firecrawl Search ───────────────────────────────────────────

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

// ─── CNPJ Batch Lookup (Google source) ──────────────────────────

async function lookupCnpjBatch(leads: any[], firecrawlKey: string, lovableKey: string): Promise<any[]> {
  const BATCH_SIZE = 5;
  const results = [...leads];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const searches = await Promise.all(
      batch.map((lead) =>
        searchFirecrawl(
          `"${lead.nome_empresa}" CNPJ sócio OR proprietário OR quadro societário`,
          firecrawlKey, 3
        )
      )
    );

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
              { role: "system", content: "Extraia CNPJ, nome do decisor principal e cidade. Retorne null se não encontrar. NUNCA invente dados." },
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

// ─── LinkedIn: Parse raw title to extract name/company/cargo ────

function parseLinkedInTitle(title: string): { nome: string | null; empresa: string | null; cargo: string | null } {
  // LinkedIn titles: "Name - Title at Company | LinkedIn" or "Name - Title - Company | LinkedIn"
  const cleaned = title.replace(/\s*[\|–—]\s*LinkedIn$/i, "").trim();
  const parts = cleaned.split(/\s*[-–—]\s*/);

  if (parts.length === 0) return { nome: null, empresa: null, cargo: null };

  const nome = parts[0]?.trim() || null;
  let cargo: string | null = null;
  let empresa: string | null = null;

  if (parts.length >= 3) {
    // "Name - Title - Company" or "Name - Title at Company - Extra"
    const secondPart = parts[1].trim();
    const atMatch = secondPart.match(/^(.+?)\s+(?:at|em|na|no|@)\s+(.+)$/i);
    if (atMatch) {
      cargo = atMatch[1].trim();
      empresa = atMatch[2].trim() + (parts.length > 2 ? " - " + parts.slice(2).join(" - ").trim() : "");
    } else {
      cargo = secondPart || null;
      empresa = parts.slice(2).join(" - ").trim() || null;
    }
  } else if (parts.length === 2) {
    const secondPart = parts[1].trim();
    const atMatch = secondPart.match(/^(.+?)\s+(?:at|em|na|no|@)\s+(.+)$/i);
    if (atMatch) {
      cargo = atMatch[1].trim();
      empresa = atMatch[2].trim();
    } else {
      cargo = secondPart;
    }
  }

  return { nome, empresa, cargo };
}

// ─── LinkedIn: Build multiple search queries (Apollo-style) ─────

function buildLinkedInQueries(
  jobTitles: string[],
  location: string,
  industry?: string,
  keywords?: string
): string[] {
  const queries: string[] = [];
  const locationPart = location ? ` "${location}"` : "";
  const industryPart = industry ? ` "${industry}"` : "";
  const keywordsPart = keywords ? ` ${keywords}` : "";

  // Generate one query per job title for better results (like Apollo)
  for (const title of jobTitles) {
    queries.push(
      `site:linkedin.com/in "${title}"${industryPart}${keywordsPart}${locationPart}`
    );
  }

  // If no titles, do a generic search
  if (queries.length === 0) {
    queries.push(`site:linkedin.com/in${industryPart}${keywordsPart}${locationPart}`);
  }

  return queries;
}

// ─── Search API Fetchers ────────────────────────────────────────

async function fetchSerpApi(query: string, apiKey: string, start: number, engine: string): Promise<any[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", engine);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("hl", "pt-br");
  url.searchParams.set("num", "100");
  url.searchParams.set("start", String(start));

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const errBody = await res.text();
      if (res.status === 429 || res.status === 402 || res.status === 401) {
        console.error(`SerpApi rate/auth error [${res.status}]: ${errBody}`);
        return [];
      }
      throw new Error(`SerpApi error [${res.status}]: ${errBody}`);
    }
    const data = await res.json();
    return engine === "google_maps" ? (data.local_results || []) : (data.organic_results || []);
  } catch (e: any) {
    if (e.message?.includes("SerpApi error")) throw e;
    console.error("SerpApi fetch error:", e);
    return [];
  }
}

async function fetchSearchApi(query: string, apiKey: string, page: number, engine: string): Promise<any[]> {
  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", engine);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", "100");
  url.searchParams.set("page", String(page));

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      const errBody = await res.text();
      if (res.status === 429 || res.status === 402 || res.status === 401) {
        console.error(`SearchApi rate/auth error [${res.status}]: ${errBody}`);
        return [];
      }
      throw new Error(`SearchApi error [${res.status}]: ${errBody}`);
    }
    const data = await res.json();
    return engine === "google_maps" ? (data.local_results || []) : (data.organic_results || []);
  } catch (e: any) {
    if (e.message?.includes("SearchApi error")) throw e;
    console.error("SearchApi fetch error:", e);
    return [];
  }
}

// ─── Google Maps Helpers ────────────────────────────────────────

function parseAddressParts(address: string | null): { bairro: string | null; estado: string | null } {
  if (!address) return { bairro: null, estado: null };
  const estadoMatch = address.match(/\b([A-Z]{2})\b(?:\s*,?\s*\d{5})?/);
  const estado = estadoMatch ? estadoMatch[1] : null;
  const parts = address.split(" - ");
  let bairro: string | null = null;
  if (parts.length >= 2) {
    const candidate = parts[1].split(",")[0].trim();
    if (candidate.length > 2 && candidate.length < 50) bairro = candidate;
  }
  return { bairro, estado };
}

function parseGoogleMapsResult(r: any) {
  const priceStr = r.price || "";
  const priceLevel = priceStr.length || (r.price_level ?? null);
  const address = r.address || null;
  const { bairro, estado } = parseAddressParts(address);

  return {
    nome_empresa: r.title || r.name || "Sem nome",
    telefone: normalizePhone(r.phone || null),
    site: r.website || r.link || null,
    endereco: address,
    instagram: extractSocialLink(r, "instagram"),
    linkedin: extractSocialLink(r, "linkedin"),
    nome_decisor: null,
    place_id: r.place_id || null,
    rating: r.rating || null,
    total_reviews: r.reviews || r.user_ratings_total || 0,
    price_level: priceLevel || null,
    categoria: r.type || (r.types && r.types[0]) || null,
    bairro,
    estado,
    reviews: [] as Array<{ text: string; rating: number }>,
  };
}

async function fetchPlaceReviews(
  placeId: string, apiKey: string, provider: string
): Promise<Array<{ text: string; rating: number }>> {
  try {
    let url: URL;
    if (provider === "serpapi") {
      url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_maps_reviews");
      url.searchParams.set("place_id", placeId);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("hl", "pt-br");
      url.searchParams.set("sort_by", "newestFirst");
    } else {
      url = new URL("https://www.searchapi.io/api/v1/search");
      url.searchParams.set("engine", "google_maps_reviews");
      url.searchParams.set("place_id", placeId);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("sort_by", "newestFirst");
    }

    const res = await fetch(url.toString());
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    const reviews = data.reviews || [];
    return reviews.slice(0, 5).map((r: any) => ({
      text: (r.snippet || r.text || r.body || "").slice(0, 500),
      rating: r.rating || 0,
    })).filter((r: any) => r.text.length > 0);
  } catch (e) {
    console.error("Review fetch error for place", placeId, e);
    return [];
  }
}

// ─── LinkedIn Search: Fetch all pages for a query ───────────────

async function fetchLinkedInResults(
  query: string,
  apiKey: string,
  provider: string,
  maxPages: number,
  targetCount: number
): Promise<any[]> {
  const allResults: any[] = [];

  if (provider === "serpapi") {
    for (let page = 0; page < maxPages; page++) {
      const start = page * 100;
      console.log(`SerpApi LinkedIn page ${page + 1}, start=${start}, q=${query}`);
      const results = await fetchSerpApi(query, apiKey, start, "google");
      if (results.length === 0) break;
      allResults.push(...results);
      if (allResults.length >= targetCount) break;
    }
  } else {
    for (let page = 1; page <= maxPages; page++) {
      console.log(`SearchApi LinkedIn page ${page}, q=${query}`);
      const results = await fetchSearchApi(query, apiKey, page, "google");
      if (results.length === 0) break;
      allResults.push(...results);
      if (allResults.length >= targetCount) break;
    }
  }

  return allResults;
}

// ─── LinkedIn: Parse results into leads ─────────────────────────

function parseLinkedInResultsRaw(rawResults: any[]): any[] {
  const leads: any[] = [];

  for (const r of rawResults) {
    const link = r.link || "";
    // Only process personal LinkedIn profiles
    if (!link.includes("linkedin.com/in/")) continue;

    const title = r.title || "";
    const snippet = r.snippet || "";
    const { nome, empresa, cargo } = parseLinkedInTitle(title);

    if (!nome || nome.length < 2) continue;

    // Try to extract location from snippet
    let cidade: string | null = null;
    const locMatch = snippet.match(/(?:^|\n|\.\s*)([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*),\s*([A-Za-zÀ-ú\s]+?)(?:\s*[-–·•]|\s*$)/);
    if (locMatch) {
      cidade = locMatch[1].trim();
    }

    leads.push({
      nome_empresa: empresa && empresa.length >= 2 ? empresa : null,
      nome_decisor: nome,
      cargo: cargo || null,
      telefone: null,
      site: null,
      endereco: null,
      instagram: null,
      linkedin: link,
      cidade,
      snippet: snippet.slice(0, 300),
    });
  }

  return leads;
}

// ─── LinkedIn: AI Enrichment batch ──────────────────────────────

async function enrichLinkedInLeadsBatch(
  leads: any[],
  lovableKey: string
): Promise<any[]> {
  if (!lovableKey) return leads;

  const BATCH_SIZE = 15;
  const results = [...leads];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);

    const inputData = batch.map((l, idx) => ({
      idx,
      nome: l.nome_decisor,
      empresa: l.nome_empresa,
      cargo: l.cargo,
      snippet: l.snippet,
      linkedin: l.linkedin,
    }));

    try {
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `Você é um extrator de dados de decisores do LinkedIn. Para cada pessoa, extraia/complete:
- nome_empresa: nome real da empresa (corrigir/completar se necessário). Se não souber, null.
- cargo: cargo/função limpa (sem "at empresa"). Se não souber, null.
- cidade: cidade onde trabalha. Se não souber, null.
- setor: setor/indústria da empresa. Se não souber, null.
NUNCA invente dados. Retorne null se não tiver certeza.`,
            },
            { role: "user", content: JSON.stringify(inputData) },
          ],
          tools: [{
            type: "function",
            function: {
              name: "enrich_leads",
              description: "Enriquecer dados de leads LinkedIn",
              parameters: {
                type: "object",
                properties: {
                  leads: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        idx: { type: "number" },
                        nome_empresa: { type: "string" },
                        cargo: { type: "string" },
                        cidade: { type: "string" },
                        setor: { type: "string" },
                      },
                      required: ["idx"],
                    },
                  },
                },
                required: ["leads"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "enrich_leads" } },
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          const args = JSON.parse(toolCall.function.arguments);
          const enriched = args.leads || [];
          for (const item of enriched) {
            const idx = i + item.idx;
            if (idx >= results.length) continue;
            if (item.nome_empresa && item.nome_empresa !== "null") {
              results[idx].nome_empresa = item.nome_empresa.trim();
            }
            if (item.cargo && item.cargo !== "null") {
              results[idx].cargo = item.cargo.trim();
            }
            if (item.cidade && item.cidade !== "null") {
              results[idx].cidade = item.cidade.trim();
            }
            if (item.setor && item.setor !== "null") {
              results[idx].setor = item.setor.trim();
            }
          }
        }
      } else {
        console.error("AI enrich error:", aiRes.status, await aiRes.text());
      }
    } catch (e) {
      console.error("AI enrich batch error:", e);
    }
  }

  return results;
}

// ─── LinkedIn: Enrich with company data via Firecrawl ───────────

async function enrichWithCompanyData(
  leads: any[],
  firecrawlKey: string,
  lovableKey: string
): Promise<any[]> {
  if (!firecrawlKey || !lovableKey) return leads;

  const BATCH_SIZE = 5;
  const results = [...leads];

  // Only enrich leads that have a company name but no site/phone
  const needsEnrichment = results.filter(l => l.nome_empresa && !l.site && !l.telefone);
  if (needsEnrichment.length === 0) return results;

  // Limit enrichment to first 50 leads to avoid timeout
  const toEnrich = needsEnrichment.slice(0, 50);

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);
    const searches = await Promise.all(
      batch.map((lead) =>
        searchFirecrawl(`"${lead.nome_empresa}" telefone site contato`, firecrawlKey, 2)
      )
    );

    const extractionPromises = batch.map(async (lead, idx) => {
      const content = searches[idx];
      if (!content.trim()) return { site: null, telefone: null };

      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "Extraia site oficial e telefone principal da empresa. Retorne null se não encontrar. NUNCA invente." },
              { role: "user", content: `Empresa: "${lead.nome_empresa}"\n\n${content.slice(0, 2000)}` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "extract_info",
                parameters: {
                  type: "object",
                  properties: {
                    site: { type: "string" },
                    telefone: { type: "string" },
                  },
                  required: ["site", "telefone"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "extract_info" } },
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            const args = JSON.parse(toolCall.function.arguments);
            return {
              site: args.site && args.site !== "null" ? args.site.trim() : null,
              telefone: args.telefone && args.telefone !== "null" ? normalizePhone(args.telefone) : null,
            };
          }
        }
      } catch (e) { console.error("Company enrich error:", e); }
      return { site: null, telefone: null };
    });

    const extracted = await Promise.all(extractionPromises);
    for (let j = 0; j < batch.length; j++) {
      // Find this lead in the main results array
      const leadToUpdate = batch[j];
      const mainIdx = results.findIndex(r => r.linkedin === leadToUpdate.linkedin);
      if (mainIdx >= 0) {
        results[mainIdx].site = extracted[j].site || null;
        results[mainIdx].telefone = extracted[j].telefone || null;
      }
    }
  }

  return results;
}

// ─── Request Schema ─────────────────────────────────────────────

const BodySchema = z.object({
  query: z.string().min(1).max(500),
  location: z.string().min(1).max(200),
  setor: z.string().max(200).optional(),
  keywords: z.string().max(200).optional(),
  apiKey: z.string().min(1),
  provider: z.enum(["serpapi", "searchapi"]),
  source: z.enum(["google", "linkedin"]).default("google"),
});

// ─── Main Handler ───────────────────────────────────────────────

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

    const { query, location, setor, keywords, apiKey, provider, source } = parsed.data;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";

    if (source === "linkedin") {
      // ─── LinkedIn Flow (Apollo-style) ─────────────────────
      // Split comma-separated job titles into individual queries
      const jobTitles = query.split(/[,;]/).map(t => t.trim()).filter(t => t.length > 0);
      const queries = buildLinkedInQueries(jobTitles, location, setor, keywords);

      console.log(`LinkedIn search: ${jobTitles.length} titles, ${queries.length} queries`);

      // Fetch results for each query
      const allRawResults: any[] = [];
      const maxPagesPerQuery = Math.max(3, Math.floor(10 / queries.length));
      const targetPerQuery = Math.max(50, Math.floor(300 / queries.length));

      for (const q of queries) {
        const results = await fetchLinkedInResults(q, apiKey, provider, maxPagesPerQuery, targetPerQuery);
        allRawResults.push(...results);
      }

      console.log(`Total raw results: ${allRawResults.length}`);

      if (allRawResults.length === 0) {
        return new Response(
          JSON.stringify({ leads: [], total: 0, error: "Nenhum resultado encontrado. Sua cota de buscas pode ter sido atingida. Verifique seu plano do SearchApi/SerpApi.", fallback: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse raw results into structured leads
      let leads = parseLinkedInResultsRaw(allRawResults);
      console.log(`Parsed leads: ${leads.length}`);

      // Deduplicate by LinkedIn URL
      const seenUrls = new Set<string>();
      leads = leads.filter(l => {
        const key = l.linkedin.toLowerCase();
        if (seenUrls.has(key)) return false;
        seenUrls.add(key);
        return true;
      });
      console.log(`Unique leads: ${leads.length}`);

      // AI enrichment (cargo, empresa, cidade, setor)
      if (lovableKey) {
        leads = await enrichLinkedInLeadsBatch(leads, lovableKey);
      }

      // Keep leads even without empresa - use nome_decisor as fallback
      leads = leads.map(l => ({
        ...l,
        nome_empresa: l.nome_empresa && l.nome_empresa.length >= 2 ? l.nome_empresa : (l.nome_decisor || "Desconhecido"),
      }));

      // Enrich with company data (site, phone) via Firecrawl
      if (firecrawlKey && lovableKey) {
        leads = await enrichWithCompanyData(leads, firecrawlKey, lovableKey);
      }

      // Clean up internal fields before returning
      const cleanLeads = leads.map(l => ({
        nome_empresa: l.nome_empresa,
        nome_decisor: l.nome_decisor,
        cargo: l.cargo || null,
        telefone: l.telefone || null,
        site: l.site || null,
        endereco: null,
        instagram: null,
        linkedin: l.linkedin,
        cidade: l.cidade || null,
        setor: l.setor || null,
      }));

      return new Response(
        JSON.stringify({ leads: cleanLeads, total: cleanLeads.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      // ─── Google Maps Flow ─────────────────────────────────
      const searchQuery = `${query} em ${location}`;
      const allResults: any[] = [];
      const maxPages = 4;

      if (provider === "serpapi") {
        for (let page = 0; page < maxPages; page++) {
          const start = page * 20;
          console.log(`SerpApi page ${page + 1}, start=${start}`);
          const results = await fetchSerpApi(searchQuery, apiKey, start, "google_maps");
          if (results.length === 0) break;
          allResults.push(...results);
          if (allResults.length >= 60) break;
        }
      } else {
        for (let page = 1; page <= maxPages; page++) {
          console.log(`SearchApi page ${page}`);
          const results = await fetchSearchApi(searchQuery, apiKey, page, "google_maps");
          if (results.length === 0) break;
          allResults.push(...results);
          if (allResults.length >= 60) break;
        }
      }

      const seen = new Set<string>();
      const leads = allResults
        .map((r) => parseGoogleMapsResult(r))
        .filter((lead) => {
          if (lead.nome_empresa === "Sem nome") return false;
          const key = `${lead.nome_empresa.toLowerCase()}_${lead.telefone || ""}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      // Fetch reviews
      console.log(`Fetching reviews for qualifying leads...`);
      const REVIEW_BATCH = 5;
      for (let i = 0; i < leads.length; i += REVIEW_BATCH) {
        const batch = leads.slice(i, i + REVIEW_BATCH);
        const reviewPromises = batch.map((lead) => {
          if (!lead.place_id || lead.total_reviews < 10 || (lead.rating || 0) < 3.5) {
            return Promise.resolve([]);
          }
          return fetchPlaceReviews(lead.place_id, apiKey, provider);
        });
        const reviewResults = await Promise.all(reviewPromises);
        for (let j = 0; j < batch.length; j++) {
          leads[i + j].reviews = reviewResults[j];
        }
      }

      // CNPJ lookup
      let enrichedLeads = leads;
      if (firecrawlKey && lovableKey) {
        enrichedLeads = await lookupCnpjBatch(leads, firecrawlKey, lovableKey);
      }

      return new Response(
        JSON.stringify({ leads: enrichedLeads, total: enrichedLeads.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("extract-leads error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
