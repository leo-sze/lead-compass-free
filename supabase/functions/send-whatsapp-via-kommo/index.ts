const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type InLead = {
  id: string;
  telefone?: string | null;
  nome_empresa?: string | null;
  mensagem_personalizada?: string | null;
};

function normalizePhone(p: string): string {
  return p.replace(/\D/g, "");
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Prefer env secrets; fallback to settings table for subdomain/token
    const envToken = Deno.env.get("KOMMO_ACCESS_TOKEN") || "";
    const envAccountUrl = (Deno.env.get("KOMMO_ACCOUNT_URL") || "").replace(/\/+$/, "");
    const botIdRaw = Deno.env.get("KOMMO_BOT_ID") || "";
    const fieldIdRaw = Deno.env.get("KOMMO_CUSTOM_FIELD_ID_MENSAGEM") || "";

    let base = envAccountUrl;
    let token = envToken;
    if (!base || !token) {
      const { data: settings } = await supabase
        .from("settings").select("key, value")
        .in("key", ["kommo_subdomain", "kommo_api_token"]);
      const map: Record<string, string> = {};
      for (const s of settings || []) if (s.value) map[s.key] = s.value;
      if (!base && map["kommo_subdomain"]) base = `https://${map["kommo_subdomain"]}.kommo.com`;
      if (!token) token = map["kommo_api_token"] || "";
    }

    if (!base || !token) {
      return new Response(JSON.stringify({
        error: "Configuração Kommo incompleta (KOMMO_ACCOUNT_URL/KOMMO_ACCESS_TOKEN).",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const botId = Number(botIdRaw);
    const fieldId = Number(fieldIdRaw);
    if (!botId || !fieldId) {
      return new Response(JSON.stringify({
        error: "Configuração faltando: defina os secrets KOMMO_BOT_ID e KOMMO_CUSTOM_FIELD_ID_MENSAGEM.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const results: Array<{ id: string; status: "success" | "skipped" | "error"; error?: string; kommo_lead_id?: number }> = [];

    for (const lead of leads) {
      try {
        const message = (lead.mensagem_personalizada || "").trim();
        if (!message) {
          results.push({ id: lead.id, status: "skipped", error: "Sem mensagem personalizada gerada" });
          continue;
        }
        const phone = lead.telefone ? normalizePhone(lead.telefone) : "";
        if (!phone) {
          results.push({ id: lead.id, status: "skipped", error: "Sem telefone" });
          continue;
        }

        // Search Kommo lead by phone
        const searchUrl = `${base}/api/v4/leads?query=${encodeURIComponent(phone)}&with=contacts`;
        const searchResp = await fetch(searchUrl, { headers: authHeaders });
        if (searchResp.status === 401 || searchResp.status === 403) {
          results.push({ id: lead.id, status: "error", error: "Token Kommo inválido ou expirado" });
          continue;
        }
        if (searchResp.status === 204) {
          results.push({ id: lead.id, status: "error", error: "Lead não encontrado no Kommo — exporte primeiro" });
          continue;
        }
        if (!searchResp.ok) {
          const t = await searchResp.text();
          results.push({ id: lead.id, status: "error", error: `Busca falhou HTTP ${searchResp.status}: ${t.slice(0, 200)}` });
          continue;
        }
        const searchData = await searchResp.json();
        const kommoLeadId: number | undefined = searchData?._embedded?.leads?.[0]?.id;
        if (!kommoLeadId) {
          results.push({ id: lead.id, status: "error", error: "Lead não encontrado no Kommo — exporte primeiro" });
          continue;
        }

        // 1) PATCH lead: preencher campo personalizado "mensagem_ia" com a mensagem gerada
        const patchResp = await fetch(`${base}/api/v4/leads/${kommoLeadId}`, {
          method: "PATCH", headers: authHeaders,
          body: JSON.stringify({
            custom_fields_values: [
              { field_id: fieldId, values: [{ value: message }] },
            ],
          }),
        });
        if (!patchResp.ok) {
          const t = await patchResp.text();
          results.push({ id: lead.id, status: "error", error: `Falha ao atualizar campo mensagem_ia: HTTP ${patchResp.status} ${t.slice(0, 200)}` });
          continue;
        }

        // 2) Disparar Salesbot via bot_id
        const botResp = await fetch(`${base}/api/v4/salesbot/run`, {
          method: "POST", headers: authHeaders,
          body: JSON.stringify([{ bot_id: botId, entity_type: "leads", entity_id: kommoLeadId }]),
        });

        if (botResp.status === 202) {
          await supabase.from("leads").update({ mensagem_status: "enviada" }).eq("id", lead.id);
          results.push({ id: lead.id, status: "success", kommo_lead_id: kommoLeadId });
        } else {
          const t = await botResp.text();
          results.push({
            id: lead.id,
            status: "error",
            error: `Falha ao disparar Salesbot: HTTP ${botResp.status} ${t.slice(0, 200)}`,
          });
        }
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
