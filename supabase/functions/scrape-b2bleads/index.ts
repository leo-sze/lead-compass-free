import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cookie, ramo, estado, cidade, porte, data_abertura_de, data_abertura_ate, limite = 50 } = await req.json();

    if (!cookie || !ramo || !estado) {
      return new Response(JSON.stringify({ error: "cookie, ramo e estado são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allLeads: any[] = [];
    let page = 1;
    const maxLimit = Math.min(limite, 200);

    while (allLeads.length < maxLimit) {
      // Build b2bleads search URL
      // b2bleads uses /resultado with query params
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("tipoDados", "lista");
      params.set("cnaeSecundario", "1");
      // The search term goes as "cnaes" or via the main search
      // Based on inspection, the site uses segmento/atividade as query param
      if (ramo) params.set("segmento", ramo);
      if (estado) params.set("estados", estado);
      if (cidade) params.set("cidades", cidade);
      if (porte) params.set("porte", porte);
      if (data_abertura_de) params.set("abertura_de", data_abertura_de);
      if (data_abertura_ate) params.set("abertura_ate", data_abertura_ate);

      const searchUrl = `https://b2bleads.com.br/resultado?${params.toString()}`;
      console.log(`Scraping page ${page}: ${searchUrl}`);

      // Scrape with Firecrawl passing auth cookie
      let html = "";
      let retries = 0;
      while (retries < 2) {
        try {
          const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: searchUrl,
              formats: ["html"],
              headers: {
                Cookie: `laravel_session=${cookie}`,
              },
              waitFor: 3000,
            }),
          });

          if (scrapeRes.status === 429) {
            if (retries === 0) {
              console.log("Rate limited, waiting 3s...");
              await new Promise(r => setTimeout(r, 3000));
              retries++;
              continue;
            }
            return new Response(JSON.stringify({ error: "Firecrawl rate limited. Tente novamente em alguns minutos." }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const scrapeData = await scrapeRes.json();
          html = scrapeData?.data?.html || scrapeData?.html || "";
          break;
        } catch (e) {
          console.error("Firecrawl error:", e);
          retries++;
          if (retries >= 2) {
            return new Response(JSON.stringify({ error: "Erro ao acessar Firecrawl" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // Check if HTML is a login page (cookie expired)
      if (!html || html.includes("login") && html.includes("senha") && !html.includes("resultado")) {
        console.log("Detected login page - cookie expired");
        return new Response(JSON.stringify({ error: "Sessão expirada. Atualize o cookie de sessão em Settings." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use AI to extract leads from HTML since b2bleads HTML structure may vary
      const extractedLeads = await extractLeadsWithAI(html, LOVABLE_API_KEY);
      
      if (!extractedLeads || extractedLeads.length === 0) {
        console.log(`No leads found on page ${page}. Stopping.`);
        break;
      }

      allLeads.push(...extractedLeads);
      console.log(`Page ${page}: found ${extractedLeads.length} leads. Total: ${allLeads.length}`);

      if (allLeads.length >= maxLimit) break;

      page++;
      // Delay between pages
      await new Promise(r => setTimeout(r, 1500));
    }

    const finalLeads = allLeads.slice(0, maxLimit);

    return new Response(JSON.stringify({ leads: finalLeads, total: finalLeads.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scrape-b2bleads error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function extractLeadsWithAI(html: string, apiKey: string): Promise<any[]> {
  // Truncate HTML to fit context
  const truncatedHtml = html.length > 80000 ? html.slice(0, 80000) : html;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Você é um extrator de dados de HTML. Extraia todas as empresas listadas no HTML do b2bleads.com.br.
Para cada empresa, extraia: nome_empresa (razão social ou nome fantasia), cnpj, telefone (com DDD), endereco, cidade, nome_decisor (sócio/proprietário), site (se disponível).
Se não encontrar empresas no HTML, retorne um array vazio.`,
        },
        {
          role: "user",
          content: `Extraia todas as empresas deste HTML do b2bleads:\n\n${truncatedHtml}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_leads",
            description: "Extrair leads do HTML do b2bleads",
            parameters: {
              type: "object",
              properties: {
                leads: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      nome_empresa: { type: "string" },
                      cnpj: { type: "string" },
                      telefone: { type: "string" },
                      endereco: { type: "string" },
                      cidade: { type: "string" },
                      nome_decisor: { type: "string" },
                      site: { type: "string" },
                    },
                    required: ["nome_empresa"],
                  },
                },
              },
              required: ["leads"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_leads" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI extraction error:", response.status, errText);
    return [];
  }

  const data = await response.json();
  try {
    const args = JSON.parse(
      data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}"
    );
    return args.leads || [];
  } catch (e) {
    console.error("Failed to parse AI response:", e);
    return [];
  }
}
