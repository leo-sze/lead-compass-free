import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Building2, Globe, Sparkles, MessageSquare, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import MessageCell from "@/components/leads/MessageCell";
import { STAGES, stageStatus, type StageKey } from "@/lib/leadPipeline";

const ICONS: Record<StageKey, any> = { empresa: Building2, presenca: Globe, ia: Sparkles, mensagem: MessageSquare };
const STATUS_CLS: Record<string, string> = {
  pendente: "text-muted-foreground/40",
  processando: "text-primary animate-pulse",
  concluido: "text-primary",
  erro: "text-destructive",
  pulado: "text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", processando: "Processando", concluido: "Concluído", erro: "Erro", pulado: "Pulado" };

export function ProgressIcons({ lead }: { lead: any }) {
  return (
    <div className="flex gap-1.5">
      {STAGES.map((s) => {
        const st = stageStatus(lead, s.key);
        const Icon = ICONS[s.key];
        const err = lead[`stage_${s.key}_error`];
        return (
          <Tooltip key={s.key}>
            <TooltipTrigger asChild><Icon className={cn("h-4 w-4", STATUS_CLS[st])} /></TooltipTrigger>
            <TooltipContent>{s.label}: {STATUS_LABEL[st]}{err ? ` — ${err}` : ""}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export const TEMP_CLS: Record<string, string> = {
  quente: "bg-primary/15 text-primary border-primary/30",
  morno: "bg-accent/15 text-accent-foreground border-accent/30",
  frio: "bg-secondary text-muted-foreground border-border",
  desqualificado: "bg-destructive/10 text-destructive border-destructive/30",
};

export function TempBadge({ lead }: { lead: any }) {
  const t = lead.lead_quality;
  if (!t && lead.score == null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn("text-xs capitalize", TEMP_CLS[t] || "")}>
      {t || "?"}{lead.score != null ? ` · ${lead.score}` : ""}
    </Badge>
  );
}

const Row = ({ k, v }: { k: string; v: any }) => (
  <div className="grid grid-cols-[130px_1fr] gap-2 text-sm py-1 border-b border-border/30">
    <span className="text-muted-foreground">{k}</span>
    <span className="break-words">{v == null || v === "" ? "—" : v}</span>
  </div>
);

const link = (u?: string | null) => u ? <a href={u} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{u.replace(/https?:\/\//, "").slice(0, 40)}<ExternalLink className="h-3 w-3" /></a> : null;

export function LeadDrawer({ lead, open, onOpenChange, onUpdate }: { lead: any | null; open: boolean; onOpenChange: (v: boolean) => void; onUpdate: (patch: any) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {lead && (
          <>
            <SheetHeader>
              <SheetTitle>{lead.nome_empresa}</SheetTitle>
              <div className="flex items-center gap-2"><TempBadge lead={lead} />{lead.incompleto_motivo && <Badge variant="destructive">Incompleto: {lead.incompleto_motivo}</Badge>}</div>
            </SheetHeader>
            <div className="space-y-6 mt-4">
              {lead.resumo_ia && <p className="text-sm bg-secondary/40 rounded-md p-3">{lead.resumo_ia}</p>}
              <section>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Contato</h4>
                <Row k="Telefone" v={lead.telefone} /><Row k="Endereço" v={lead.endereco} />
                <Row k="Cidade / UF" v={[lead.cidade, lead.uf].filter(Boolean).join(" / ")} />
                <Row k="Fonte" v={lead.fonte} /><Row k="Termo" v={lead.termo_pesquisa} />
                <Row k="Criado em" v={new Date(lead.created_at).toLocaleString("pt-BR")} />
              </section>
              <section>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Etapas do enriquecimento</h4>
                {STAGES.map((s) => {
                  const st = stageStatus(lead, s.key);
                  const at = lead[`stage_${s.key}_at`];
                  const err = lead[`stage_${s.key}_error`];
                  return (
                    <div key={s.key} className="flex items-start justify-between text-sm py-1.5 border-b border-border/30">
                      <span>{s.label}</span>
                      <span className="text-right">
                        <span className={STATUS_CLS[st]}>{STATUS_LABEL[st]}</span>
                        {at && <span className="block text-xs text-muted-foreground">{new Date(at).toLocaleString("pt-BR")}</span>}
                        {err && <span className="block text-xs text-destructive">{err}</span>}
                      </span>
                    </div>
                  );
                })}
              </section>
              <section>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Etapa 1 · Empresa</h4>
                <Row k="CNPJ" v={lead.cnpj} /><Row k="Confiança do CNPJ" v={lead.cnpj_confidence} />
                <Row k="Razão social" v={lead.razao_social} /><Row k="Situação" v={lead.situacao_cadastral} />
                <Row k="CNAE" v={lead.cnae} /><Row k="Porte" v={lead.porte} />
                <Row k="Abertura" v={lead.data_abertura} /><Row k="Capital social" v={lead.capital_social} />
                <Row k="Decisor" v={lead.nome_decisor} /><Row k="Qualificação" v={lead.decisor_qualificacao} />
                <Row k="Tel. decisor" v={lead.decisor_telefone} /><Row k="LinkedIn decisor" v={link(lead.decisor_linkedin)} />
              </section>
              <section>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Etapa 2 · Presença digital</h4>
                <Row k="Site" v={link(lead.site)} /><Row k="Instagram" v={link(lead.instagram)} /><Row k="LinkedIn" v={link(lead.linkedin)} />
                <Row k="Nota Google" v={lead.google_rating != null ? `${lead.google_rating} (${lead.google_review_count ?? 0} avaliações)` : null} />
                <Row k="Último post IG" v={lead.instagram_last_post_days != null ? `${lead.instagram_last_post_days} dias atrás` : null} />
              </section>
              <section>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Etapa 3 · Análise IA</h4>
                <Row k="Score IA" v={lead.score} /><Row k="Maturidade" v={lead.maturidade ? `${lead.maturidade}/5` : null} />
                <Row k="Tier comercial" v={lead.tier ? `${lead.tier} (${lead.commercial_score ?? "—"})` : null} />
                <Row k="Justificativa" v={lead.justificativa} />
                <Row k="Sinais +" v={(lead.sinais_positivos || []).join(" · ")} />
                <Row k="Sinais −" v={(lead.sinais_negativos || []).join(" · ")} />
              </section>
              <section>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Etapa 4 · Mensagem</h4>
                <MessageCell lead={lead} onUpdate={onUpdate} />
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
