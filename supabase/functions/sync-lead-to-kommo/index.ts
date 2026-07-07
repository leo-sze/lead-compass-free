const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATUS_TAG_MAP: Record<string, string> = {
  ativo: "whatsapp-ativo",
  moderado: "whatsapp-moderado",
  inativo: "whatsapp-inativo",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      lead_id,
      kommo_lead_id,
      status,
      status_id, // optional: pipeline stage id
      pipeline_id, // optional
    } = body ?? {};

    if (!kommo_lead_id) {
      return new Response(JSON.stringify({ error: "kommo_lead_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!status || !STATUS_TAG_MAP[status]) {
      return new Response(
        JSON.stringify({ error: "status inválido. Use: ativo, moderado ou inativo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = Deno.env.get("KOMMO_ACCESS_TOKEN");
    const accountUrl = Deno.env.get("KOMMO_ACCOUNT_URL");

    if (!token || !accountUrl) {
      return new Response(
        JSON.stringify({ error: "KOMMO_ACCESS_TOKEN ou KOMMO_ACCOUNT_URL não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = accountUrl.replace(/\/+$/, "");
    const tagName = STATUS_TAG_MAP[status];

    const payload: Record<string, unknown> = {
      _embedded: {
        tags: [{ name: tagName }],
      },
    };
    if (status_id) payload.status_id = Number(status_id);
    if (pipeline_id) payload.pipeline_id = Number(pipeline_id);

    const resp = await fetch(`${baseUrl}/api/v4/leads/${kommo_lead_id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    if (resp.status === 401 || resp.status === 403) {
      return new Response(
        JSON.stringify({
          error: "Token do Kommo inválido ou expirado. Atualize KOMMO_ACCESS_TOKEN nos Secrets.",
          kommo_status: resp.status,
          kommo_response: data,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({
          error: `Kommo respondeu HTTP ${resp.status}`,
          kommo_response: data,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SYNC-KOMMO] lead=${lead_id} kommo=${kommo_lead_id} status=${status} tag=${tagName}`);

    return new Response(
      JSON.stringify({ success: true, tag_applied: tagName, kommo_response: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
