// Envio via Kommo: adiciona tag "enviar-whatsapp" + preenche campo "mensagem_ia".
// A automação (Salesbot/Digital Pipeline) do Kommo é quem dispara a mensagem real.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const TAG_NAME = "enviar-whatsapp";
const FIELD_NAME = "mensagem_ia";

function digits(p: string): string {
  return (p || "").replace(/\D/g, "");
}

async function findMensagemFieldId(baseUrl: string, apiToken: string): Promise<number | null> {
  // Kommo custom fields live per entity. Try leads first, then contacts.
  const entities = ["leads", "contacts"];
  for (const entity of entities) {
    let page = 1;
    while (page <= 10) {
      const resp = await fetch(`${baseUrl}/api/v4/${entity}/custom_fields?page=${page}&limit=250`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (!resp.ok) break;
      const data = await resp.json().catch(() => null);
      const fields = data?._embedded?.custom_fields || [];
      for (const f of fields) {
        if ((f?.name || "").trim().toLowerCase() === FIELD_NAME) {
          return { id: f.id, entity } as any;
        }
      }
      if (fields.length < 250) break;
      page++;
    }
  }
  return null;
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

    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["kommo_subdomain", "kommo_api_token"]);

    const map: Record<string, string> = {};
    for (const s of settings || []) if (s.value) map[s.key] = s.value;

    const subdomain = map["kommo_subdomain"];
    const apiToken = map["kommo_api_token"];

    if (!subdomain || !apiToken) {
      return new Response(JSON.stringify({
        error: "Configuração Kommo incompleta. Preencha Subdomínio e API Token em Configurações.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const baseUrl = `https://${subdomain}.kommo.com`;
    const authHeaders = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" };

    // Descobrir field id de mensagem_ia (uma vez).
    const fieldInfo: any = await findMensagemFieldId(baseUrl, apiToken);
    if (!fieldInfo) {
      return new Response(JSON.stringify({
        error: `Campo personalizado "${FIELD_NAME}" não encontrado no Kommo (nem em leads nem em contacts). Crie o campo com esse nome exato.`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: Array<{ id: string; status: "success" | "skipped" | "error"; error?: string }> = [];

    for (const lead of leads) {
      try {
        const message = (lead.mensagem_personalizada || "").trim();
        if (!message) { results.push({ id: lead.id, status: "skipped", error: "Sem mensagem IA" }); continue; }
        const phone = digits(lead.telefone || "");
        if (!phone) { results.push({ id: lead.id, status: "skipped", error: "Sem telefone" }); continue; }

        // Buscar lead no Kommo pelo telefone.
        const searchResp = await fetch(
          `${baseUrl}/api/v4/leads?query=${encodeURIComponent(phone)}&with=contacts&limit=10`,
          { headers: authHeaders },
        );
        if (searchResp.status === 401 || searchResp.status === 403) {
          results.push({ id: lead.id, status: "error", error: "Token Kommo inválido ou sem permissão" });
          continue;
        }
        if (searchResp.status === 204) {
          results.push({ id: lead.id, status: "error", error: `Lead com telefone ${phone} não encontrado no Kommo` });
          continue;
        }
        if (!searchResp.ok) {
          const t = await searchResp.text();
          results.push({ id: lead.id, status: "error", error: `Busca Kommo HTTP ${searchResp.status}: ${t.slice(0, 200)}` });
          continue;
        }
        const searchData = await searchResp.json().catch(() => null);
        const kommoLead = searchData?._embedded?.leads?.[0];
        const kommoLeadId = kommoLead?.id;
        if (!kommoLeadId) {
          results.push({ id: lead.id, status: "error", error: `Lead com telefone ${phone} não encontrado no Kommo` });
          continue;
        }

        if (fieldInfo.entity === "leads") {
          // PATCH lead: tag + campo mensagem_ia
          const patchResp = await fetch(`${baseUrl}/api/v4/leads/${kommoLeadId}`, {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({
              custom_fields_values: [
                { field_id: fieldInfo.id, values: [{ value: message }] },
              ],
              _embedded: { tags_to_add: [{ name: TAG_NAME }] },
            }),
          });
          if (!patchResp.ok) {
            const t = await patchResp.text();
            results.push({ id: lead.id, status: "error", error: `PATCH lead HTTP ${patchResp.status}: ${t.slice(0, 240)}` });
            continue;
          }
        } else {
          // Campo está em contacts: atualizar contato principal + tag no lead
          const contactId = kommoLead?._embedded?.contacts?.find((c: any) => c.is_main)?.id
            || kommoLead?._embedded?.contacts?.[0]?.id;
          if (!contactId) {
            results.push({ id: lead.id, status: "error", error: "Lead sem contato para gravar mensagem_ia" });
            continue;
          }
          const patchContact = await fetch(`${baseUrl}/api/v4/contacts/${contactId}`, {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({
              custom_fields_values: [
                { field_id: fieldInfo.id, values: [{ value: message }] },
              ],
            }),
          });
          if (!patchContact.ok) {
            const t = await patchContact.text();
            results.push({ id: lead.id, status: "error", error: `PATCH contact HTTP ${patchContact.status}: ${t.slice(0, 240)}` });
            continue;
          }
          const patchLead = await fetch(`${baseUrl}/api/v4/leads/${kommoLeadId}`, {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ _embedded: { tags_to_add: [{ name: TAG_NAME }] } }),
          });
          if (!patchLead.ok) {
            const t = await patchLead.text();
            results.push({ id: lead.id, status: "error", error: `PATCH tag HTTP ${patchLead.status}: ${t.slice(0, 240)}` });
            continue;
          }
        }

        results.push({ id: lead.id, status: "success" });
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
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
