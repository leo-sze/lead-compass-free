const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

// --- AI-powered LinkedIn result parser ---

async function parseLinkedInResultsBatch(
  rawResults: any[],
  searchContext: { jobTitle: string; industry: string; location: string; keywords: string },
  lovableKey: string
): Promise<any[]> {
  const BATCH_SIZE = 10;
  const allParsed: any[] = [];

  for (let i = 0; i < rawResults.length; i += BATCH_SIZE) {
    const batch = rawResults.slice(i, i + BATCH_SIZE);

    const inputData = batch.map((r, idx) => ({
      idx,
      title: (r.title || "").slice(0, 200),
      snippet: (r.snippet || "").slice(0, 300),
      link: r.link || "",
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
              content: `Você é um extrator de dados de resultados de busca do LinkedIn. Extraia informações estruturadas de cada resultado.
Contexto da busca: cargo="${searchContext.jobTitle}", setor="${searchContext.industry}", local="${searchContext.location}", palavras-chave="${searchContext.keywords}".
Regras:
- nome_decisor: nome completo da pessoa (nunca cargos, descrições ou fragmentos)
- nome_empresa: empresa onde a pessoa trabalha. DEVE ser um nome real de empresa. Se não conseguir identificar com certeza, retorne null.
- cargo: cargo/função da pessoa
- relevante: true SOMENTE se o perfil tem relação real com o cargo/setor/local buscado. false para resultados genéricos ou irrelevantes.
- NUNCA invente dados. Se não tiver certeza, retorne null.
- Ignore resultados que são páginas de empresa (/company/) sem pessoa identificável.`
            },
            {
              role: "user",
              content: JSON.stringify(inputData),
            },
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_linkedin_leads",
              description: "Extrai leads estruturados dos resultados do LinkedIn",
              parameters: {
                type: "object",
                properties: {
                  leads: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        idx: { type: "number", description: "Índice do resultado original" },
                        nome_decisor: { type: "string", description: "Nome completo da pessoa" },
                        nome_empresa: { type: "string", description: "Nome da empresa onde trabalha" },
                        cargo: { type: "string", description: "Cargo/função" },
                        relevante: { type: "boolean", description: "Se é relevante para a busca" },
                      },
                      required: ["idx", "nome_decisor", "nome_empresa", "cargo", "relevante"],
                    },
                  },
                },
                required: ["leads"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "extract_linkedin_leads" } },
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          const args = JSON.parse(toolCall.function.arguments);
          const extracted = args.leads || [];

          for (const item of extracted) {
            if (!item.relevante) continue;
            if (!item.nome_empresa || item.nome_empresa === "null" || item.nome_empresa.length < 3) continue;
            if (!item.nome_decisor || item.nome_decisor === "null") continue;

            const original = batch[item.idx];
            if (!original) continue;

            allParsed.push({
              nome_empresa: item.nome_empresa.trim(),
              telefone: null,
              site: null,
              endereco: null,
              instagram: null,
              linkedin: original.link?.includes("linkedin.com") ? original.link : null,
              nome_decisor: item.nome_decisor.trim(),
            });
          }
        }
      } else {
        console.error("AI parse LinkedIn error:", aiRes.status, await aiRes.text());
      }
    } catch (e) {
      console.error("AI LinkedIn batch error:", e);
    }
  }

  return allParsed;
}

const BodySchema = z.object({
  query: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  setor: z.string().max(200).optional(),
  keywords: z.string().max(200).optional(),
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

// Fetch reviews for a place using SerpApi or SearchApi
async function fetchPlaceReviews(
  placeId: string,
  apiKey: string,
  provider: string
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

// Parse address for bairro and estado
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

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return `+55${digits}`;
  return `+55${digits}`;
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
    // Metadata for scoring (transient, not all saved to DB)
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

    const allResults: any[] = [];
    const targetCount = source === "linkedin" ? 20 : 60;
    const maxPages = source === "linkedin" ? 2 : 4;

    if (source === "linkedin") {
      const industryPart = setor ? ` "${setor}"` : "";
      const keywordsPart = keywords ? ` ${keywords}` : "";
      const searchQuery = `site:linkedin.com/in "${query}"${industryPart}${keywordsPart} "${location}"`;

      if (provider === "serpapi") {
        for (let page = 0; page < maxPages; page++) {
          const start = page * 10;
          console.log(`SerpApi LinkedIn page ${page + 1}, start=${start}, q=${searchQuery}`);
          const results = await fetchSerpApi(searchQuery, apiKey, start, "google");
          if (results.length === 0) break;
          allResults.push(...results);
          if (allResults.length >= targetCount) break;
        }
      } else {
        for (let page = 1; page <= maxPages; page++) {
          console.log(`SearchApi LinkedIn page ${page}, q=${searchQuery}`);
          const results = await fetchSearchApi(searchQuery, apiKey, page, "google");
          if (results.length === 0) break;
          allResults.push(...results);
          if (allResults.length >= targetCount) break;
        }
      }

      const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
      const leads = await parseLinkedInResultsBatch(
        allResults,
        { jobTitle: query, industry: setor || "", location, keywords: keywords || "" },
        lovableKey
      );

      const seen = new Set<string>();
      const uniqueLeads = leads.filter((lead) => {
        const key = `${lead.nome_empresa.toLowerCase()}_${(lead.nome_decisor || "").toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return new Response(
        JSON.stringify({ leads: uniqueLeads, total: uniqueLeads.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

      // Parse results
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

      // Fetch reviews for qualifying leads (rating >= 3.5, reviews >= 10)
      console.log(`Fetching reviews for qualifying leads...`);
      const REVIEW_BATCH = 5;
      for (let i = 0; i < leads.length; i += REVIEW_BATCH) {
        const batch = leads.slice(i, i + REVIEW_BATCH);
        const reviewPromises = batch.map((lead) => {
          if (!lead.place_id || (lead.total_reviews || 0) < 10 || (lead.rating || 0) < 3.5) {
            return Promise.resolve([]);
          }
          return fetchPlaceReviews(lead.place_id, apiKey, provider);
        });
        const reviewResults = await Promise.all(reviewPromises);
        batch.forEach((lead, idx) => {
          lead.reviews = reviewResults[idx];
        });
      }
      console.log(`Reviews fetched for ${leads.filter(l => l.reviews.length > 0).length} leads`);

      return new Response(
        JSON.stringify({ leads, total: leads.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
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
  return null;
}
