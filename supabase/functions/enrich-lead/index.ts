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

    const { nome_empresa, site, instagram, linkedin } = parsed.data;

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

    // 1. Scrape direct URLs (site, instagram, linkedin) in parallel
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

    // 2. Web searches for decision maker on LinkedIn and general web
    scrapePromises.push(
      searchWeb(`"${nome_empresa}" CEO OR fundador OR proprietário OR diretor site:linkedin.com`, FIRECRAWL_API_KEY)
    );
    scrapeLabels.push("LinkedIn Search");

    scrapePromises.push(
      searchWeb(`"${nome_empresa}" CEO OR fundador OR sócio OR proprietário OR diretor Brasil`, FIRECRAWL_API_KEY)
    );
    scrapeLabels.push("Web Search");

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

    // 3. AI extraction
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
            content: `Você é um analista que identifica decisores de empresas brasileiras.
REGRAS ESTRITAS:
- Analise o conteúdo fornecido e identifique APENAS nomes de pessoas REAIS que aparecem EXPLICITAMENTE no texto.
- O decisor deve ser alguém com cargo de liderança: CEO, fundador, sócio, proprietário, diretor, gerente geral.
- NUNCA invente nomes. Se o nome não aparecer claramente no conteúdo, retorne "Não identificado".
- NUNCA use o nome da empresa como nome de pessoa.
- Se houver dúvida, retorne "Não identificado".
- Retorne SOMENTE nomes que você encontrou LITERALMENTE no texto fornecido.`
          },
          {
            role: "user",
            content: `Empresa: "${nome_empresa}"\n\nConteúdo extraído de múltiplas fontes (site, LinkedIn, Instagram, busca web):\n${scrapedContent.slice(0, 12000)}\n\nCom base APENAS no conteúdo acima, qual o nome do decisor?`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_decisor",
              description: "Extract the decision maker name from company content",
              parameters: {
                type: "object",
                properties: {
                  nome_decisor: {
                    type: "string",
                    description: "Full name of the decision maker (CEO, owner, founder, director)"
                  },
                  cargo: {
                    type: "string",
                    description: "Role/position of the decision maker"
                  }
                },
                required: ["nome_decisor"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_decisor" } }
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
    let nome_decisor = "Não identificado";
    let cargo = "";

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const args = JSON.parse(toolCall.function.arguments);
        nome_decisor = args.nome_decisor || "Não identificado";
        cargo = args.cargo || "";
      }
    } catch {
      const content = aiData.choices?.[0]?.message?.content;
      if (content && content !== "Não identificado") {
        nome_decisor = content.trim();
      }
    }

    return new Response(
      JSON.stringify({ nome_decisor, cargo }),
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
