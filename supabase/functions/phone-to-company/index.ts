// Look up company name for a list of phone numbers using Firecrawl web search.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LookupItem {
  query: string;
  phone: string; // normalized digits, no country code
}

interface LookupResult {
  query: string;
  phone: string;
  company: string | null;
  source: string | null;
  snippet: string | null;
}

function formatPhoneVariants(digits: string): string[] {
  // digits: 10 or 11
  if (digits.length < 10 || digits.length > 11) return [digits];
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const mid = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
  const tail = rest.length === 9 ? rest.slice(5) : rest.slice(4);
  return [
    `(${ddd}) ${mid}-${tail}`,
    `${ddd} ${mid}-${tail}`,
    `+55 ${ddd} ${mid}-${tail}`,
    digits,
    `55${digits}`,
  ];
}

function extractCompanyFromResult(title: string, description: string): string | null {
  // Heuristic: take the part before separators like " - ", " | ", " :: "
  const text = title || description || "";
  if (!text) return null;
  const cleaned = text
    .replace(/\s*[-|·••–—:]\s*/g, "|")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  // Prefer first chunk that doesn't look like a generic page label
  const blacklist = /(home|in[ií]cio|contato|telefone|sobre|n[óo]s|fale|conosco|whatsapp|institucional)/i;
  for (const chunk of cleaned) {
    if (!blacklist.test(chunk) && chunk.length >= 3 && chunk.length <= 80) {
      return chunk;
    }
  }
  return cleaned[0] || null;
}

async function searchPhone(item: LookupItem, apiKey: string): Promise<LookupResult> {
  const variants = formatPhoneVariants(item.phone);
  // Build a query that boosts company pages
  const query = `"${variants[0]}" OR "${variants[2]}" empresa contato`;
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        lang: "pt",
        country: "br",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Firecrawl error ${res.status} for ${item.phone}: ${text}`);
      return { query: item.query, phone: item.phone, company: null, source: null, snippet: null };
    }
    const data = await res.json();
    // v2 search returns { data: { web: [...] } } or { data: [...] } depending on shape
    const results: any[] =
      (data?.data?.web as any[]) ||
      (Array.isArray(data?.data) ? data.data : []) ||
      [];

    for (const r of results) {
      const url: string = r.url || "";
      // Skip aggregator / directory noise as primary, but still allow as fallback
      const company = extractCompanyFromResult(r.title || "", r.description || "");
      if (company) {
        return {
          query: item.query,
          phone: item.phone,
          company,
          source: url || null,
          snippet: r.description || r.title || null,
        };
      }
    }
  } catch (e) {
    console.error(`Search error for ${item.phone}:`, e);
  }
  return { query: item.query, phone: item.phone, company: null, source: null, snippet: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { items } = (await req.json()) as { items: LookupItem[] };
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "items é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (items.length > 50) {
      return new Response(
        JSON.stringify({ error: "Máximo 50 telefones por requisição" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: LookupResult[] = [];
    // Process sequentially with small delay to be polite
    for (const item of items) {
      const r = await searchPhone(item, apiKey);
      results.push(r);
      await new Promise((res) => setTimeout(res, 150));
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    console.error("phone-to-company error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
