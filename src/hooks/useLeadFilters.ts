import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type Tri = "any" | "yes" | "no";
export type Temp = "all" | "quente" | "morno" | "frio" | "desqualificado" | "sem_avaliacao";
export type Period = "" | "today" | "7d" | "30d" | "month" | "custom";
export type StageFilter = "" | "stopped1" | "stopped2" | "stopped3" | "error" | "complete" | "pending";

export interface LeadFilterState {
  q: string; temp: Temp; cidade: string; termo: string; fonte: string;
  phone: Tri; site: Tri; ig: Tri; decisor: Tri; exported: Tri; msg: Tri;
  stage: StageFilter; incompletos: boolean;
  period: Period; from: string; to: string;
}

export const DEFAULTS: LeadFilterState = {
  q: "", temp: "all", cidade: "", termo: "", fonte: "",
  phone: "any", site: "any", ig: "any", decisor: "any", exported: "any", msg: "any",
  stage: "", incompletos: false, period: "", from: "", to: "",
};

export function useLeadFilters() {
  const [params, setParams] = useSearchParams();
  const state = useMemo<LeadFilterState>(() => {
    const s: any = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      const v = params.get(k);
      if (v == null) continue;
      s[k] = typeof (DEFAULTS as any)[k] === "boolean" ? v === "1" : v;
    }
    return s;
  }, [params]);

  const set = useCallback((patch: Partial<LeadFilterState>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        const def = (DEFAULTS as any)[k];
        if (v === def || v === "" || v == null) next.delete(k);
        else next.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);
  return { state, set, clear };
}

export function periodRange(s: LeadFilterState): [Date | null, Date | null] {
  const now = new Date();
  const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  switch (s.period) {
    case "today": return [sod(now), null];
    case "7d": return [sod(new Date(now.getTime() - 6 * 864e5)), null];
    case "30d": return [sod(new Date(now.getTime() - 29 * 864e5)), null];
    case "month": return [new Date(now.getFullYear(), now.getMonth(), 1), null];
    case "custom": {
      const f = s.from ? sod(new Date(s.from + "T00:00:00")) : null;
      const t = s.to ? new Date(s.to + "T23:59:59") : null;
      return [f, t];
    }
    default: return [null, null];
  }
}

const tri = (t: Tri, has: boolean) => t === "any" || (t === "yes" ? has : !has);
const filled = (v: any) => !!v && String(v).trim() !== "";

export function applyLeadFilters(leads: any[], s: LeadFilterState, opts: { skipTemp?: boolean } = {}) {
  const [from, to] = periodRange(s);
  const q = s.q.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  return leads.filter((l) => {
    const inc = !!l.incompleto_motivo;
    if (s.incompletos ? !inc : inc) return false;
    if (!opts.skipTemp) {
      const t = l.lead_quality;
      if (s.temp === "all") { if (t === "desqualificado") return false; }
      else if (s.temp === "sem_avaliacao") { if (t || l.score != null) return false; }
      else if (t !== s.temp) return false;
    }
    if (q) {
      const hit = l.nome_empresa?.toLowerCase().includes(q) || l.endereco?.toLowerCase().includes(q) ||
        (qDigits.length >= 4 && (String(l.telefone || "").replace(/\D/g, "").includes(qDigits) || String(l.cnpj || "").replace(/\D/g, "").includes(qDigits)));
      if (!hit) return false;
    }
    if (s.cidade && l.cidade !== s.cidade) return false;
    if (s.termo && l.termo_pesquisa !== s.termo) return false;
    if (s.fonte && l.fonte !== s.fonte) return false;
    if (!tri(s.phone, filled(l.telefone))) return false;
    if (!tri(s.site, filled(l.site))) return false;
    if (!tri(s.ig, filled(l.instagram))) return false;
    if (!tri(s.decisor, filled(l.nome_decisor))) return false;
    if (!tri(s.exported, !!l.kommo_imported_at)) return false;
    if (!tri(s.msg, !!l.mensagem_personalizada)) return false;
    if (s.stage) {
      const st = ["empresa", "presenca", "ia", "mensagem"].map((k) => l[`stage_${k}_status`] || "pendente");
      const ok = (x: string) => x === "concluido" || x === "pulado";
      if (s.stage === "error" && !st.includes("erro")) return false;
      if (s.stage === "pending" && !st.every((x) => x === "pendente")) return false;
      if (s.stage === "complete" && !st.slice(0, 3).every(ok)) return false;
      if (s.stage === "stopped1" && !(!ok(st[0]) && st[0] !== "pendente")) return false;
      if (s.stage === "stopped2" && !(ok(st[0]) && !ok(st[1]))) return false;
      if (s.stage === "stopped3" && !(ok(st[0]) && ok(st[1]) && !ok(st[2]))) return false;
    }
    if (from || to) {
      const d = new Date(l.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
    }
    return true;
  });
}

const triLabel = (t: Tri, yes = "Com", no = "Sem") => (t === "yes" ? yes : no);
const STAGE_LABELS: Record<string, string> = {
  stopped1: "Parou na Etapa 1", stopped2: "Parou na Etapa 2", stopped3: "Parou na Etapa 3",
  error: "Com erro", complete: "Concluídos", pending: "Não iniciados",
};
const PERIOD_LABELS: Record<string, string> = { today: "Hoje", "7d": "7 dias", "30d": "30 dias", month: "Este mês", custom: "Personalizado" };

export function activeChips(s: LeadFilterState): { key: string; label: string; reset: Partial<LeadFilterState> }[] {
  const c: { key: string; label: string; reset: Partial<LeadFilterState> }[] = [];
  if (s.q) c.push({ key: "q", label: `Busca: ${s.q}`, reset: { q: "" } });
  if (s.cidade) c.push({ key: "cidade", label: `Cidade: ${s.cidade}`, reset: { cidade: "" } });
  if (s.termo) c.push({ key: "termo", label: `Termo: ${s.termo}`, reset: { termo: "" } });
  if (s.fonte) c.push({ key: "fonte", label: `Fonte: ${s.fonte}`, reset: { fonte: "" } });
  if (s.phone !== "any") c.push({ key: "phone", label: `Telefone: ${triLabel(s.phone)}`, reset: { phone: "any" } });
  if (s.site !== "any") c.push({ key: "site", label: `Site: ${triLabel(s.site)}`, reset: { site: "any" } });
  if (s.ig !== "any") c.push({ key: "ig", label: `Instagram: ${triLabel(s.ig)}`, reset: { ig: "any" } });
  if (s.decisor !== "any") c.push({ key: "decisor", label: `Decisor: ${triLabel(s.decisor)}`, reset: { decisor: "any" } });
  if (s.exported !== "any") c.push({ key: "exported", label: `Exportado: ${triLabel(s.exported, "Sim", "Não")}`, reset: { exported: "any" } });
  if (s.msg !== "any") c.push({ key: "msg", label: `Mensagem: ${triLabel(s.msg, "Gerada", "Não gerada")}`, reset: { msg: "any" } });
  if (s.stage) c.push({ key: "stage", label: `Etapa: ${STAGE_LABELS[s.stage]}`, reset: { stage: "" } });
  if (s.incompletos) c.push({ key: "inc", label: "Incompletos", reset: { incompletos: false } });
  if (s.period) c.push({ key: "period", label: `Período: ${PERIOD_LABELS[s.period]}${s.period === "custom" ? ` ${s.from || "…"} → ${s.to || "…"}` : ""}`, reset: { period: "", from: "", to: "" } });
  return c;
}

export const popoverFilterCount = (s: LeadFilterState) =>
  activeChips(s).filter((c) => !["q", "period"].includes(c.key)).length;
