import { supabase } from "@/integrations/supabase/client";

export type StageKey = "empresa" | "presenca" | "ia" | "mensagem";
export type StageStatus = "pendente" | "processando" | "concluido" | "erro" | "pulado";

export const STAGES: { key: StageKey; label: string }[] = [
  { key: "empresa", label: "Empresa" },
  { key: "presenca", label: "Presença digital" },
  { key: "ia", label: "Análise IA" },
  { key: "mensagem", label: "Mensagem" },
];

export const stageStatus = (lead: any, k: StageKey): StageStatus =>
  (lead?.[`stage_${k}_status`] as StageStatus) || "pendente";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      const rate = /429|rate/i.test(String(e?.message || e));
      await sleep((rate ? 4000 : 1000) * 2 ** i);
    }
  }
  throw last;
}

async function callEnrich(stage: string, lead: any) {
  const { data, error } = await supabase.functions.invoke("enrich-lead", {
    body: {
      stage,
      nome_empresa: lead.nome_empresa, site: lead.site, instagram: lead.instagram, linkedin: lead.linkedin,
      telefone: lead.telefone, endereco: lead.endereco, nome_decisor: lead.nome_decisor,
      decisor_linkedin: lead.decisor_linkedin ?? null, decisor_telefone: lead.decisor_telefone ?? null,
      cidade: lead.cidade, cnpj: lead.cnpj ?? null,
      prev_instagram_last_post_days: lead.instagram_last_post_days ?? null,
      prev_instagram_profile_is_person: lead.instagram_profile_is_person ?? null,
      prev_google_rating: lead.google_rating ?? null,
      prev_google_review_count: lead.google_review_count ?? null,
      prev_google_owner_replied_recently: lead.google_owner_replied_recently ?? null,
      prev_google_profile_complete: lead.google_profile_complete ?? null,
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return ((data as any)?.updates || {}) as Record<string, any>;
}

type Patch = Record<string, any>;

async function runStage(k: StageKey, lead: any, autoMessage: boolean): Promise<Patch> {
  const raw = { ...(lead.raw_sources || {}) };
  if (k === "empresa") {
    const hadCnpj = !!lead.cnpj;
    const biz = await withRetry(() => callEnrich("business", lead));
    const merged = { ...lead, ...biz };
    const dec = await withRetry(() => callEnrich("decisor", merged));
    const out: Patch = { ...biz, ...dec };
    delete out.debug_raw_data;
    raw.empresa = { business: biz.debug_raw_data ?? null, decisor: dec.debug_raw_data ?? null };
    const cnpj = out.cnpj ?? lead.cnpj;
    out.cnpj_confidence = cnpj ? (hadCnpj || out.nome_decisor ? "alto" : "medio") : null;
    const situ = String(out.situacao_cadastral ?? lead.situacao_cadastral ?? "").toLowerCase();
    if (/baixada|inapta/.test(situ)) { out.lead_quality = "desqualificado"; out.temperatura = "desqualificado"; }
    out.raw_sources = raw;
    out.stage_empresa_error = cnpj ? null : "sem CNPJ";
    return out;
  }
  if (k === "presenca") {
    const m = await withRetry(() => callEnrich("maturity", lead));
    raw.presenca = m.debug_raw_data ?? null;
    delete m.debug_raw_data;
    return { ...m, raw_sources: raw };
  }
  if (k === "ia") {
    const sc = await withRetry(() => callEnrich("score", lead));
    delete sc.debug_raw_data;
    const merged = { ...lead, ...sc };
    const b = merged.score_breakdown || {};
    const { data, error } = await withRetry(async () => {
      const r = await supabase.functions.invoke("score-lead", {
        body: {
          nome_empresa: merged.nome_empresa, endereco: merged.endereco, bairro: b.bairro || null,
          cidade: merged.cidade, estado: b.estado || merged.uf || null,
          rating: merged.google_rating ?? b.rating ?? null, total_reviews: merged.google_review_count ?? b.total_reviews ?? null,
          website: merged.site, price_level: b.price_level || null, categoria: b.categoria || merged.termo_pesquisa || null,
          reviews: b.reviews || [],
        },
      });
      if (r.error) throw r.error;
      return r;
    });
    if (error || (data as any)?.error) throw new Error((data as any)?.error || "Falha na análise IA");
    const d: any = data;
    const igDays = merged.instagram_last_post_days;
    const posting = igDays == null ? null : igDays <= 7 ? "ativo" : igDays <= 30 ? "esporádico" : "inativo";
    let maturidade = 1;
    if (merged.site) maturidade++;
    if (merged.instagram) maturidade++;
    if (posting === "ativo") maturidade++;
    if ((merged.google_review_count ?? 0) >= 50) maturidade++;
    const quality = merged.lead_quality === "desqualificado" ? "desqualificado" : d.classificacao;
    return {
      ...sc,
      score: d.score, lead_quality: quality, temperatura: quality, justificativa: d.justificativa,
      sinais_positivos: d.sinais_positivos, sinais_negativos: d.sinais_negativos,
      maturidade: Math.min(5, maturidade),
      resumo_ia: d.justificativa ? String(d.justificativa).split(/(?<=\.)\s/).slice(0, 2).join(" ") : null,
      ...(d.website_encontrado && !merged.site ? { site: d.website_encontrado } : {}),
    };
  }
  // mensagem
  if (!autoMessage) return { __skip: true };
  const { data, error } = await supabase.functions.invoke("generate-personalized-message", { body: { lead_id: lead.id, regenerate: false } });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
  return { mensagem_personalizada: (data as any).mensagem, mensagem_status: "gerada", mensagem_gerada_em: new Date().toISOString() };
}

export interface PipelineOptions {
  reprocess?: StageKey | null; // force re-run from this stage
  autoMessage?: boolean;
  onLeadUpdate: (id: string, patch: Patch) => void;
  onProgress: (p: { done: number; total: number; stage: number }) => void;
  concurrency?: number;
}

export async function runPipeline(leads: any[], opts: PipelineOptions) {
  const total = leads.length;
  let done = 0;
  const queue = [...leads];
  const forceFrom = opts.reprocess ? STAGES.findIndex((s) => s.key === opts.reprocess) : -1;

  const save = async (id: string, patch: Patch) => {
    await supabase.from("leads").update(patch as any).eq("id", id);
    opts.onLeadUpdate(id, patch);
  };

  const worker = async () => {
    while (queue.length) {
      let lead = queue.shift()!;
      for (let i = 0; i < STAGES.length; i++) {
        const k = STAGES[i].key;
        const st = stageStatus(lead, k);
        if ((st === "concluido" || st === "pulado") && !(forceFrom >= 0 && i >= forceFrom)) continue;
        opts.onProgress({ done, total, stage: i + 1 });
        await save(lead.id, { [`stage_${k}_status`]: "processando" });
        try {
          const out = await runStage(k, lead, !!opts.autoMessage);
          const skipped = out.__skip;
          delete out.__skip;
          const patch = {
            ...out,
            [`stage_${k}_status`]: skipped ? "pulado" : "concluido",
            [`stage_${k}_at`]: new Date().toISOString(),
            ...(k !== "empresa" ? { [`stage_${k}_error`]: null } : {}),
          };
          await save(lead.id, patch);
          lead = { ...lead, ...patch };
        } catch (e: any) {
          await save(lead.id, {
            [`stage_${k}_status`]: "erro",
            [`stage_${k}_at`]: new Date().toISOString(),
            [`stage_${k}_error`]: String(e?.message || e).slice(0, 300),
          });
          lead = { ...lead, [`stage_${k}_status`]: "erro" };
          // Partial failure: keep going to next stage
        }
      }
      done++;
      opts.onProgress({ done, total, stage: 4 });
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, total) }, worker));
}
