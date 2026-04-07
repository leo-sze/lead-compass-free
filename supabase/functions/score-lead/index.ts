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

// --- Firecrawl helpers ---

async function firecrawlSearch(query: string, apiKey: string, limit = 3): Promise<any[]> {
  console.log(`[SEARCH] "${query}"`);
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit, lang: "pt-br", country: "BR", scrapeOptions: { formats: ["markdown"] } }),
    });
    if (!res.ok) { console.error(`[SEARCH] error ${res.status}`); await res.text(); return []; }
    const data = await res.json();
    return data?.data || [];
  } catch (e) { console.error("[SEARCH] fetch error:", e); return []; }
}

async function firecrawlScrape(url: string, apiKey: string): Promise<string | null> {
  let u = url.trim();
  if (!u.startsWith("http")) u = `https://${u}`;
  console.log(`[SCRAPE] ${u}`);
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: u, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) { console.error(`[SCRAPE] error ${res.status}`); await res.text(); return null; }
    const data = await res.json();
    const md = data?.data?.markdown || data?.markdown || "";
    console.log(`[SCRAPE] got ${md.length} chars`);
    return md.slice(0, 4000) || null;
  } catch (e) { console.error("[SCRAPE] error:", e); return null; }
}

// --- Stage 1: Find company website ---

const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "linkedin.com", "twitter.com", "x.com", "youtube.com", "tiktok.com"];
const DIRECTORY_DOMAINS = ["yelp.com", "tripadvisor.com", "reclameaqui.com", "google.com/maps", "maps.google", "ifood.com", "rappi.com", "apontador.com"];

function isCompanySite(url: string): boolean {
  const lower = url.toLowerCase();
  return ![...SOCIAL_DOMAINS, ...DIRECTORY_DOMAINS].some(d => lower.includes(d));
}

async function findCompanyWebsite(nome: string, cidade: string | null, apiKey: string): Promise<string | null> {
  const query = `"${nome}" ${cidade || ""} site oficial`;
  const results = await firecrawlSearch(query, apiKey, 5);
  for (const r of results) {
    if (r.url && isCompanySite(r.url)) {
      console.log(`[WEBSITE] Found: ${r.url}`);
      return r.url;
    }
  }
  console.log("[WEBSITE] Not found");
  return null;
}

// --- Stage 2: Parallel enrichment ---

async function searchReputation(nome: string, cidade: string | null, apiKey: string): Promise<string | null> {
  const query = `"${nome}" ${cidade || ""} avaliações OR opinião OR review OR reclamação`;
  const results = await firecrawlSearch(query, apiKey, 3);
  if (results.length === 0) return null;
  const text = results
    .map((r: any) => `### ${r.title || r.url}\n${(r.markdown || r.description || "").slice(0, 2000)}`)
    .join("\n\n");
  return text || null;
}

async function searchSocialMedia(nome: string, cidade: string | null, apiKey: string): Promise<string | null> {
  const query = `"${nome}" ${cidade || ""} instagram OR facebook OR linkedin`;
  const results = await firecrawlSearch(query, apiKey, 3);
  if (results.length === 0) return null;
  const text = results
    .map((r: any) => `- ${r.title || ""}: ${r.url} — ${(r.description || "").slice(0, 300)}`)
    .join("\n");
  return text || null;
}

// --- Helpers ---

function hasRealData(d: z.infer<typeof BodySchema>): boolean {
  return (d.total_reviews != null && d.total_reviews > 0) || (d.reviews && d.reviews.length > 0);
}

function jsonResp(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonResp({ error: parsed.error.flatten().fieldErrors }, 400);

    const d = parsed.data;
    let reviewsText = "";
    let researchContext = "";
    let websiteEncontrado: string | null = null;

    const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");

    if (!hasRealData(d)) {
      // === 3-STAGE RESEARCH FOR LIST LEADS ===
      console.log(`[RESEARCH] No real data for "${d.nome_empresa}", starting 3-stage research...`);

      if (!FIRECRAWL_KEY) {
        return jsonResp({
          score: 15, classificacao: "frio",
          justificativa: "Chave Firecrawl não configurada. Não foi possível pesquisar a empresa.",
          sinais_positivos: [], sinais_negativos: ["Sem pesquisa disponível"],
        });
      }

      // Stage 1: Find website
      const foundWebsite = d.website || await findCompanyWebsite(d.nome_empresa, d.cidade || null, FIRECRAWL_KEY);
      if (foundWebsite) websiteEncontrado = foundWebsite;

      // Stage 2: Parallel enrichment
      const [siteContent, reputation, social] = await Promise.all([
        foundWebsite ? firecrawlScrape(foundWebsite, FIRECRAWL_KEY) : Promise.resolve(null),
        searchReputation(d.nome_empresa, d.cidade || null, FIRECRAWL_KEY),
        searchSocialMedia(d.nome_empresa, d.cidade || null, FIRECRAWL_KEY),
      ]);

      if (!siteContent && !reputation && !social) {
        console.log(`[RESEARCH] No data found for "${d.nome_empresa}"`);
        return jsonResp({
          score: 15, classificacao: "frio",
          justificativa: "Não foi possível encontrar informações suficientes sobre esta empresa na web.",
          sinais_positivos: [], sinais_negativos: ["Sem presença digital identificável"],
          website_encontrado: websiteEncontrado,
        });
      }

      if (siteContent) researchContext += `\n\nSITE DA EMPRESA (${foundWebsite}):\n${siteContent}`;
      if (reputation) researchContext += `\n\nREPUTAÇÃO E AVALIAÇÕES:\n${reputation}`;
      if (social) researchContext += `\n\nPRESENÇA EM REDES SOCIAIS:\n${social}`;

    } else {
      // === GOOGLE MAPS LEADS (existing flow) ===
      const totalReviews = d.total_reviews ?? 0;
      const rating = d.rating ?? 0;

      if (totalReviews < 10) {
        return jsonResp({
          score: 0, classificacao: "desqualificado",
          justificativa: "Volume de avaliações insuficiente para análise confiável.",
          sinais_positivos: [], sinais_negativos: ["Menos de 10 avaliações"],
        });
      }

      if (rating > 0 && rating < 3.5) {
        return jsonResp({
          score: 0, classificacao: "desqualificado",
          justificativa: `Reputação abaixo do mínimo aceitável (nota ${rating}/5).`,
          sinais_positivos: [], sinais_negativos: [`Nota ${rating}/5 abaixo do mínimo de 3.5`],
        });
      }

      reviewsText = d.reviews.length > 0
        ? d.reviews.map(r => `[${r.rating}★] ${r.text}`).join('\n')
        : "Nenhuma avaliação textual disponível";
    }

    // === AI ANALYSIS ===
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é um especialista em qualificação de leads B2B para agências digitais brasileiras. Sua tarefa é analisar dados de um negócio e determinar se ele tem perfil financeiro para contratar serviços de marketing digital por R$3.000 a R$5.000/mês.`;

    let userPrompt: string;

    if (hasRealData(d)) {
      const rating = d.rating ?? 0;
      const totalReviews = d.total_reviews ?? 0;
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
      userPrompt = `Analise este negócio usando EXCLUSIVAMENTE os dados reais encontrados na web abaixo. NÃO invente informações.

IMPORTANTE: Valide se os dados encontrados realmente pertencem à empresa "${d.nome_empresa}" de ${d.cidade || 'cidade não informada'}. Se houver dúvida sobre a correspondência, reduza o score.

DADOS BÁSICOS DO LEAD:
- Nome: ${d.nome_empresa}
- Cidade: ${d.cidade || 'não informado'}
- Website informado: ${d.website || 'nenhum'}
${researchContext}`;
    }

    userPrompt += `

CRITÉRIOS DE ANÁLISE:
1. LOCALIZAÇÃO (peso 25%)
- Em capitais: bairros nobres/comerciais consolidados valem mais
- Em cidades médias: presença no centro ou bairro principal já é positivo
- Condomínios e shoppings indicam ticket alto

2. PRESENÇA DIGITAL E REPUTAÇÃO (peso 40%)
Sinais positivos: estrutura ampla, equipamentos novos, múltiplas unidades, equipe grande, site profissional, redes sociais ativas
Sinais negativos: reclamações sem resolução, estrutura mínima, sem presença digital

3. MATURIDADE DO NEGÓCIO (peso 35%)
- Website próprio e profissional (+)
- Presença em redes sociais com engajamento (+)
- Múltiplas unidades ou franquias (+)
- Negócio recém-aberto ou muito pequeno (-)

CLASSIFICAÇÃO FINAL:
- 70–100 = quente | 40–69 = morno | 20–39 = frio | 0–19 = desqualificado

4. TAG DE CLASSIFICAÇÃO (obrigatório)
Escolha EXATAMENTE UMA tag que melhor descreve o tipo de negócio:
- B2B - FABRICANTE (fábricas, indústrias que produzem produtos)
- B2B - DISTRIBUIDOR (distribuidores, atacadistas, representantes)
- B2C - LOJA (lojas de varejo, e-commerce)
- B2C - ESCOLA (escolas, cursos, instituições de ensino)
- B2C - ACADEMIA (academias, estúdios fitness, CrossFit)
- B2C - QUADRA (quadras esportivas, campos, arenas)
- B2C - CLINICA (clínicas, consultórios, centros de saúde)
- B2B - ORGANIZADOR DE PROVA (organizadores de eventos esportivos, provas, corridas)
- B2B - GESTÃO (empresas de gestão, consultoria, software)
- B2C - ASSESSORIA ESPORTIVA (assessorias esportivas, treinamento personalizado)`;

    const toolParams: any = {
      type: "object",
      properties: {
        score: { type: "number", description: "Score de 0 a 100" },
        classificacao: { type: "string", enum: ["quente", "morno", "frio", "desqualificado"] },
        justificativa: { type: "string", description: "2-3 frases diretas explicando a nota" },
        sinais_positivos: { type: "array", items: { type: "string" } },
        sinais_negativos: { type: "array", items: { type: "string" } },
        tag: { type: "string", enum: ["B2B - FABRICANTE", "B2B - DISTRIBUIDOR", "B2C - LOJA", "B2C - ESCOLA", "B2C - ACADEMIA", "B2C - QUADRA", "B2C - CLINICA", "B2B - ORGANIZADOR DE PROVA", "B2B - GESTÃO", "B2C - ASSESSORIA ESPORTIVA"], description: "Tag de classificação do tipo de negócio" },
      },
      required: ["score", "classificacao", "justificativa", "sinais_positivos", "sinais_negativos", "tag"],
      additionalProperties: false,
    };

    // Add website_encontrado field for researched leads
    if (!hasRealData(d)) {
      toolParams.properties.website_encontrado = {
        type: "string",
        description: "URL do site oficial da empresa identificado na pesquisa, ou null se não encontrado",
      };
    }

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
            parameters: toolParams,
          },
        }],
        tool_choice: { type: "function", function: { name: "score_lead" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      if (aiRes.status === 429) return jsonResp({ error: "Rate limit excedido. Tente novamente em alguns segundos." }, 429);
      if (aiRes.status === 402) return jsonResp({ error: "Créditos insuficientes. Adicione créditos em Settings > Workspace > Usage." }, 402);
      throw new Error(`AI gateway error [${aiRes.status}]`);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI não retornou resultado estruturado");

    const result = JSON.parse(toolCall.function.arguments);

    return jsonResp({
      score: Math.max(0, Math.min(100, Math.round(result.score || 0))),
      classificacao: result.classificacao || "frio",
      justificativa: result.justificativa || "",
      sinais_positivos: Array.isArray(result.sinais_positivos) ? result.sinais_positivos : [],
      sinais_negativos: Array.isArray(result.sinais_negativos) ? result.sinais_negativos : [],
      website_encontrado: websiteEncontrado || result.website_encontrado || null,
      tag: result.tag || null,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("score-lead error:", message);
    return jsonResp({ error: message }, 500);
  }
});
