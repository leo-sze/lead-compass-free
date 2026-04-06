import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BodySchema = z.object({
  nome_empresa: z.string().min(1),
  endereco: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  estado: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  total_reviews: z.number().nullable().optional(),
  website: z.string().nullable().optional(),
  price_level: z.number().nullable().optional(),
  categoria: z.string().nullable().optional(),
  reviews: z.array(z.object({
    text: z.string(),
    rating: z.number(),
  })).optional().default([]),
});

// --- Research functions ---

async function searchGoogleMaps(nome: string, cidade: string | null): Promise<any | null> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return null;

  const query = `${nome} ${cidade || ""} avaliações Google Maps`;
  console.log(`[RESEARCH] Firecrawl search: "${query}"`);

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 3,
        lang: "pt-br",
        country: "BR",
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (!res.ok) {
      console.error(`[RESEARCH] Firecrawl error: ${res.status}`);
      const errText = await res.text();
      console.error(errText);
      return null;
    }

    const data = await res.json();
    const results = data?.data || [];
    console.log(`[RESEARCH] Firecrawl returned ${results.length} results`);

    // Combine markdown from results
    const combinedText = results
      .map((r: any) => `### ${r.title || r.url}\n${(r.markdown || r.description || "").slice(0, 2000)}`)
      .join("\n\n");

    return combinedText || null;
  } catch (e) {
    console.error("[RESEARCH] Firecrawl fetch error:", e);
    return null;
  }
}

async function searchCompanyWebsite(website: string): Promise<string | null> {
  if (!website) return null;
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return null;

  let url = website.trim();
  if (!url.startsWith("http")) url = `https://${url}`;

  console.log(`[RESEARCH] Scraping website: ${url}`);

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    if (!res.ok) {
      console.error(`[RESEARCH] Website scrape error: ${res.status}`);
      await res.text();
      return null;
    }

    const data = await res.json();
    const markdown = data?.data?.markdown || data?.markdown || "";
    console.log(`[RESEARCH] Website scraped: ${markdown.length} chars`);
    return markdown.slice(0, 3000) || null;
  } catch (e) {
    console.error("[RESEARCH] Website scrape error:", e);
    return null;
  }
}

function hasRealData(d: z.infer<typeof BodySchema>): boolean {
  return (d.total_reviews != null && d.total_reviews > 0) || (d.reviews && d.reviews.length > 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const d = parsed.data;
    let totalReviews = d.total_reviews ?? 0;
    let rating = d.rating ?? 0;
    let reviewsText = "";
    let researchContext = "";

    // If no real data (list import), research the company first
    if (!hasRealData(d)) {
      console.log(`[RESEARCH] No real data for "${d.nome_empresa}", researching...`);

      // Parallel: search Google + scrape website
      const [googleData, websiteData] = await Promise.all([
        searchGoogleMaps(d.nome_empresa, d.cidade || null),
        d.website ? searchCompanyWebsite(d.website) : Promise.resolve(null),
      ]);

      if (googleData) {
        researchContext += `\n\nDADOS ENCONTRADOS NA WEB (Google/avaliações):\n${googleData}`;
      }
      if (websiteData) {
        researchContext += `\n\nCONTEÚDO DO SITE DA EMPRESA:\n${websiteData}`;
      }

      if (!googleData && !websiteData) {
        console.log(`[RESEARCH] No data found for "${d.nome_empresa}"`);
        return new Response(JSON.stringify({
          score: 15,
          classificacao: "frio",
          justificativa: "Não foi possível encontrar informações suficientes sobre esta empresa na web para uma análise confiável.",
          sinais_positivos: [],
          sinais_negativos: ["Sem presença digital identificável", "Sem avaliações encontradas"],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      // Has real Google Maps data — use pre-filters
      if (totalReviews < 10) {
        return new Response(JSON.stringify({
          score: 0,
          classificacao: "desqualificado",
          justificativa: "Volume de avaliações insuficiente para análise confiável.",
          sinais_positivos: [],
          sinais_negativos: ["Menos de 10 avaliações"],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (rating > 0 && rating < 3.5) {
        return new Response(JSON.stringify({
          score: 0,
          classificacao: "desqualificado",
          justificativa: `Reputação abaixo do mínimo aceitável (nota ${rating}/5).`,
          sinais_positivos: [],
          sinais_negativos: [`Nota ${rating}/5 abaixo do mínimo de 3.5`],
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      reviewsText = d.reviews.length > 0
        ? d.reviews.map(r => `[${r.rating}★] ${r.text}`).join('\n')
        : "Nenhuma avaliação textual disponível";
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é um especialista em qualificação de leads B2B para agências digitais brasileiras. Sua tarefa é analisar dados de um negócio e determinar se ele tem perfil financeiro para contratar serviços de marketing digital por R$3.000 a R$5.000/mês.`;

    // Build different prompts depending on whether we have Maps data or researched data
    let userPrompt: string;

    if (hasRealData(d)) {
      // Original prompt for Google Maps leads
      userPrompt = `Analise este negócio e classifique-o.

DADOS DO NEGÓCIO:
- Nome: ${d.nome_empresa}
- Categoria: ${d.categoria || 'não informado'}
- Localização: ${d.bairro || 'não informado'}, ${d.cidade || 'não informado'} - ${d.estado || 'não informado'}
- Endereço completo: ${d.endereco || 'não informado'}
- Avaliação média: ${rating}/5 (${totalReviews} avaliações)
- Tem website: ${d.website ? 'sim' : 'não'}
- Nível de preço: ${d.price_level ? d.price_level : 'não informado'}

AVALIAÇÕES DOS CLIENTES (até 5 mais recentes):
${reviewsText}`;
    } else {
      // Research-based prompt for list leads
      userPrompt = `Analise este negócio usando os dados reais encontrados na web. Baseie sua análise APENAS nos fatos encontrados, não invente informações.

DADOS BÁSICOS DO LEAD:
- Nome: ${d.nome_empresa}
- Cidade: ${d.cidade || 'não informado'}
- Website: ${d.website || 'não informado'}
${researchContext}`;
    }

    userPrompt += `

CRITÉRIOS DE ANÁLISE:
1. LOCALIZAÇÃO (peso 25%)
Avalie o perfil socioeconômico da localização considerando:
- Em capitais: bairros nobres/comerciais consolidados valem mais
- Em cidades médias: presença no centro ou bairro principal já é positivo
- Cidades do interior com população acima de 200k têm potencial similar a capitais menores
- Condomínios e shoppings indicam ticket alto
- Periferia de capitais: qualificar pelo volume de reviews, não pelo bairro

2. PRESENÇA DIGITAL E REPUTAÇÃO (peso 40%)
Buscar ativamente:
Sinais de negócio consolidado e com investimento:
- Menções a estrutura, equipamentos novos, espaço amplo, reformas
- Menções a múltiplas unidades ou franquia
- Menções a profissionais especializados, equipe grande
- Clientes que pagam planos premium (personal, assessoria VIP)
- Site profissional, redes sociais ativas
- Eventos, competições, patrocínios mencionados

Sinais de negócio pequeno ou sem margem:
- Reclamações sem resolução
- Estrutura mínima, "um só dono"
- Sem presença digital relevante

3. MATURIDADE DO NEGÓCIO (peso 35%)
- Website próprio e profissional = investe em presença digital (+)
- Presença em redes sociais com engajamento (+)
- Múltiplas unidades ou franquias (+)
- Negócio com equipe grande (+)
- Negócio recém-aberto ou muito pequeno (-)

CLASSIFICAÇÃO FINAL:
- 70–100 = quente (tem perfil claro para o ticket)
- 40–69  = morno (tem potencial mas precisa validar)
- 20–39  = frio (pequeno demais ou sem margem aparente)
- 0–19   = desqualificado (não tem perfil)`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "score_lead",
            description: "Retorna a análise de qualidade do lead B2B",
            parameters: {
              type: "object",
              properties: {
                score: { type: "number", description: "Score de 0 a 100" },
                classificacao: { type: "string", enum: ["quente", "morno", "frio", "desqualificado"] },
                justificativa: { type: "string", description: "2-3 frases diretas explicando a nota" },
                sinais_positivos: { type: "array", items: { type: "string" }, description: "Lista de sinais positivos identificados" },
                sinais_negativos: { type: "array", items: { type: "string" }, description: "Lista de sinais negativos identificados" },
              },
              required: ["score", "classificacao", "justificativa", "sinais_positivos", "sinais_negativos"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "score_lead" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos em Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error [${aiRes.status}]`);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI não retornou resultado estruturado");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({
      score: Math.max(0, Math.min(100, Math.round(result.score || 0))),
      classificacao: result.classificacao || "frio",
      justificativa: result.justificativa || "",
      sinais_positivos: Array.isArray(result.sinais_positivos) ? result.sinais_positivos : [],
      sinais_negativos: Array.isArray(result.sinais_negativos) ? result.sinais_negativos : [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("score-lead error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
