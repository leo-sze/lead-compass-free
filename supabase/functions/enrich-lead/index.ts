import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BodySchema = z.object({
  nome_empresa: z.string().min(1),
  site: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  endereco: z.string().nullable().optional(),
  nome_decisor: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
});

async function scrapeUrl(url: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (res.ok) {
      const data = await res.json();
      const md = data.data?.markdown || data.markdown || "";
      return md.slice(0, 3000);
    }
  } catch (e) {
    console.error(`Scrape error ${url}:`, e);
  }
  return "";
}

async function searchWeb(query: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const results = data.data || [];
      return results
        .map((r: any) => `--- ${r.url} ---\n${(r.markdown || r.description || "").slice(0, 2000)}`)
        .join("\n\n");
    }
  } catch (e) {
    console.error(`Search error:`, e);
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { nome_empresa, site, instagram, linkedin, telefone, endereco, nome_decisor, cidade } = parsed.data;

    // Determine which fields are missing
    const missingFields: string[] = [];
    if (!telefone) missingFields.push("telefone");
    if (!site) missingFields.push("site");
    if (!instagram) missingFields.push("instagram");
    if (!linkedin) missingFields.push("linkedin");
    if (!endereco) missingFields.push("endereco");
    if (!nome_decisor || nome_decisor === "Não identificado") missingFields.push("nome_decisor");
    if (!cidade) missingFields.push("cidade");

    if (missingFields.length === 0) {
      return new Response(
        JSON.stringify({ message: "All fields already filled", updates: {} }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Scrape existing URLs in parallel
    const scrapePromises: Promise<string>[] = [];
    const scrapeLabels: string[] = [];

    if (site) {
      scrapePromises.push(scrapeUrl(site, FIRECRAWL_API_KEY));
      scrapeLabels.push(site);
    }
    if (instagram) {
      scrapePromises.push(scrapeUrl(instagram, FIRECRAWL_API_KEY));
      scrapeLabels.push(instagram);
    }
    if (linkedin) {
      scrapePromises.push(scrapeUrl(linkedin, FIRECRAWL_API_KEY));
      scrapeLabels.push(linkedin);
    }

    // 2. Web search for company info
    const locationQuery = cidade ? ` "${cidade}"` : "";
    scrapePromises.push(
      searchWeb(`"${nome_empresa}"${locationQuery} telefone site instagram contato`, FIRECRAWL_API_KEY)
    );
    scrapeLabels.push("Web Search - Contact");

    scrapePromises.push(
      searchWeb(`"${nome_empresa}" CEO OR fundador OR proprietário OR diretor OR sócio site:linkedin.com`, FIRECRAWL_API_KEY)
    );
    scrapeLabels.push("LinkedIn Search");

    // 3. Econodata and CNPJ lookup for decision makers
    scrapePromises.push(
      searchWeb(`"${nome_empresa}"${locationQuery} site:econodata.com.br sócio OR decisor OR proprietário`, FIRECRAWL_API_KEY)
    );
    scrapeLabels.push("Econodata Search");

    scrapePromises.push(
      searchWeb(`"${nome_empresa}"${locationQuery} CNPJ sócio OR quadro societário OR administrador`, FIRECRAWL_API_KEY)
    );
    scrapeLabels.push("CNPJ Search");

    const scrapeResults = await Promise.all(scrapePromises);

    let scrapedContent = "";
    for (let i = 0; i < scrapeResults.length; i++) {
      if (scrapeResults[i]) {
        scrapedContent += `\n\n=== Fonte: ${scrapeLabels[i]} ===\n${scrapeResults[i]}`;
      }
    }

    if (!scrapedContent.trim()) {
      scrapedContent = `Empresa: ${nome_empresa}. Nenhum conteúdo encontrado.`;
    }

    // 3. Build AI extraction for missing fields only
    const fieldDescriptions: Record<string, string> = {
      telefone: "Telefone com DDD (formato brasileiro, ex: (54) 99999-1234)",
      site: "URL do site oficial da empresa (ex: https://empresa.com.br)",
      instagram: "URL completa do perfil Instagram (ex: https://instagram.com/empresa)",
      linkedin: "URL completa da página LinkedIn (ex: https://linkedin.com/company/empresa)",
      endereco: "Endereço físico completo",
      nome_decisor: "Nome completo do principal decisor (CEO, fundador, sócio, proprietário, diretor)",
    };

    const properties: Record<string, any> = {};
    for (const field of missingFields) {
      properties[field] = {
        type: "string",
        description: fieldDescriptions[field] || field,
      };
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um analista de dados B2B brasileiro. Extraia APENAS informações que aparecem EXPLICITAMENTE no conteúdo fornecido.

REGRAS:
- NUNCA invente dados. Se a informação não estiver claramente no texto, use null.
- Telefones devem estar no formato brasileiro com DDD.
- URLs devem ser completas (com https://).
- Para nome_decisor, busque apenas pessoas com cargos de liderança que apareçam LITERALMENTE no texto.
- NUNCA use o nome da empresa como nome de pessoa.
- Se houver dúvida, use null.`
          },
          {
            role: "user",
            content: `Empresa: "${nome_empresa}"${cidade ? ` em ${cidade}` : ""}

Dados já conhecidos:
${telefone ? `- Telefone: ${telefone}` : "- Telefone: FALTANDO"}
${site ? `- Site: ${site}` : "- Site: FALTANDO"}
${instagram ? `- Instagram: ${instagram}` : "- Instagram: FALTANDO"}
${linkedin ? `- LinkedIn: ${linkedin}` : "- LinkedIn: FALTANDO"}
${endereco ? `- Endereço: ${endereco}` : "- Endereço: FALTANDO"}
${nome_decisor ? `- Decisor: ${nome_decisor}` : "- Decisor: FALTANDO"}

Conteúdo extraído:
${scrapedContent.slice(0, 12000)}

Extraia os dados FALTANDO com base no conteúdo acima.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_lead_data",
              description: "Extract missing lead data from scraped content",
              parameters: {
                type: "object",
                properties,
                required: missingFields,
                additionalProperties: false,
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_lead_data" } }
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA insuficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Erro ao consultar IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const updates: Record<string, string | null> = {};

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const args = JSON.parse(toolCall.function.arguments);
        for (const field of missingFields) {
          const val = args[field];
          if (val && val !== "null" && val !== "Não identificado" && val !== "N/A" && val !== "não encontrado" && val.trim() !== "") {
            updates[field] = val.trim();
          }
        }
      }
    } catch {
      console.error("Failed to parse AI response");
    }

    // Backward compatibility: also return nome_decisor at top level
    return new Response(
      JSON.stringify({
        nome_decisor: updates.nome_decisor || nome_decisor || "Não identificado",
        cargo: "",
        updates,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("enrich-lead error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
