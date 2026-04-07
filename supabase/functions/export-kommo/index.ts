const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function buildNoteText(lead: any): string | null {
  const parts: string[] = [];

  if (lead.score != null || lead.lead_quality) {
    parts.push(`📊 SCORE: ${lead.score ?? "N/A"}/100 — ${(lead.lead_quality || "").toUpperCase()}`);
  }

  if (lead.justificativa) {
    parts.push(`\n📋 ANÁLISE:\n${lead.justificativa}`);
  }

  const positivos = Array.isArray(lead.sinais_positivos) ? lead.sinais_positivos : [];
  if (positivos.length > 0) {
    parts.push(`\n✅ SINAIS POSITIVOS:\n${positivos.map((s: string) => `• ${s}`).join("\n")}`);
  }

  const negativos = Array.isArray(lead.sinais_negativos) ? lead.sinais_negativos : [];
  if (negativos.length > 0) {
    parts.push(`\n⚠️ SINAIS NEGATIVOS:\n${negativos.map((s: string) => `• ${s}`).join("\n")}`);
  }

  if (parts.length === 0) return null;

  return `🤖 Relatório de Qualificação (LeadExtract)\n${"—".repeat(40)}\n${parts.join("\n")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { leads } = await req.json();

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum lead fornecido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Kommo settings
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["kommo_subdomain", "kommo_api_token", "kommo_pipeline_id"]);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) {
      if (s.value) settingsMap[s.key] = s.value;
    }

    const subdomain = settingsMap["kommo_subdomain"];
    const apiToken = settingsMap["kommo_api_token"];
    const pipelineId = settingsMap["kommo_pipeline_id"];

    if (!subdomain || !apiToken || !pipelineId) {
      return new Response(
        JSON.stringify({ error: "Configuração Kommo incompleta. Configure Subdomínio, API Token e Pipeline ID em Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ id: string; status: "success" | "duplicate" | "error"; error?: string }> = [];

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);

      const payload = batch.map((lead: any) => {
        const phone = lead.telefone || "";
        const contactFields: any[] = [];

        if (phone) {
          contactFields.push({
            field_code: "PHONE",
            values: [{ value: phone, enum_code: "WORK" }],
          });
        }

        contactFields.push({
          field_code: "POSITION",
          values: [{ value: lead.nome_decisor || "" }],
        });

        const companyFields: any[] = [];
        if (lead.telefone) {
          companyFields.push({
            field_code: "PHONE",
            values: [{ value: lead.telefone, enum_code: "WORK" }],
          });
        }
        if (lead.site) {
          companyFields.push({
            field_code: "WEB",
            values: [{ value: lead.site }],
          });
        }

        // Build tags from lead.tags array
        const tags = Array.isArray(lead.tags) && lead.tags.length > 0
          ? lead.tags.map((t: string) => ({ name: t }))
          : [];

        return {
          name: `${lead.nome_decisor || ""} — ${lead.nome_empresa}`.trim().replace(/^— /, ""),
          pipeline_id: parseInt(pipelineId),
          ...(tags.length > 0 ? { _embedded: {
            tags,
            contacts: [
              {
                first_name: lead.nome_decisor?.split(" ")[0] || lead.nome_empresa,
                last_name: lead.nome_decisor?.split(" ").slice(1).join(" ") || "",
                custom_fields_values: contactFields,
              },
            ],
            companies: [
              {
                name: lead.nome_empresa,
                custom_fields_values: companyFields,
              },
            ],
          } } : { _embedded: {
            contacts: [
              {
                first_name: lead.nome_decisor?.split(" ")[0] || lead.nome_empresa,
                last_name: lead.nome_decisor?.split(" ").slice(1).join(" ") || "",
                custom_fields_values: contactFields,
              },
            ],
            companies: [
              {
                name: lead.nome_empresa,
                custom_fields_values: companyFields,
              },
            ],
          } }),
        };
      });

      try {
        const response = await fetch(
          `https://${subdomain}.kommo.com/api/v4/leads/complex`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        if (response.ok) {
          const data = await response.json();
          
          // Extract created lead IDs from response
          const createdLeadIds: number[] = [];
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item?.id) createdLeadIds.push(item.id);
              if (item?._embedded?.leads) {
                for (const l of item._embedded.leads) {
                  if (l?.id) createdLeadIds.push(l.id);
                }
              }
            }
          }

          // Add notes to created leads
          for (let j = 0; j < batch.length; j++) {
            const lead = batch[j];
            const kommoLeadId = createdLeadIds[j];
            results.push({ id: lead.id, status: "success" });

            if (kommoLeadId) {
              const noteText = buildNoteText(lead);
              if (noteText) {
                try {
                  await fetch(
                    `https://${subdomain}.kommo.com/api/v4/leads/${kommoLeadId}/notes`,
                    {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${apiToken}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify([
                        {
                          note_type: "common",
                          params: { text: noteText },
                        },
                      ]),
                    }
                  );
                } catch (noteErr) {
                  console.error(`[KOMMO] Erro ao adicionar nota ao lead ${kommoLeadId}:`, noteErr);
                }
              }
            }
          }
        } else {
          const errorText = await response.text();
          let errorData: any;
          try { errorData = JSON.parse(errorText); } catch { errorData = errorText; }

          if (response.status === 400 && errorData?.["validation-errors"]) {
            for (let j = 0; j < batch.length; j++) {
              const leadErrors = errorData["validation-errors"]?.[j];
              if (leadErrors) {
                results.push({
                  id: batch[j].id,
                  status: "error",
                  error: JSON.stringify(leadErrors),
                });
              } else {
                results.push({ id: batch[j].id, status: "success" });
              }
            }
          } else if (response.status === 401) {
            for (const lead of batch) {
              results.push({ id: lead.id, status: "error", error: "Token inválido ou expirado" });
            }
          } else {
            for (const lead of batch) {
              results.push({
                id: lead.id,
                status: "error",
                error: `HTTP ${response.status}: ${typeof errorData === "string" ? errorData : JSON.stringify(errorData)}`,
              });
            }
          }
        }
      } catch (err: any) {
        for (const lead of batch) {
          results.push({ id: lead.id, status: "error", error: err.message || "Erro de rede" });
        }
      }

      // Delay between batches
      if (i + batchSize < leads.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
