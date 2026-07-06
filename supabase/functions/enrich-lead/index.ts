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
  // Valores previamente enriquecidos — usados como fallback caso o scrape novo falhe,
  // evitando que o score seja recalculado com null enquanto o DB mantém o valor antigo.
  prev_instagram_last_post_days: z.number().nullable().optional(),
  prev_instagram_profile_is_person: z.boolean().nullable().optional(),
  prev_google_rating: z.number().nullable().optional(),
  prev_google_review_count: z.number().nullable().optional(),
  prev_google_owner_replied_recently: z.boolean().nullable().optional(),
  prev_google_profile_complete: z.boolean().nullable().optional(),
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
// Extrai 14 dígitos consecutivos (formato URL casadosdados) e formata como CNPJ
function extractCnpjFromText(text: string): string | null {
  const formatted = text.match(CNPJ_REGEX);
  if (formatted?.length) return formatted[0];
  // URL pattern: /empresa/12345678000190
  const urlMatch = text.match(/\/(?:empresa|cnpj)\/(\d{14})/i);
  if (urlMatch) {
    const d = urlMatch[1];
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
  }
  // Bare 14 digits as fallback
  const bare = text.match(/\b(\d{14})\b/);
  if (bare) {
    const d = bare[1];
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`;
  }
  return null;
}

// Extrai o logradouro (rua/av) do campo endereço — tudo antes da primeira vírgula ou número
function extractLogradouro(endereco: string | null): string | null {
  if (!endereco) return null;
  const clean = endereco.trim();
  if (!clean) return null;
  let head = clean.split(",")[0].trim();
  const numMatch = head.match(/^(.*?)\s+\d/);
  if (numMatch && numMatch[1].trim().length >= 4) {
    head = numMatch[1].trim();
  }
  return head.length >= 4 ? head : null;
}

// Timeout wrapper: resolves to null if the promise takes longer than `ms`
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      console.log(`[timeout] ${label} > ${ms}ms — pulando`);
      resolve(null);
    }, ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); console.error(`[${label}] erro:`, e); resolve(null); });
  });
}

const STAGE_TIMEOUT_MS = 8000;

async function findCnpj(
  nome: string,
  cidade: string | null,
  _telefone: string | null,
  endereco: string | null,
  firecrawlKey: string
): Promise<string | null> {
  const logradouro = extractLogradouro(endereco);

  const strategies: Array<{ label: string; run: () => Promise<string | null> }> = [
    {
      label: "nome+CNPJ",
      run: async () => extractCnpjFromText(await searchWeb(`"${nome}" CNPJ`, firecrawlKey)),
    },
    {
      label: "nome+cidade+CNPJ",
      run: async () => cidade
        ? extractCnpjFromText(await searchWeb(`"${nome}" "${cidade}" CNPJ`, firecrawlKey))
        : null,
    },
    {
      label: "nome+logradouro+CNPJ",
      run: async () => logradouro
        ? extractCnpjFromText(await searchWeb(`"${nome}" "${logradouro}" CNPJ`, firecrawlKey))
        : null,
    },
    {
      label: "site:cnpj.biz",
      run: async () => extractCnpjFromText(
        await searchWeb(`"${nome}" site:cnpj.biz`, firecrawlKey)
      ),
    },
  ];

  const results = await Promise.all(strategies.map(s =>
    s.run().catch(e => { console.error(`[CNPJ] Erro em ${s.label}:`, e); return null; })
  ));

  for (let i = 0; i < results.length; i++) {
    if (results[i]) {
      console.log(`[CNPJ] Encontrado: ${results[i]} via ${strategies[i].label}`);
      return results[i]!;
    }
  }

  console.log("[CNPJ] Não encontrado após todas as estratégias");
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

function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.length ? w[0].toUpperCase() + w.slice(1) : w)
    .join(" ");
}

function selectDecisor(qsa: Array<{ nome_socio: string; qualificacao_socio: string }>): string | null {
  if (!qsa?.length) return null;
  const valid = qsa.filter(s => s?.nome_socio && String(s.nome_socio).trim().length > 0);
  if (!valid.length) return null;

  const priorities = ["ADMINISTRADOR", "DIRETOR", "PRESIDENTE", "SÓCIO", "SOCIO"];
  for (const kw of priorities) {
    const hit = valid.find(s => String(s.qualificacao_socio ?? "").toUpperCase().includes(kw));
    if (hit) return toTitleCase(String(hit.nome_socio).trim());
  }
  return toTitleCase(String(valid[0].nome_socio).trim());
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

// ─── Extractor genérico: pede ao Gemini um nome de pessoa a partir de um texto ───
async function extractPersonNameFromText(
  systemPrompt: string,
  userText: string,
  lovableKey: string,
  label: string,
): Promise<string | null> {
  if (!userText.trim()) return null;
  try {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText.slice(0, 8000) },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_person",
            parameters: {
              type: "object",
              properties: {
                nome: { type: "string", nullable: true, description: "Nome completo em Title Case ou null" },
              },
              required: ["nome"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_person" } },
      }),
    });
    if (!aiRes.ok) { console.error(`[${label}] gateway ${aiRes.status}`); return null; }
    const data = await aiRes.json();
    const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
    const nome = args.nome;
    if (nome && nome !== "null" && nome !== "N/A" && String(nome).trim().length > 2) {
      const clean = toTitleCase(String(nome).trim());
      console.log(`[${label}] decisor: ${clean}`);
      return clean;
    }
  } catch (e) {
    console.error(`[${label}] erro:`, e);
  }
  return null;
}

async function decisorFromInstagram(igUrl: string, firecrawlKey: string, lovableKey: string): Promise<string | null> {
  const md = await scrapeUrl(igUrl, firecrawlKey);
  if (!md || md.length < 50) return null;
  return extractPersonNameFromText(
    "Extraia apenas o nome completo de uma pessoa física mencionada como dono, fundador, proprietário, coach ou responsável. Procure na bio, destaques e títulos dos posts. Retorne apenas o nome em Title Case ou null se não encontrar com certeza. Nunca invente.",
    md,
    lovableKey,
    "IG-bio",
  );
}

async function decisorFromGoogleReviews(nome: string, cidade: string | null, firecrawlKey: string, lovableKey: string): Promise<string | null> {
  const q = `"${nome}"${cidade ? ` "${cidade}"` : ""} avaliações OR reviews proprietário`;
  const text = await searchWeb(q, firecrawlKey);
  if (!text.trim()) return null;
  return extractPersonNameFromText(
    "Nas respostas do proprietário a avaliações, existe um nome de pessoa física assinando? Retorne apenas o nome em Title Case ou null. Nunca invente.",
    text,
    lovableKey,
    "GReviews",
  );
}



// ─── Phone type detection ───
function detectPhoneType(phone: string | null): "celular" | "fixo" | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11) return "celular";
  if (digits.length === 10) return "fixo";
  return null;
}

// ─── Instagram deep scrape ───
interface InstagramScrapeResult {
  instagram_last_post_days: number | null;
  instagram_profile_is_person: boolean | null;
}

async function scrapeInstagram(
  igUrl: string,
  nome: string,
  firecrawlKey: string,
  lovableKey: string
): Promise<InstagramScrapeResult> {
  const md = await scrapeUrl(igUrl, firecrawlKey);
  if (!md || md.length < 50) return { instagram_last_post_days: null, instagram_profile_is_person: null };

  try {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: `Você receberá o conteúdo bruto de um perfil de Instagram (${nome}). Analise e responda 2 perguntas: 1) Quantos dias se passaram desde o último post (com base em datas/relatos como "há 3 dias", "1 semana atrás", "Nov 2024"). Data atual: ${new Date().toISOString().slice(0,10)}. Se não conseguir inferir, retorne null. 2) A foto de perfil/identidade visual parece ser uma pessoa física real (rosto humano, nome pessoal, bio em primeira pessoa "eu sou...") ou um logo/produto/marca? Responda apenas true (pessoa) ou false (marca). Se inconclusivo, null.` },
          { role: "user", content: md.slice(0, 6000) }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_ig",
            parameters: {
              type: "object",
              properties: {
                instagram_last_post_days: { type: "number", nullable: true },
                instagram_profile_is_person: { type: "boolean", nullable: true },
              },
              required: ["instagram_last_post_days", "instagram_profile_is_person"],
              additionalProperties: false,
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_ig" } }
      }),
    });
    if (!aiRes.ok) return { instagram_last_post_days: null, instagram_profile_is_person: null };
    const data = await aiRes.json();
    const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
    return {
      instagram_last_post_days: typeof args.instagram_last_post_days === "number" ? Math.max(0, Math.round(args.instagram_last_post_days)) : null,
      instagram_profile_is_person: typeof args.instagram_profile_is_person === "boolean" ? args.instagram_profile_is_person : null,
    };
  } catch (e) {
    console.error("[IG] error:", e);
    return { instagram_last_post_days: null, instagram_profile_is_person: null };
  }
}

// ─── Google Maps scrape ───
interface GoogleMapsResult {
  google_rating: number | null;
  google_review_count: number | null;
  google_owner_replied_recently: boolean | null;
  google_profile_complete: boolean | null;
}

async function scrapeGoogleMaps(
  nome: string,
  cidade: string | null,
  firecrawlKey: string,
  lovableKey: string
): Promise<GoogleMapsResult> {
  const q = `"${nome}" ${cidade ? `"${cidade}"` : ""} site:google.com/maps OR site:maps.google.com`;
  const text = await searchWeb(q, firecrawlKey);
  if (!text || text.length < 50) {
    return { google_rating: null, google_review_count: null, google_owner_replied_recently: null, google_profile_complete: null };
  }
  try {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: `Você receberá conteúdo extraído do perfil do Google Maps da empresa "${nome}"${cidade ? ` em ${cidade}` : ""}. Extraia: (1) nota média (1.0-5.0), (2) total de avaliações, (3) se há respostas do PROPRIETÁRIO ("Resposta do proprietário"/"Owner reply") em alguma das avaliações recentes mostradas (boolean), (4) se o perfil parece completo: tem foto, horário de funcionamento E descrição/categoria preenchidos (boolean). Use null se não conseguir determinar.` },
          { role: "user", content: text.slice(0, 8000) }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_gmaps",
            parameters: {
              type: "object",
              properties: {
                google_rating: { type: "number", nullable: true },
                google_review_count: { type: "number", nullable: true },
                google_owner_replied_recently: { type: "boolean", nullable: true },
                google_profile_complete: { type: "boolean", nullable: true },
              },
              required: ["google_rating","google_review_count","google_owner_replied_recently","google_profile_complete"],
              additionalProperties: false,
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_gmaps" } }
      }),
    });
    if (!aiRes.ok) return { google_rating: null, google_review_count: null, google_owner_replied_recently: null, google_profile_complete: null };
    const data = await aiRes.json();
    const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
    return {
      google_rating: typeof args.google_rating === "number" ? Math.round(args.google_rating * 10) / 10 : null,
      google_review_count: typeof args.google_review_count === "number" ? Math.round(args.google_review_count) : null,
      google_owner_replied_recently: typeof args.google_owner_replied_recently === "boolean" ? args.google_owner_replied_recently : null,
      google_profile_complete: typeof args.google_profile_complete === "boolean" ? args.google_profile_complete : null,
    };
  } catch (e) {
    console.error("[GMaps] error:", e);
    return { google_rating: null, google_review_count: null, google_owner_replied_recently: null, google_profile_complete: null };
  }
}

// ─── Commercial score (0-10) + tier ───
const CHAIN_REGEX = /\b(smartfit|smart\s?fit|bodytech|bluefit|formula|f[oó]rmula|bio\s?ritmo|franquia|grupo|rede\s|holding)\b/i;

function computeCommercialScore(lead: {
  phone_type?: string | null;
  nome_decisor?: string | null;
  instagram_last_post_days?: number | null;
  site?: string | null;
  google_profile_complete?: boolean | null;
  google_review_count?: number | null;
  google_owner_replied_recently?: boolean | null;
  google_rating?: number | null;
  instagram_profile_is_person?: boolean | null;
  cnpj?: string | null;
  endereco?: string | null;
  nome_empresa?: string;
}): { commercial_score: number; tier: "A" | "B" | "C" } {
  let s = 0;

  // Acesso ao decisor
  if (lead.phone_type === "celular") s += 5;
  if (lead.nome_decisor) s += 2;
  if (lead.phone_type === "fixo" && !lead.nome_decisor) s -= 2;

  // Presença digital
  if (typeof lead.instagram_last_post_days === "number") {
    if (lead.instagram_last_post_days <= 7) s += 2;
    else if (lead.instagram_last_post_days <= 30) s += 1;
  }
  if (lead.site) s += 2;
  if (lead.google_profile_complete === true) s += 1;
  if (typeof lead.google_review_count === "number" && lead.google_review_count >= 10) s += 1;

  // Engajamento
  if (lead.google_owner_replied_recently === true) s += 2;
  if (typeof lead.google_rating === "number" && lead.google_rating >= 4.5) s += 1;
  if (lead.instagram_profile_is_person === true) s += 1;

  // Perfil do negócio
  if (lead.cnpj) s += 2;
  if (lead.endereco) s += 1;
  if (lead.nome_empresa && CHAIN_REGEX.test(lead.nome_empresa)) s -= 2;
  if (!lead.cnpj) s -= 1;

  s = Math.max(0, Math.min(20, s));
  const commercial_score = Math.round((s / 2) * 10) / 10;
  const tier: "A" | "B" | "C" = commercial_score >= 8 ? "A" : commercial_score >= 5 ? "B" : "C";
  return { commercial_score, tier };
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

    // ── ESTÁGIO 1: CNPJ (timeout 8s) ──
    let foundCnpj = cnpj || null;
    if (!foundCnpj) {
      foundCnpj = await withTimeout(
        findCnpj(nome_empresa, cidade, telefone || null, endereco || null, FIRECRAWL_API_KEY),
        STAGE_TIMEOUT_MS,
        "findCnpj",
      );
    }
    if (foundCnpj) {
      updates.cnpj = foundCnpj;
    }

    // ── ESTÁGIO 2: B2BLeads + BrasilAPI QSA em paralelo (timeout 8s cada) ──
    let decisorFound = false;
    let decisorFonte: string | null = null;
    if (foundCnpj) {
      const [b2bData, brasilData] = await Promise.all([
        withTimeout(scrapeB2bLeads(foundCnpj, nome_empresa, FIRECRAWL_API_KEY, LOVABLE_API_KEY), STAGE_TIMEOUT_MS, "b2bleads"),
        withTimeout(queryBrasilApi(foundCnpj), STAGE_TIMEOUT_MS, "brasilapi"),
      ]);

      // B2BLeads sempre preenche campos gerais quando disponíveis
      if (b2bData) {
        if (!telefone && b2bData.telefone) updates.telefone = b2bData.telefone;
        if (!endereco && b2bData.endereco) updates.endereco = b2bData.endereco;
        if (!cidade && b2bData.cidade) updates.cidade = b2bData.cidade;
        if (!site && b2bData.site) updates.site = b2bData.site;
        if (!instagram && b2bData.instagram) updates.instagram = b2bData.instagram;
        if (!linkedin && b2bData.linkedin) updates.linkedin = b2bData.linkedin;
      }

      // BrasilAPI complementa campos gerais quando ativa
      let brasilQsaDecisor: string | null = null;
      if (brasilData) {
        const situacao = String(brasilData.situacao_cadastral ?? "").toUpperCase();
        if (situacao !== "BAIXADA" && situacao !== "INAPTA") {
          if (brasilData.qsa?.length) brasilQsaDecisor = selectDecisor(brasilData.qsa);
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

      // Prioridade do decisor: B2BLeads > BrasilAPI
      if (needsDecisor) {
        if (b2bData?.nome_decisor) {
          updates.nome_decisor = b2bData.nome_decisor;
          decisorFound = true;
          decisorFonte = "b2bleads";
        } else if (brasilQsaDecisor) {
          updates.nome_decisor = brasilQsaDecisor;
          decisorFound = true;
          decisorFonte = "brasilapi_qsa";
          console.log(`[QSA] Decisor selecionado: ${brasilQsaDecisor}`);
        }
      }
    }

    // Merge campos gerais primeiro (para termos Instagram atualizado antes do próximo estágio)
    const generalUpdates = await generalPromise;
    for (const [key, val] of Object.entries(generalUpdates)) {
      if (!updates[key]) {
        updates[key] = val;
      }
    }

    // ── ESTÁGIO 3: Instagram bio (se decisor ainda vazio) ──
    if (needsDecisor && !decisorFound) {
      const igUrl = (updates.instagram as string) || instagram || null;
      if (igUrl) {
        const igDecisor = await withTimeout(
          decisorFromInstagram(igUrl, FIRECRAWL_API_KEY, LOVABLE_API_KEY),
          STAGE_TIMEOUT_MS,
          "IG-bio",
        );
        if (igDecisor) {
          updates.nome_decisor = igDecisor;
          decisorFound = true;
          decisorFonte = "instagram_bio";
        }
      }
    }

    // ── ESTÁGIO 4: Google reviews (se decisor ainda vazio) ──
    if (needsDecisor && !decisorFound) {
      const revDecisor = await withTimeout(
        decisorFromGoogleReviews(nome_empresa, (updates.cidade as string) || cidade || null, FIRECRAWL_API_KEY, LOVABLE_API_KEY),
        STAGE_TIMEOUT_MS,
        "GReviews",
      );
      if (revDecisor) {
        updates.nome_decisor = revDecisor;
        decisorFound = true;
        decisorFonte = "google_reviews";
      }
    }

    // ── ESTÁGIO 5: Fallback IA (último recurso) ──
    if (needsDecisor && !decisorFound) {
      const aiDecisor = await withTimeout(
        aiFallbackDecisor(nome_empresa, cidade, FIRECRAWL_API_KEY, LOVABLE_API_KEY),
        STAGE_TIMEOUT_MS,
        "ia_fallback",
      );
      if (aiDecisor) {
        updates.nome_decisor = aiDecisor;
        decisorFonte = "ia_fallback";
      }
    }



    // ── ESTÁGIO 5: Instagram deep scrape + Google Maps scrape (paralelo) ──
    const finalSite = (updates.site as string) || site || null;
    const finalIg = (updates.instagram as string) || instagram || null;
    const finalTel = (updates.telefone as string) || telefone || null;
    const finalEnd = (updates.endereco as string) || endereco || null;
    const finalCid = (updates.cidade as string) || cidade || null;
    const finalDec = (updates.nome_decisor as string) || nome_decisor || null;

    const [igData, gmapsData] = await Promise.all([
      finalIg ? scrapeInstagram(finalIg, nome_empresa, FIRECRAWL_API_KEY, LOVABLE_API_KEY) : Promise.resolve({ instagram_last_post_days: null, instagram_profile_is_person: null }),
      scrapeGoogleMaps(nome_empresa, finalCid, FIRECRAWL_API_KEY, LOVABLE_API_KEY),
    ]);

    if (igData.instagram_last_post_days != null) (updates as any).instagram_last_post_days = igData.instagram_last_post_days;
    if (igData.instagram_profile_is_person != null) (updates as any).instagram_profile_is_person = igData.instagram_profile_is_person;
    if (gmapsData.google_rating != null) (updates as any).google_rating = gmapsData.google_rating;
    if (gmapsData.google_review_count != null) (updates as any).google_review_count = gmapsData.google_review_count;
    if (gmapsData.google_owner_replied_recently != null) (updates as any).google_owner_replied_recently = gmapsData.google_owner_replied_recently;
    if (gmapsData.google_profile_complete != null) (updates as any).google_profile_complete = gmapsData.google_profile_complete;

    // ── Phone type ──
    const phoneType = detectPhoneType(finalTel);
    if (phoneType) (updates as any).phone_type = phoneType;

    // ── Commercial score + tier ──
    const { commercial_score, tier } = computeCommercialScore({
      phone_type: phoneType,
      nome_decisor: finalDec,
      instagram_last_post_days: igData.instagram_last_post_days,
      site: finalSite,
      google_profile_complete: gmapsData.google_profile_complete,
      google_review_count: gmapsData.google_review_count,
      google_owner_replied_recently: gmapsData.google_owner_replied_recently,
      google_rating: gmapsData.google_rating,
      instagram_profile_is_person: igData.instagram_profile_is_person,
      cnpj: (updates.cnpj as string) || cnpj || null,
      endereco: finalEnd,
      nome_empresa,
    });
    (updates as any).commercial_score = commercial_score;
    (updates as any).tier = tier;

    return new Response(
      JSON.stringify({
        nome_decisor: updates.nome_decisor || nome_decisor || "Não identificado",
        cargo: "",
        decisor_fonte: decisorFonte,
        commercial_score,
        tier,
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
