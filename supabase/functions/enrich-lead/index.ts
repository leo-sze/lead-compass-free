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
  cnpj: z.string().nullable().optional(),
});

const CNPJ_REGEX = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g;

// ─── Helper: Firecrawl search ───
async function searchWeb(query: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.data || [])
        .map((r: any) => `--- ${r.url} ---\n${(r.markdown || r.description || "").slice(0, 2000)}`)
        .join("\n\n");
    }
  } catch (e) {
    console.error(`Search error:`, e);
  }
  return "";
}

// ─── Helper: Firecrawl scrape ───
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
      return (data.data?.markdown || data.markdown || "").slice(0, 5000);
    }
  } catch (e) {
    console.error(`Scrape error ${url}:`, e);
  }
  return "";
}

// ─── ESTÁGIO 1: Encontrar CNPJ ───
async function findCnpj(nome: string, cidade: string | null, firecrawlKey: string): Promise<string | null> {
  const locationQ = cidade ? ` "${cidade}"` : "";

  const text1 = await searchWeb(`"${nome}"${locationQ} CNPJ`, firecrawlKey);
  const matches1 = text1.match(CNPJ_REGEX);
  if (matches1?.length) {
    console.log(`[CNPJ] Encontrado: ${matches1[0]} via busca genérica`);
    return matches1[0];
  }

  const text2 = await searchWeb(`"${nome}"${locationQ} site:casadosdados.com.br`, firecrawlKey);
  const matches2 = text2.match(CNPJ_REGEX);
  if (matches2?.length) {
    console.log(`[CNPJ] Encontrado: ${matches2[0]} via casadosdados`);
    return matches2[0];
  }

  console.log("[CNPJ] Não encontrado após 2 tentativas");
  return null;
}

// ─── ESTÁGIO 2: B2BLeads scrape ───
interface B2bLeadsData {
  nome_decisor: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  site: string | null;
  instagram: string | null;
  linkedin: string | null;
}

async function scrapeB2bLeads(
  cnpj: string,
  nomeEmpresa: string,
  firecrawlKey: string,
  lovableKey: string
): Promise<B2bLeadsData | null> {
  const cnpjLimpo = cnpj.replace(/[.\-\/\s]/g, '');
  const url = `https://b2bleads.com.br/empresa/${cnpjLimpo}`;
  console.log(`[B2BLeads] Scraping ${url}`);

  const markdown = await scrapeUrl(url, firecrawlKey);
  if (!markdown || markdown.length < 100) {
    console.log("[B2BLeads] Conteúdo insuficiente");
    return null;
  }

  try {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você receberá o conteúdo da página b2bleads.com.br sobre a empresa "${nomeEmpresa}". Extraia os dados solicitados. Para o decisor, escolha o sócio administrador ou o primeiro sócio listado no "Quadro de sócios administradores". Para telefone, pegue o primeiro telefone listado com DDD. Para endereço, pegue o endereço completo com cidade e estado. Se não encontrar um dado, retorne null. Nunca invente dados.`
          },
          {
            role: "user",
            content: markdown.slice(0, 8000)
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_b2bleads",
            description: "Extrair dados da página b2bleads",
            parameters: {
              type: "object",
              properties: {
                nome_decisor: { type: "string", nullable: true, description: "Nome do sócio administrador ou primeiro sócio" },
                telefone: { type: "string", nullable: true, description: "Telefone com DDD, formato (XX) XXXXX-XXXX" },
                endereco: { type: "string", nullable: true, description: "Endereço completo com rua, número, bairro" },
                cidade: { type: "string", nullable: true, description: "Cidade-UF" },
                site: { type: "string", nullable: true, description: "URL do site oficial se encontrado" },
                instagram: { type: "string", nullable: true, description: "URL do Instagram se encontrado" },
                linkedin: { type: "string", nullable: true, description: "URL do LinkedIn se encontrado" },
              },
              required: ["nome_decisor", "telefone", "endereco", "cidade", "site", "instagram", "linkedin"],
              additionalProperties: false,
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_b2bleads" } }
      }),
    });

    if (!aiRes.ok) {
      console.error("[B2BLeads] AI error:", aiRes.status);
      return null;
    }

    const data = await aiRes.json();
    const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");

    const clean = (v: any) => (v && v !== "null" && v !== "N/A" && v !== "não encontrado" && String(v).trim().length > 1) ? String(v).trim() : null;

    const result: B2bLeadsData = {
      nome_decisor: clean(args.nome_decisor),
      telefone: clean(args.telefone),
      endereco: clean(args.endereco),
      cidade: clean(args.cidade),
      site: clean(args.site),
      instagram: clean(args.instagram),
      linkedin: clean(args.linkedin),
    };

    console.log(`[B2BLeads] Extraído - decisor: ${result.nome_decisor}, tel: ${result.telefone}, cidade: ${result.cidade}`);
    return result;
  } catch (e) {
    console.error("[B2BLeads] Parse error:", e);
    return null;
  }
}

// ─── ESTÁGIO 3: BrasilAPI (QSA) fallback ───
interface BrasilApiResponse {
  razao_social?: string;
  nome_fantasia?: string;
  telefone?: string;
  logradouro?: string;
  municipio?: string;
  uf?: string;
  situacao_cadastral?: string;
  qsa?: Array<{ nome_socio: string; qualificacao_socio: string }>;
}

async function queryBrasilApi(cnpj: string, retry = true): Promise<BrasilApiResponse | null> {
  const cnpjLimpo = cnpj.replace(/[.\-\/\s]/g, '');
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
    if (res.ok) return await res.json();
    if (res.status === 429 && retry) {
      console.log("[QSA] Rate limited, aguardando 2s...");
      await new Promise(r => setTimeout(r, 2000));
      return queryBrasilApi(cnpj, false);
    }
    if (res.status === 404) {
      console.log("[QSA] CNPJ não encontrado na Receita (404)");
    }
  } catch (e) {
    console.error("[QSA] Erro:", e);
  }
  return null;
}

function selectDecisor(qsa: Array<{ nome_socio: string; qualificacao_socio: string }>): string | null {
  if (!qsa?.length) return null;
  const priorities = [
    (q: string) => q.toLowerCase().includes("administrador"),
    (q: string) => q.toLowerCase().includes("diretor") || q.toLowerCase().includes("presidente"),
    (q: string) => q.toLowerCase().includes("sócio") || q.toLowerCase().includes("socio"),
  ];
  for (const check of priorities) {
    const found = qsa.find(s => check(s.qualificacao_socio));
    if (found) return found.nome_socio;
  }
  return qsa[0].nome_socio;
}

// ─── ESTÁGIO 4: Fallback IA para decisor ───
async function aiFallbackDecisor(
  nome: string, cidade: string | null,
  firecrawlKey: string, lovableKey: string
): Promise<string | null> {
  const locationQ = cidade ? ` "${cidade}"` : "";
  const searchText = await searchWeb(
    `"${nome}"${locationQ} fundador OR proprietário OR CEO OR diretor`, firecrawlKey
  );

  if (!searchText.trim()) {
    console.log("[IA] Nenhum conteúdo encontrado para fallback");
    return null;
  }

  try {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "Você receberá texto de resultados de busca sobre uma empresa. Extraia APENAS o nome completo de uma pessoa real que seja fundador, proprietário, CEO, diretor ou sócio desta empresa. Se não houver um nome de pessoa claramente identificado no texto, retorne null. Nunca invente ou suponha um nome."
          },
          {
            role: "user",
            content: `Empresa: "${nome}"${cidade ? ` em ${cidade}` : ""}\n\nResultados:\n${searchText.slice(0, 8000)}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_decisor",
            description: "Extract decision maker name",
            parameters: {
              type: "object",
              properties: {
                nome_decisor: { type: "string", nullable: true, description: "Nome completo do decisor ou null" }
              },
              required: ["nome_decisor"],
              additionalProperties: false,
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_decisor" } }
      }),
    });

    if (!aiRes.ok) {
      console.error("[IA] Erro gateway:", aiRes.status);
      return null;
    }

    const data = await aiRes.json();
    const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
    const nome_decisor = args.nome_decisor;

    if (nome_decisor && nome_decisor !== "null" && nome_decisor !== "N/A" && nome_decisor.trim().length > 2) {
      console.log(`[IA] Decisor encontrado: ${nome_decisor}`);
      return nome_decisor.trim();
    }
  } catch (e) {
    console.error("[IA] Erro:", e);
  }

  console.log("[IA] Retornou null");
  return null;
}

// ─── Busca de campos gerais (site, instagram, linkedin, telefone, endereco) via IA ───
async function enrichGeneralFields(
  nome: string, cidade: string | null,
  existing: { site?: string | null; instagram?: string | null; linkedin?: string | null; telefone?: string | null; endereco?: string | null },
  firecrawlKey: string, lovableKey: string
): Promise<Record<string, string>> {
  const missingGeneral: string[] = [];
  if (!existing.site) missingGeneral.push("site");
  if (!existing.instagram) missingGeneral.push("instagram");
  if (!existing.linkedin) missingGeneral.push("linkedin");
  if (!existing.telefone) missingGeneral.push("telefone");
  if (!existing.endereco) missingGeneral.push("endereco");

  if (missingGeneral.length === 0) return {};

  const promises: Promise<string>[] = [];
  const labels: string[] = [];

  if (existing.site) {
    promises.push(scrapeUrl(existing.site, firecrawlKey));
    labels.push(existing.site);
  }
  if (existing.instagram) {
    promises.push(scrapeUrl(existing.instagram, firecrawlKey));
    labels.push(existing.instagram);
  }

  const locationQ = cidade ? ` "${cidade}"` : "";
  promises.push(searchWeb(`"${nome}"${locationQ} telefone site instagram contato`, firecrawlKey));
  labels.push("Web Search");

  const results = await Promise.all(promises);
  let content = "";
  for (let i = 0; i < results.length; i++) {
    if (results[i]) content += `\n=== ${labels[i]} ===\n${results[i]}`;
  }

  if (!content.trim()) return {};

  const fieldDesc: Record<string, string> = {
    telefone: "Telefone com DDD (formato brasileiro)",
    site: "URL do site oficial (https://...)",
    instagram: "URL completa do Instagram",
    linkedin: "URL completa da página LinkedIn",
    endereco: "Endereço físico completo",
  };

  const properties: Record<string, any> = {};
  for (const f of missingGeneral) {
    properties[f] = { type: "string", description: fieldDesc[f] || f };
  }

  try {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Extraia dados de contato da empresa a partir do conteúdo. Se não encontrar, use null. Nunca invente." },
          { role: "user", content: `Empresa: "${nome}"\n\n${content.slice(0, 10000)}` }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_contact",
            description: "Extract contact data",
            parameters: { type: "object", properties, required: missingGeneral, additionalProperties: false }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_contact" } }
      }),
    });

    if (!aiRes.ok) return {};

    const data = await aiRes.json();
    const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
    const updates: Record<string, string> = {};
    for (const f of missingGeneral) {
      const val = args[f];
      if (val && val !== "null" && val !== "N/A" && val !== "não encontrado" && val.trim()) {
        updates[f] = val.trim();
      }
    }
    return updates;
  } catch (e) {
    console.error("General enrichment AI error:", e);
    return {};
  }
}

// ─── Main handler ───
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

    const { nome_empresa, site, instagram, linkedin, telefone, endereco, nome_decisor, cidade, cnpj } = parsed.data;

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const updates: Record<string, string | null> = {};
    const needsDecisor = !nome_decisor || nome_decisor === "Não identificado";

    // Run general fields enrichment in parallel with CNPJ search
    const generalPromise = enrichGeneralFields(
      nome_empresa, cidade,
      { site, instagram, linkedin, telefone, endereco },
      FIRECRAWL_API_KEY, LOVABLE_API_KEY
    );

    // ── ESTÁGIO 1: CNPJ ──
    let foundCnpj = cnpj || null;
    if (!foundCnpj) {
      foundCnpj = await findCnpj(nome_empresa, cidade, FIRECRAWL_API_KEY);
    }
    if (foundCnpj) {
      updates.cnpj = foundCnpj;
    }

    // ── ESTÁGIO 2: B2BLeads (fonte primária) ──
    let decisorFound = false;
    if (foundCnpj) {
      const b2bData = await scrapeB2bLeads(foundCnpj, nome_empresa, FIRECRAWL_API_KEY, LOVABLE_API_KEY);
      if (b2bData) {
        if (needsDecisor && b2bData.nome_decisor) {
          updates.nome_decisor = b2bData.nome_decisor;
          decisorFound = true;
        }
        if (!telefone && b2bData.telefone) updates.telefone = b2bData.telefone;
        if (!endereco && b2bData.endereco) updates.endereco = b2bData.endereco;
        if (!cidade && b2bData.cidade) updates.cidade = b2bData.cidade;
        if (!site && b2bData.site) updates.site = b2bData.site;
        if (!instagram && b2bData.instagram) updates.instagram = b2bData.instagram;
        if (!linkedin && b2bData.linkedin) updates.linkedin = b2bData.linkedin;
      }
    }

    // ── ESTÁGIO 3: BrasilAPI fallback (se b2bleads não achou decisor) ──
    if (foundCnpj && needsDecisor && !decisorFound) {
      const brasilData = await queryBrasilApi(foundCnpj);
      if (brasilData) {
        const situacao = String(brasilData.situacao_cadastral ?? "").toUpperCase();
        if (situacao !== "BAIXADA" && situacao !== "INAPTA") {
          if (brasilData.qsa?.length) {
            const decisor = selectDecisor(brasilData.qsa);
            if (decisor) {
              updates.nome_decisor = decisor;
              decisorFound = true;
              console.log(`[QSA] Decisor selecionado: ${decisor}`);
            }
          }
          if (!telefone && !updates.telefone && brasilData.telefone?.trim()) {
            updates.telefone = brasilData.telefone.trim();
          }
          if (!endereco && !updates.endereco && brasilData.logradouro) {
            const parts = [brasilData.logradouro, brasilData.municipio, brasilData.uf].filter(Boolean);
            if (parts.length) updates.endereco = parts.join(", ");
          }
          if (!cidade && !updates.cidade && brasilData.municipio) {
            updates.cidade = brasilData.municipio;
          }
        }
      }
    }

    // ── ESTÁGIO 4: Fallback IA (só se decisor ainda vazio) ──
    if (needsDecisor && !decisorFound) {
      const aiDecisor = await aiFallbackDecisor(nome_empresa, cidade, FIRECRAWL_API_KEY, LOVABLE_API_KEY);
      if (aiDecisor) {
        updates.nome_decisor = aiDecisor;
      }
    }

    // Merge general fields (don't overwrite what B2BLeads/BrasilAPI already filled)
    const generalUpdates = await generalPromise;
    for (const [key, val] of Object.entries(generalUpdates)) {
      if (!updates[key]) {
        updates[key] = val;
      }
    }

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
