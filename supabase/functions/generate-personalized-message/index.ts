import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DEFAULT_MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `Você é um SDR consultivo brasileiro que escreve mensagens curtas de prospecção via WhatsApp para donos de pequenas e médias empresas.

REGRAS OBRIGATÓRIAS:
- Máximo 400 caracteres (curto, direto, escaneável).
- Tom consultivo e humano — nunca vendedor agressivo, sem "aproveite", "imperdível", "promoção".
- Sempre citar o NOME da empresa logo no início.
- Mencionar 1 ou 2 problemas ESPECÍFICOS reais que foram identificados na análise (nunca inventar).
- Terminar com uma pergunta suave ou CTA leve (ex: "faz sentido eu te mostrar como resolver isso?", "posso te mandar um exemplo rápido?").
- Sem emojis excessivos (no máximo 1, opcional).
- Sem saudações longas — direto ao ponto.
- Português BR, informal-profissional, tratamento por "você".

EXEMPLOS DE BOM TOM:
Exemplo 1: "Oi! Vi a Padaria Central aqui em Pinheiros e reparei que o site tá fora do ar e vocês têm só 12 reviews no Google. Isso normalmente derruba muito o volume de novos clientes que buscam no celular. Faz sentido eu te mostrar em 5 min como uns ajustes simples resolvem?"

Exemplo 2: "Oi, tudo bem? Dei uma olhada na Studio Fit e percebi que o Instagram tá parado há uns 40 dias e vocês não aparecem no Google Maps quando busco 'academia perto de mim'. Isso costuma custar bastante matrícula. Posso te mandar um diagnóstico rápido?"

Responda SEMPRE em JSON válido no formato:
{"mensagem": "...", "pontos_usados": ["ponto 1", "ponto 2"]}`;

function buildUserPrompt(lead: any) {
  const sinaisNegativos: string[] = Array.isArray(lead.sinais_negativos) ? lead.sinais_negativos : [];
  const sinaisPositivos: string[] = Array.isArray(lead.sinais_positivos) ? lead.sinais_positivos : [];

  const contexto: string[] = [];
  contexto.push(`Empresa: ${lead.nome_empresa}`);
  if (lead.termo_pesquisa) contexto.push(`Categoria/nicho: ${lead.termo_pesquisa}`);
  if (lead.cidade) contexto.push(`Cidade: ${lead.cidade}`);
  if (lead.endereco) contexto.push(`Endereço: ${lead.endereco}`);
  if (lead.site) contexto.push(`Site: ${lead.site}`);
  else contexto.push(`Site: NÃO possui site`);
  if (lead.instagram) contexto.push(`Instagram: ${lead.instagram}`);
  else contexto.push(`Instagram: NÃO possui`);
  if (lead.google_rating != null) {
    contexto.push(`Google: nota ${lead.google_rating} (${lead.google_review_count ?? 0} avaliações)`);
  }
  if (lead.instagram_last_post_days != null) {
    contexto.push(`Instagram último post: há ${lead.instagram_last_post_days} dias`);
  }
  if (lead.nome_decisor) contexto.push(`Nome do decisor: ${lead.nome_decisor}`);
  if (lead.justificativa) contexto.push(`Análise IA: ${lead.justificativa}`);
  if (sinaisNegativos.length) contexto.push(`Sinais negativos identificados:\n- ${sinaisNegativos.join("\n- ")}`);
  if (sinaisPositivos.length) contexto.push(`Sinais positivos: ${sinaisPositivos.join(", ")}`);

  return `Gere uma mensagem de prospecção personalizada com base nos dados abaixo. Cite pelo menos um problema real da lista de sinais negativos.

${contexto.join("\n")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { lead_id, model, save = true } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lead, error: fetchErr } = await admin
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .maybeSingle();

    if (fetchErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasAnalise =
      (Array.isArray(lead.sinais_negativos) && lead.sinais_negativos.length > 0) ||
      !!lead.justificativa ||
      !!lead.lead_quality;

    if (!hasAnalise) {
      return new Response(
        JSON.stringify({
          error: "sem_analise",
          message: "Este lead ainda não possui análise de IA. Rode a Análise IA antes de gerar a mensagem.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const chosenModel = model || DEFAULT_MODEL;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(lead) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit", message: "Limite de requisições atingido, tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "credits_exhausted", message: "Créditos de IA esgotados no workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("[generate-personalized-message] AI error", aiRes.status, text);
      return new Response(JSON.stringify({ error: "ai_error", message: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "";

    let parsed: { mensagem?: string; pontos_usados?: string[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    }

    let mensagem = (parsed.mensagem || "").trim();
    const pontos_usados = Array.isArray(parsed.pontos_usados) ? parsed.pontos_usados : [];

    if (!mensagem) {
      return new Response(JSON.stringify({ error: "empty_message", message: "IA retornou mensagem vazia", raw }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mensagem.length > 400) mensagem = mensagem.slice(0, 397).trimEnd() + "...";

    if (save) {
      await admin
        .from("leads")
        .update({
          mensagem_personalizada: mensagem,
          mensagem_gerada_em: new Date().toISOString(),
          mensagem_status: "gerada",
          mensagem_pontos_usados: pontos_usados,
        })
        .eq("id", lead_id);
    }

    return new Response(
      JSON.stringify({ mensagem, pontos_usados, model: chosenModel }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[generate-personalized-message] error", e);
    return new Response(JSON.stringify({ error: "server_error", message: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
