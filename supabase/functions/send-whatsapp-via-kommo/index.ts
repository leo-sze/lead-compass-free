const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
type InLead = {
  id: string;
  telefone?: string | null;
  nome_empresa?: string | null;
  mensagem_personalizada?: string | null;
};

function normalizePhone(p: string): string {
  return p.replace(/\D/g, "");
}

function normalizeWhatsAppPhone(p: string): string {
  const digits = normalizePhone(p);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { leads } = (await req.json()) as { leads: InLead[] };
    if (!Array.isArray(leads) || leads.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum lead fornecido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Envio direto pelo WhatsApp Cloud API. Não usa Kommo, nota, campo, tag nem Salesbot.
    const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v23.0";
    const whatsappToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";

    if (!whatsappToken || !phoneNumberId) {
      return new Response(JSON.stringify({
        error: "Configuração WhatsApp incompleta (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID).",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const authHeaders = { Authorization: `Bearer ${whatsappToken}`, "Content-Type": "application/json" };
    const results: Array<{ id: string; status: "success" | "skipped" | "error"; error?: string; whatsapp_message_id?: string }> = [];

    for (const lead of leads) {
      try {
        const message = (lead.mensagem_personalizada || "").trim();
        if (!message) {
          results.push({ id: lead.id, status: "skipped", error: "Sem mensagem personalizada gerada" });
          continue;
        }
        const phone = lead.telefone ? normalizeWhatsAppPhone(lead.telefone) : "";
        if (!phone) {
          results.push({ id: lead.id, status: "skipped", error: "Sem telefone" });
          continue;
        }

        const sendResp = await fetch(endpoint, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone,
            type: "text",
            text: { preview_url: false, body: message },
          }),
        });
        const responseText = await sendResp.text();
        let responseData: any = null;
        try { responseData = responseText ? JSON.parse(responseText) : null; } catch { responseData = null; }

        if (!sendResp.ok) {
          const apiError = responseData?.error?.message || responseText;
          const authError = sendResp.status === 401 || sendResp.status === 403;
          results.push({
            id: lead.id,
            status: "error",
            error: authError
              ? "Token WhatsApp inválido ou sem permissão"
              : `Falha ao enviar WhatsApp: HTTP ${sendResp.status} ${String(apiError).slice(0, 240)}`,
          });
          continue;
        }

        results.push({ id: lead.id, status: "success", whatsapp_message_id: responseData?.messages?.[0]?.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ id: lead.id, status: "error", error: msg });
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
