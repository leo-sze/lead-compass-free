import { useState, useEffect, useMemo, useCallback } from "react";
import { Download, MessageCircle, Trash2, ExternalLink, Instagram, UserSearch, Loader2, Sparkles, Building2, X, CheckCircle, AlertTriangle, XCircle, RefreshCw, Database, Copy, Tag, Star, MessageSquare, User } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizePhone } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import LeadFilters from "@/components/leads/LeadFilters";
import BulkWhatsApp from "@/components/leads/BulkWhatsApp";
import CopyForSDR from "@/components/leads/CopyForSDR";
import B2BLeadsImport from "@/components/leads/B2BLeadsImport";
import MessageCell from "@/components/leads/MessageCell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Lead = Tables<"leads"> & {
  termo_pesquisa?: string | null;
  cidade?: string | null;
  fonte?: string | null;
  score?: number | null;
  lead_quality?: string | null;
  score_breakdown?: any;
  justificativa?: string | null;
  sinais_positivos?: string[] | null;
  sinais_negativos?: string[] | null;
};

type QualityFilter = "all" | "quente" | "morno" | "frio" | "desqualificado" | "sem_avaliacao";

const qualityConfig: Record<string, { label: string; className: string }> = {
  quente: { label: "Quente", className: "bg-green-500/10 text-green-400 border-green-500/30" },
  morno: { label: "Morno", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
  frio: { label: "Frio", className: "bg-red-500/10 text-red-400 border-red-500/30" },
  desqualificado: { label: "Desqualificado", className: "bg-muted/50 text-muted-foreground border-border" },
};

const QualityBadgeWithHover = ({ lead, isScoring }: { lead: Lead; isScoring?: boolean }) => {
  if (isScoring) {
    return <Skeleton className="h-5 w-20 rounded-full" />;
  }

  const quality = lead.lead_quality;
  const score = lead.score;
  if (!quality) return <span className="text-xs text-muted-foreground">—</span>;

  const c = qualityConfig[quality];
  if (!c) return null;

  const justificativa = (lead as any).justificativa;
  const sinaisPositivos: string[] = (lead as any).sinais_positivos || [];
  const sinaisNegativos: string[] = (lead as any).sinais_negativos || [];
  const hasDetails = justificativa || sinaisPositivos.length > 0 || sinaisNegativos.length > 0;

  const badge = (
    <Badge variant="outline" className={`${c.className} text-xs cursor-help`}>
      {score != null ? `${score} ` : ""}{c.label}
    </Badge>
  );

  if (!hasDetails) return badge;

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <span className="inline-flex cursor-help">{badge}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-4" side="right">
        <p className="text-sm font-semibold mb-2">
          Score: {score ?? 0}/100 — {c.label}
        </p>
        {justificativa && (
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{justificativa}</p>
        )}
        {sinaisPositivos.length > 0 && (
          <div className="mb-2">
            <p className="text-xs font-medium text-green-400 mb-1">✅ Sinais positivos</p>
            <div className="space-y-0.5">
              {sinaisPositivos.map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground pl-1">• {s}</p>
              ))}
            </div>
          </div>
        )}
        {sinaisNegativos.length > 0 && (
          <div>
            <p className="text-xs font-medium text-red-400 mb-1">⚠️ Sinais negativos</p>
            <div className="space-y-0.5">
              {sinaisNegativos.map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground pl-1">• {s}</p>
              ))}
            </div>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
};

const tierConfig: Record<string, { label: string; className: string; cta: string }> = {
  A: { label: "Tier A", className: "bg-green-500/15 text-green-400 border-green-500/40", cta: "Ligar agora" },
  B: { label: "Tier B", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40", cta: "WhatsApp primeiro" },
  C: { label: "Tier C", className: "bg-red-500/15 text-red-400 border-red-500/40", cta: "Enriquecer mais" },
};

const CommercialCell = ({ lead }: { lead: any }) => {
  const tier = lead.tier as "A" | "B" | "C" | null;
  const score = lead.commercial_score as number | null;
  if (!tier && score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const c = tier ? tierConfig[tier] : null;

  // Reconstrói o breakdown completo da nota (mesma lógica da edge function)
  // Mostra TODOS os critérios — aplicados (com pontos) e não-aplicados (em cinza)
  const CHAIN_REGEX = /\b(smartfit|smart\s?fit|bodytech|bluefit|formula|f[oó]rmula|bio\s?ritmo|franquia|grupo|rede\s|holding)\b/i;
  const igDays = typeof lead.instagram_last_post_days === "number" ? lead.instagram_last_post_days : null;
  const isChain = !!lead.nome_empresa && CHAIN_REGEX.test(lead.nome_empresa);

  type Row = { label: string; max: number; earned: number; applied: boolean };
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: "Acesso ao decisor",
      rows: [
        { label: "Telefone celular", max: 5, earned: lead.phone_type === "celular" ? 5 : 0, applied: lead.phone_type === "celular" },
        { label: "Decisor identificado", max: 2, earned: lead.nome_decisor ? 2 : 0, applied: !!lead.nome_decisor },
        { label: "Fixo sem decisor (penalidade)", max: -2, earned: lead.phone_type === "fixo" && !lead.nome_decisor ? -2 : 0, applied: lead.phone_type === "fixo" && !lead.nome_decisor },
      ],
    },
    {
      title: "Presença digital",
      rows: [
        { label: "Instagram ativo (≤7d)", max: 2, earned: igDays !== null && igDays <= 7 ? 2 : 0, applied: igDays !== null && igDays <= 7 },
        { label: "Instagram ativo (8–30d)", max: 1, earned: igDays !== null && igDays > 7 && igDays <= 30 ? 1 : 0, applied: igDays !== null && igDays > 7 && igDays <= 30 },
        { label: "Tem site", max: 2, earned: lead.site ? 2 : 0, applied: !!lead.site },
        { label: "Perfil Google completo", max: 1, earned: lead.google_profile_complete === true ? 1 : 0, applied: lead.google_profile_complete === true },
        { label: "10+ avaliações Google", max: 1, earned: typeof lead.google_review_count === "number" && lead.google_review_count >= 10 ? 1 : 0, applied: typeof lead.google_review_count === "number" && lead.google_review_count >= 10 },
      ],
    },
    {
      title: "Engajamento",
      rows: [
        { label: "Dono responde reviews", max: 2, earned: lead.google_owner_replied_recently === true ? 2 : 0, applied: lead.google_owner_replied_recently === true },
        { label: "Nota Google ≥ 4.5", max: 1, earned: typeof lead.google_rating === "number" && lead.google_rating >= 4.5 ? 1 : 0, applied: typeof lead.google_rating === "number" && lead.google_rating >= 4.5 },
        { label: "Perfil pessoal no Instagram", max: 1, earned: lead.instagram_profile_is_person === true ? 1 : 0, applied: lead.instagram_profile_is_person === true },
      ],
    },
    {
      title: "Perfil do negócio",
      rows: [
        { label: "CNPJ encontrado", max: 2, earned: lead.cnpj ? 2 : 0, applied: !!lead.cnpj },
        { label: "Endereço completo", max: 1, earned: lead.endereco ? 1 : 0, applied: !!lead.endereco },
        { label: "Rede/franquia (penalidade)", max: -2, earned: isChain ? -2 : 0, applied: isChain },
        { label: "Sem CNPJ (penalidade)", max: -1, earned: !lead.cnpj ? -1 : 0, applied: !lead.cnpj },
      ],
    },
  ];

  const cell = (
    <div className="flex flex-col gap-1 min-w-[110px] cursor-help">
      {c && (
        <Badge variant="outline" className={`${c.className} text-xs font-semibold w-fit`}>
          {c.label}
        </Badge>
      )}
      {score != null && (
        <span className="text-base font-bold tabular-nums">
          {score.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">/ 10</span>
        </span>
      )}
      {c && <span className="text-[10px] text-muted-foreground leading-tight">{c.cta}</span>}
    </div>
  );

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <span className="inline-flex">{cell}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-96 p-4 max-h-[80vh] overflow-y-auto" side="right">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">
            {c?.label ?? "Sem tier"} — {score != null ? `${score.toFixed(1)}/10` : "—"}
          </p>
        </div>
        {c && (
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            <strong>Ação recomendada:</strong> {c.cta}.{" "}
            {tier === "A" && "Lead com alta probabilidade de conversão — priorize ligação imediata."}
            {tier === "B" && "Bom potencial, mas vale começar por WhatsApp para qualificar."}
            {tier === "C" && "Faltam dados — enriqueça antes de abordar para evitar desperdício."}
          </p>
        )}
        <div className="space-y-3">
          <p className="text-xs font-medium">Composição da nota (todos os critérios)</p>
          {groups.map((g, gi) => (
            <div key={gi} className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
              {g.rows.map((r, i) => {
                const isPenalty = r.max < 0;
                const icon = r.applied ? (isPenalty ? "⚠️" : "✅") : "⚪";
                const ptsColor = !r.applied
                  ? "text-muted-foreground/60"
                  : isPenalty
                  ? "text-red-400"
                  : "text-green-400";
                const labelColor = r.applied ? "" : "text-muted-foreground/60 line-through";
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className={labelColor}>{icon} {r.label}</span>
                    <span className={`font-mono font-semibold ${ptsColor}`}>
                      {r.applied
                        ? (r.earned > 0 ? `+${r.earned}` : `${r.earned}`)
                        : `0 / ${r.max > 0 ? `+${r.max}` : r.max}`}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border">
          Soma bruta clampada em 0–20 e dividida por 2. Tier A ≥ 8 · B ≥ 5 · C &lt; 5.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
};


const SignalIcons = ({ lead }: { lead: any }) => {
  const igDays = lead.instagram_last_post_days as number | null;
  const rating = lead.google_rating as number | null;
  const reviews = lead.google_review_count as number | null;
  const isPerson = lead.instagram_profile_is_person as boolean | null;
  const ownerReplies = lead.google_owner_replied_recently as boolean | null;
  return (
    <div className="flex flex-col gap-0.5 text-[11px]">
      {igDays != null && (
        <span className={igDays <= 7 ? "text-pink-400" : igDays <= 30 ? "text-pink-300/70" : "text-muted-foreground"} title="Último post Instagram">
          📸 {igDays === 0 ? "hoje" : igDays > 30 ? "+30 dias" : `${igDays} dias`}
        </span>
      )}
      {rating != null && (
        <span className="text-yellow-400" title="Avaliação Google">
          ⭐ {rating.toFixed(1)}{reviews != null ? ` (${reviews})` : ""}
        </span>
      )}
      {isPerson === true && <span className="text-blue-400" title="Perfil pessoal no IG">👤 Perfil pessoal</span>}
      {ownerReplies === true && <span className="text-green-400" title="Dono responde reviews">💬 Dono responde</span>}
    </div>
  );
};

type KommoStatus = "success" | "error" | "duplicate";

const Leads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [selectedTermo, setSelectedTermo] = useState("all");
  const [selectedCidade, setSelectedCidade] = useState("all");
  const [selectedFonte, setSelectedFonte] = useState("all");
  const [hasPhone, setHasPhone] = useState(false);
  const [noPhone, setNoPhone] = useState(false);
  const [hasSite, setHasSite] = useState(false);
  const [hasInstagram, setHasInstagram] = useState(false);
  const [hasDecisor, setHasDecisor] = useState(false);
  const [noDecisor, setNoDecisor] = useState(false);
  const [kommoImported, setKommoImported] = useState(false);
  const [kommoNotImported, setKommoNotImported] = useState(false);
  const [hasMessage, setHasMessage] = useState(false);
  const [noMessage, setNoMessage] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("quente");
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState("");
  const [reAnalyzing, setReAnalyzing] = useState<Set<string>>(new Set());
  const [bulkScoring, setBulkScoring] = useState(false);
  const [bulkScoreProgress, setBulkScoreProgress] = useState({ current: 0, total: 0 });
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [bulkGenMsg, setBulkGenMsg] = useState(false);
  const [bulkGenProgress, setBulkGenProgress] = useState({ current: 0, total: 0 });
  const [regenerateMessages, setRegenerateMessages] = useState(false);
  const { toast } = useToast();

  // Kommo export state
  const [kommoStatuses, setKommoStatuses] = useState<Record<string, { status: KommoStatus; error?: string }>>(() => {
    try {
      const saved = localStorage.getItem("kommo_statuses");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [exportResult, setExportResult] = useState<{ success: number; duplicates: number; errors: Array<{ name: string; error: string }> }>({ success: 0, duplicates: 0, errors: [] });
  const [kommoSubdomain, setKommoSubdomain] = useState("");

  useEffect(() => {
    fetchLeads();
    fetchKommoSubdomain();
  }, []);

  useEffect(() => {
    localStorage.setItem("kommo_statuses", JSON.stringify(kommoStatuses));
  }, [kommoStatuses]);

  const fetchLeads = async () => {
    // Paginate: Supabase caps a single request at 1000 rows
    const PAGE = 1000;
    let all: Lead[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      all = all.concat(data as Lead[]);
      if (data.length < PAGE) break;
    }
    setLeads(all);
  };




  const fetchKommoSubdomain = async () => {
    const { data } = await supabase.from("settings").select("value").eq("key", "kommo_subdomain").maybeSingle();
    if (data?.value) setKommoSubdomain(data.value);
  };

  const termos = useMemo(() => {
    const set = new Set(leads.map((l) => l.termo_pesquisa).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [leads]);

  const cidades = useMemo(() => {
    const set = new Set(leads.map((l) => l.cidade).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [leads]);

  const fontes = useMemo(() => {
    const set = new Set(leads.map((l) => l.fonte).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    let result = leads;
    if (qualityFilter === "sem_avaliacao") {
      result = result.filter((l) => !l.lead_quality && l.score == null);
    } else if (qualityFilter !== "all") {
      if (qualityFilter === "desqualificado") {
        result = result.filter((l) => l.lead_quality === "desqualificado");
      } else {
        result = result.filter((l) => l.lead_quality !== "desqualificado");
        result = result.filter((l) => l.lead_quality === qualityFilter);
      }
    } else {
      result = result.filter((l) => l.lead_quality !== "desqualificado");
    }
    if (filter) {
      const f = filter.toLowerCase();
      result = result.filter(
        (l) =>
          l.nome_empresa.toLowerCase().includes(f) ||
          l.endereco?.toLowerCase().includes(f)
      );
    }
    if (selectedTermo !== "all") result = result.filter((l) => l.termo_pesquisa === selectedTermo);
    if (selectedCidade !== "all") result = result.filter((l) => l.cidade === selectedCidade);
    if (selectedFonte !== "all") result = result.filter((l) => l.fonte === selectedFonte);
    if (hasPhone) result = result.filter((l) => l.telefone);
    if (noPhone) result = result.filter((l) => !l.telefone || !String(l.telefone).trim());
    if (hasSite) result = result.filter((l) => l.site);
    if (hasInstagram) result = result.filter((l) => l.instagram);
    if (hasDecisor) result = result.filter((l) => l.nome_decisor);
    if (noDecisor) result = result.filter((l) => !l.nome_decisor || !String(l.nome_decisor).trim());
    if (kommoImported) result = result.filter((l) => kommoStatuses[l.id]?.status === "success");
    if (kommoNotImported) result = result.filter((l) => kommoStatuses[l.id]?.status !== "success");
    if (hasMessage) result = result.filter((l) => !!(l as any).mensagem_personalizada);
    if (noMessage) result = result.filter((l) => !(l as any).mensagem_personalizada);
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter((l) => new Date(l.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((l) => new Date(l.created_at) <= to);
    }
    result = [...result].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return result;
  }, [leads, filter, selectedTermo, selectedCidade, selectedFonte, hasPhone, noPhone, hasSite, hasInstagram, hasDecisor, noDecisor, kommoImported, kommoNotImported, hasMessage, noMessage, kommoStatuses, qualityFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const paginated = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize]
  );

  useEffect(() => { setCurrentPage(1); }, [filter, selectedTermo, selectedCidade, selectedFonte, hasPhone, noPhone, hasSite, hasInstagram, hasDecisor, noDecisor, kommoImported, kommoNotImported, qualityFilter, dateFrom, dateTo, pageSize]);

  const selectedLeads = useMemo(
    () => leads.filter((l) => selected.has(l.id)),
    [leads, selected]
  );

  const recordDeletedLeads = async (items: Lead[]) => {
    const rows = Array.from(new Map(items
      .map((lead) => ({
        telefone: normalizePhone(lead.telefone),
        nome_empresa: lead.nome_empresa,
        cnpj: lead.cnpj?.replace(/\D/g, "") || null,
      }))
      .filter((row) => row.telefone || row.cnpj)
      .map((row) => [`${row.telefone || ""}|${row.cnpj || ""}`, row])).values());

    if (rows.length > 0) {
      const phones = rows.map((row) => row.telefone).filter(Boolean) as string[];
      const cnpjs = rows.map((row) => row.cnpj).filter(Boolean) as string[];
      const [{ data: existingPhones }, { data: existingCnpjs }] = await Promise.all([
        phones.length > 0 ? supabase.from("deleted_leads").select("telefone").in("telefone", phones) : Promise.resolve({ data: [] as any[] }),
        cnpjs.length > 0 ? supabase.from("deleted_leads").select("cnpj").in("cnpj", cnpjs) : Promise.resolve({ data: [] as any[] }),
      ]);
      const blockedPhones = new Set((existingPhones || []).map((row: any) => row.telefone));
      const blockedCnpjs = new Set((existingCnpjs || []).map((row: any) => row.cnpj));
      const toInsert = rows.filter((row) => {
        if ((row.telefone && blockedPhones.has(row.telefone)) || (row.cnpj && blockedCnpjs.has(row.cnpj))) return false;
        if (row.telefone) blockedPhones.add(row.telefone);
        if (row.cnpj) blockedCnpjs.add(row.cnpj);
        return true;
      });
      if (toInsert.length > 0) {
        const { error } = await supabase.from("deleted_leads").insert(toInsert);
        if (error) console.error("Failed to record deleted leads:", error);
      }
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const pageIds = paginated.map((l) => l.id);
    const allSelectedOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const removeExportedLeads = async () => {
    const exportedIds = Array.from(selected).filter(id => kommoStatuses[id]?.status === "success");
    if (exportedIds.length === 0) {
      toast({ title: "Nenhum lead enviado selecionado", variant: "destructive" });
      return;
    }
    const leadsToDelete = leads.filter((l) => exportedIds.includes(l.id));
    await recordDeletedLeads(leadsToDelete);
    const { error } = await supabase.from("leads").delete().in("id", exportedIds);
    if (error) {
      toast({ title: "Erro ao excluir leads", description: error.message, variant: "destructive" });
      return;
    }
    setLeads((prev) => prev.filter((l) => !exportedIds.includes(l.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      exportedIds.forEach(id => next.delete(id));
      return next;
    });
    const newStatuses = { ...kommoStatuses };
    exportedIds.forEach(id => delete newStatuses[id]);
    setKommoStatuses(newStatuses);
    toast({ title: `${exportedIds.length} leads enviados removidos da lista` });
  };

  const openWhatsApp = async (lead: Lead) => {
    if (!lead.telefone) {
      toast({ title: "Sem telefone disponível", variant: "destructive" });
      return;
    }
    if (!(lead.mensagem_personalizada || "").trim()) {
      toast({
        title: "Mensagem não gerada",
        description: "Gere a mensagem personalizada por IA antes de enviar.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Enviando WhatsApp..." });
    const { data, error } = await supabase.functions.invoke("send-whatsapp-via-kommo", {
      body: { leads: [{ id: lead.id, telefone: lead.telefone, nome_empresa: lead.nome_empresa, mensagem_personalizada: lead.mensagem_personalizada }] },
    });
    if (error || (data as any)?.error) {
      toast({ title: "Falha ao enviar", description: error?.message || (data as any)?.error, variant: "destructive" });
      return;
    }
    const r = (data as any)?.results?.[0];
    if (r?.status === "success") {
      toast({ title: "Mensagem enviada no WhatsApp" });
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, mensagem_status: "enviada" } : l)));
    } else {
      toast({ title: "Não enviado", description: r?.error || "Erro desconhecido", variant: "destructive" });
    }
  };

  const exportCSV = () => {
    const toExport = selected.size > 0 ? selectedLeads : leads;
    const headers = ["Nome", "Score", "Qualidade", "Justificativa", "CNPJ", "Decisor", "Telefone", "Site", "Endereço", "Instagram", "LinkedIn", "Termo", "Cidade", "Fonte"];
    const rows = toExport.map((l) => [
      l.nome_empresa, String(l.score ?? ""), l.lead_quality || "", (l as any).justificativa || "",
      (l as any).cnpj || "", l.nome_decisor || "", l.telefone || "", l.site || "", l.endereco || "",
      l.instagram || "", l.linkedin || "", l.termo_pesquisa || "", l.cidade || "", l.fonte || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `${toExport.length} leads exportados!` });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    await recordDeletedLeads(selectedLeads);
    const { error } = await supabase.from("leads").delete().in("id", ids);
    if (error) {
      toast({ title: "Erro ao excluir leads", description: error.message, variant: "destructive" });
      return;
    }
    setLeads((prev) => prev.filter((l) => !selected.has(l.id)));
    setSelected(new Set());
    toast({ title: `${ids.length} leads removidos` });
  };

  const deleteDuplicates = async () => {
    const seen = new Map<string, string>();
    const duplicateIds: string[] = [];
    for (const lead of leads) {
      const key = lead.nome_empresa.trim().toLowerCase();
      if (seen.has(key)) {
        duplicateIds.push(lead.id);
      } else {
        seen.set(key, lead.id);
      }
    }
    if (duplicateIds.length === 0) {
      toast({ title: "Nenhuma duplicata encontrada" });
      return;
    }
    await recordDeletedLeads(leads.filter((l) => duplicateIds.includes(l.id)));
    for (let i = 0; i < duplicateIds.length; i += 100) {
      const batch = duplicateIds.slice(i, i + 100);
      const { error } = await supabase.from("leads").delete().in("id", batch);
      if (error) {
        toast({ title: "Erro ao excluir duplicatas", description: error.message, variant: "destructive" });
        return;
      }
    }
    setLeads((prev) => prev.filter((l) => !duplicateIds.includes(l.id)));
    toast({ title: `${duplicateIds.length} duplicatas removidas` });
  };

  const addTagToSelected = async (tag: string) => {
    if (!tag.trim() || selected.size === 0) return;
    const ids = Array.from(selected);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const batchLeads = leads.filter(l => batch.includes(l.id));
      for (const lead of batchLeads) {
        const currentTags = lead.tags || [];
        if (!currentTags.includes(tag.trim())) {
          await supabase.from("leads").update({ tags: [...currentTags, tag.trim()] }).eq("id", lead.id);
        }
      }
    }
    setLeads(prev => prev.map(l => {
      if (selected.has(l.id)) {
        const currentTags = l.tags || [];
        return currentTags.includes(tag.trim()) ? l : { ...l, tags: [...currentTags, tag.trim()] };
      }
      return l;
    }));
    setBulkTagInput("");
    setShowTagPopover(false);
    toast({ title: `Tag "${tag.trim()}" adicionada a ${ids.length} leads` });
  };

  const enrichLeads = useCallback(async () => {
    const toEnrich = selected.size > 0 ? selectedLeads : filtered;
    if (toEnrich.length === 0) return;

    setEnriching(true);
    let enriched = 0;
    let failed = 0;

    for (const lead of toEnrich) {
      setEnrichProgress(`${enriched + failed + 1}/${toEnrich.length} — ${lead.nome_empresa}`);
      try {
        const { data, error } = await supabase.functions.invoke("enrich-lead", {
          body: {
            nome_empresa: lead.nome_empresa,
            site: lead.site,
            instagram: lead.instagram,
            linkedin: lead.linkedin,
            telefone: lead.telefone,
            endereco: lead.endereco,
            nome_decisor: lead.nome_decisor,
            cidade: lead.cidade,
            cnpj: (lead as any).cnpj ?? null,
            // Envia valores prévios para servirem de fallback caso o scrape novo falhe.
            prev_instagram_last_post_days: (lead as any).instagram_last_post_days ?? null,
            prev_instagram_profile_is_person: (lead as any).instagram_profile_is_person ?? null,
            prev_google_rating: (lead as any).google_rating ?? null,
            prev_google_review_count: (lead as any).google_review_count ?? null,
            prev_google_owner_replied_recently: (lead as any).google_owner_replied_recently ?? null,
            prev_google_profile_complete: (lead as any).google_profile_complete ?? null,
          },
        });

        if (error) throw error;

        const updates = data?.updates || {};
        if (!updates.nome_decisor && data?.nome_decisor && data.nome_decisor !== "Não identificado") {
          updates.nome_decisor = data.nome_decisor;
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from("leads").update(updates).eq("id", lead.id);
          setLeads((prev) =>
            prev.map((l) => (l.id === lead.id ? { ...l, ...updates } : l))
          );
          enriched++;
        } else {
          failed++;
        }
      } catch (e) {
        console.error("Enrich error:", e);
        failed++;
      }

      await new Promise((r) => setTimeout(r, 1500));
    }

    setEnriching(false);
    setEnrichProgress("");
    toast({
      title: "Enriquecimento concluído",
      description: `${enriched} leads enriquecidos, ${failed} sem dados novos.`,
    });
  }, [selected, selectedLeads, filtered, toast]);

  const reAnalyzeLead = async (lead: Lead) => {
    const input = lead.score_breakdown as any;
    setReAnalyzing((prev) => new Set(prev).add(lead.id));

    try {
      const { data, error } = await supabase.functions.invoke("score-lead", {
        body: {
          nome_empresa: lead.nome_empresa,
          endereco: lead.endereco,
          bairro: input?.bairro || null,
          cidade: lead.cidade,
          estado: input?.estado || null,
          rating: input?.rating || null,
          total_reviews: input?.total_reviews || null,
          website: lead.site,
          price_level: input?.price_level || null,
          categoria: input?.categoria || null,
          reviews: input?.reviews || [],
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const updates: any = {
        score: data.score,
        lead_quality: data.classificacao,
        justificativa: data.justificativa,
        sinais_positivos: data.sinais_positivos,
        sinais_negativos: data.sinais_negativos,
      };
      if (data.website_encontrado && !lead.site) {
        updates.site = data.website_encontrado;
      }
      if (data.tag) {
        updates.tags = [data.tag];
      }

      await supabase.from("leads").update(updates).eq("id", lead.id);
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, ...updates } : l)));
      toast({ title: `Score atualizado: ${data.score} (${data.classificacao})` });
    } catch (e: any) {
      toast({ title: "Erro ao re-analisar", description: e.message, variant: "destructive" });
    } finally {
      setReAnalyzing((prev) => {
        const next = new Set(prev);
        next.delete(lead.id);
        return next;
      });
    }
  };

  const bulkScoreLeads = useCallback(async () => {
    const toScore = selected.size > 0
      ? leads.filter(l => selected.has(l.id))
      : filtered.filter(l => !l.score && !l.lead_quality);

    if (toScore.length === 0) {
      toast({ title: "Nenhum lead para analisar", description: selected.size > 0 ? "Leads selecionados já possuem score." : "Todos os leads exibidos já possuem score.", variant: "destructive" });
      return;
    }

    setBulkScoring(true);
    setBulkScoreProgress({ current: 0, total: toScore.length });

    const BATCH = 2;
    let scored = 0;

    for (let i = 0; i < toScore.length; i += BATCH) {
      const batch = toScore.slice(i, i + BATCH);

      const promises = batch.map(async (lead) => {
        try {
          const input = lead.score_breakdown as any;
          const { data: scoreData, error: scoreError } = await supabase.functions.invoke("score-lead", {
            body: {
              nome_empresa: lead.nome_empresa,
              endereco: lead.endereco,
              bairro: input?.bairro || null,
              cidade: lead.cidade,
              estado: input?.estado || null,
              rating: input?.rating || null,
              total_reviews: input?.total_reviews || null,
              website: lead.site,
              price_level: input?.price_level || null,
              categoria: input?.categoria || null,
              reviews: input?.reviews || [],
            },
          });

          if (!scoreError && scoreData && !scoreData.error) {
            const updates: any = {
              score: scoreData.score,
              lead_quality: scoreData.classificacao,
              justificativa: scoreData.justificativa,
              sinais_positivos: scoreData.sinais_positivos,
              sinais_negativos: scoreData.sinais_negativos,
            };
            if (scoreData.website_encontrado && !lead.site) {
              updates.site = scoreData.website_encontrado;
            }
            if (scoreData.tag) {
              updates.tags = [scoreData.tag];
            }
            await supabase.from("leads").update(updates).eq("id", lead.id);
            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...updates } : l));
          }
        } catch (e) {
          console.error("Bulk score error for", lead.nome_empresa, e);
        }
      });

      await Promise.all(promises);
      scored += batch.length;
      setBulkScoreProgress({ current: scored, total: toScore.length });

      if (i + BATCH < toScore.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    setBulkScoring(false);
    toast({ title: "Análise concluída!", description: `${scored} leads analisados pela IA.` });
  }, [selected, leads, filtered, toast]);

  const bulkGenerateMessages = useCallback(async () => {
    const base = selected.size > 0 ? leads.filter(l => selected.has(l.id)) : filtered;
    const toGen = regenerateMessages ? base : base.filter(l => !(l as any).mensagem_personalizada);

    if (toGen.length === 0) {
      toast({ title: "Nenhum lead para gerar", description: regenerateMessages ? "Nenhum lead selecionado." : "Todos os leads já têm mensagem. Marque 'Regenerar' para forçar.", variant: "destructive" });
      return;
    }

    setBulkGenMsg(true);
    setBulkGenProgress({ current: 0, total: toGen.length });

    let done = 0;
    let skipped = 0;
    let failed = 0;

    for (const lead of toGen) {
      try {
        const { data, error } = await supabase.functions.invoke("generate-personalized-message", {
          body: { lead_id: lead.id, regenerate: regenerateMessages },
        });
        if (error) throw error;
        if ((data as any)?.error === "sem_analise") {
          skipped++;
        } else if ((data as any)?.error) {
          throw new Error((data as any).message || (data as any).error);
        } else {
          const patch = {
            mensagem_personalizada: data.mensagem,
            mensagem_pontos_usados: data.pontos_usados,
            mensagem_status: "gerada",
            mensagem_gerada_em: new Date().toISOString(),
          };
          setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...patch } as any : l));
        }
      } catch (e) {
        console.error("bulk gen msg error", lead.nome_empresa, e);
        failed++;
      }
      done++;
      setBulkGenProgress({ current: done, total: toGen.length });
      await new Promise(r => setTimeout(r, 1200));
    }

    setBulkGenMsg(false);
    toast({
      title: "Geração concluída",
      description: `${done - failed - skipped} geradas · ${skipped} sem análise · ${failed} erros.`,
    });
  }, [selected, leads, filtered, regenerateMessages, toast]);

  const handleExportKommo = async () => {
    const { data: settings } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["kommo_subdomain", "kommo_api_token", "kommo_pipeline_id"]);

    const map: Record<string, string> = {};
    for (const s of settings || []) {
      if (s.value) map[s.key] = s.value;
    }

    if (!map["kommo_subdomain"] || !map["kommo_api_token"] || !map["kommo_pipeline_id"]) {
      setShowConfigModal(true);
      return;
    }

    setKommoSubdomain(map["kommo_subdomain"]);
    setShowConfirmModal(true);
  };

  const confirmExportKommo = async () => {
    setShowConfirmModal(false);
    setExporting(true);

    const leadsToExport = selectedLeads.filter(l => kommoStatuses[l.id]?.status !== "success");
    setExportProgress({ current: 0, total: leadsToExport.length });

    const batchSize = 50;
    let successCount = 0;
    let duplicateCount = 0;
    const errorsList: Array<{ name: string; error: string }> = [];
    const newStatuses = { ...kommoStatuses };

    for (let i = 0; i < leadsToExport.length; i += batchSize) {
      const batch = leadsToExport.slice(i, i + batchSize);
      setExportProgress({ current: i, total: leadsToExport.length });

      try {
        const { data, error } = await supabase.functions.invoke("export-kommo", {
          body: { leads: batch },
        });

        if (error) throw error;

        for (const result of data?.results || []) {
          newStatuses[result.id] = { status: result.status, error: result.error };
          if (result.status === "success") successCount++;
          else if (result.status === "duplicate") duplicateCount++;
          else {
            const lead = leadsToExport.find(l => l.id === result.id);
            errorsList.push({ name: lead?.nome_empresa || result.id, error: result.error || "Erro desconhecido" });
          }
        }
      } catch (err: any) {
        for (const lead of batch) {
          newStatuses[lead.id] = { status: "error", error: err.message };
          errorsList.push({ name: lead.nome_empresa, error: err.message || "Erro de rede" });
        }
      }
    }

    setKommoStatuses(newStatuses);
    setExportProgress({ current: leadsToExport.length, total: leadsToExport.length });
    setExportResult({ success: successCount, duplicates: duplicateCount, errors: errorsList });
    setExporting(false);
    setShowResultModal(true);
    setSelected(new Set());
  };

  const pageIds = paginated.map((l) => l.id);
  const allSelectedOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  return (
    <div className="space-y-6">
      <Tabs defaultValue="leads" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="leads">📋 Leads</TabsTrigger>
          <TabsTrigger value="b2bleads" className="flex items-center gap-1">
            <Database className="h-4 w-4" /> B2BLeads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="b2bleads">
          <B2BLeadsImport onImportComplete={fetchLeads} />
        </TabsContent>

        <TabsContent value="leads">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm">
            {leads.length} leads no total · {filtered.length} exibidos
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {selected.size > 0 && (
            <>
              <BulkWhatsApp leads={selectedLeads} />
              <CopyForSDR leads={selectedLeads} />
              <Button variant="destructive" size="sm" onClick={deleteSelected}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir ({selected.size})
              </Button>
              {Array.from(selected).some(id => kommoStatuses[id]?.status === "success") && (
                <Button variant="outline" size="sm" onClick={removeExportedLeads} className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                  <CheckCircle className="h-4 w-4 mr-1" /> Remover enviados ({Array.from(selected).filter(id => kommoStatuses[id]?.status === "success").length})
                </Button>
              )}
              <Popover open={showTagPopover} onOpenChange={setShowTagPopover}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="border-accent/50 text-accent hover:bg-accent/10">
                    <Tag className="h-4 w-4 mr-1" /> Adicionar tag ({selected.size})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="start">
                  <p className="text-xs text-muted-foreground mb-2">Adicionar tag aos {selected.size} leads selecionados</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome da tag..."
                      value={bulkTagInput}
                      onChange={(e) => setBulkTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTagToSelected(bulkTagInput)}
                      className="h-8 text-sm bg-secondary/50"
                    />
                    <Button size="sm" className="h-8" onClick={() => addTagToSelected(bulkTagInput)} disabled={!bulkTagInput.trim()}>
                      Aplicar
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={enrichLeads}
            disabled={enriching}
            className="border-accent/50 text-accent hover:bg-accent/10"
          >
            {enriching ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                {enrichProgress}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" />
                Enrich List {selected.size > 0 ? `(${selected.size})` : `(${filtered.length})`}
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={bulkScoreLeads}
            disabled={bulkScoring || enriching}
            className="bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30"
          >
            {bulkScoring ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Analisando {bulkScoreProgress.current}/{bulkScoreProgress.total}</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" />Executar Análise IA {selected.size > 0 ? `(${selected.size})` : ""}</>
            )}
          </Button>
          <div className="flex items-center gap-2 border border-accent/30 rounded-md px-2 py-1 bg-accent/5">
            <Button
              size="sm"
              variant="ghost"
              onClick={bulkGenerateMessages}
              disabled={bulkGenMsg || bulkScoring || enriching}
              className="text-accent hover:bg-accent/10 h-7 px-2"
            >
              {bulkGenMsg ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Gerando {bulkGenProgress.current}/{bulkGenProgress.total}</>
              ) : (
                <><MessageSquare className="h-4 w-4 mr-1" />Gerar mensagens {selected.size > 0 ? `(${selected.size})` : `(${filtered.length})`}</>
              )}
            </Button>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
              <Checkbox checked={regenerateMessages} onCheckedChange={(v) => setRegenerateMessages(!!v)} className="h-3 w-3" />
              Regenerar
            </label>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={deleteDuplicates}
            className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
          >
            <Copy className="h-4 w-4 mr-1" /> Excluir duplicatas
          </Button>
        </div>
      </div>

      <LeadFilters
        filter={filter}
        onFilterChange={setFilter}
        termos={termos}
        selectedTermo={selectedTermo}
        onTermoChange={setSelectedTermo}
        cidades={cidades}
        selectedCidade={selectedCidade}
        onCidadeChange={setSelectedCidade}
        fontes={fontes}
        selectedFonte={selectedFonte}
        onFonteChange={setSelectedFonte}
        hasPhone={hasPhone}
        onHasPhoneChange={setHasPhone}
        noPhone={noPhone}
        onNoPhoneChange={setNoPhone}
        hasSite={hasSite}
        onHasSiteChange={setHasSite}
        hasInstagram={hasInstagram}
        onHasInstagramChange={setHasInstagram}
        hasDecisor={hasDecisor}
        onHasDecisorChange={setHasDecisor}
        noDecisor={noDecisor}
        onNoDecisorChange={setNoDecisor}
        kommoImported={kommoImported}
        onKommoImportedChange={setKommoImported}
        kommoNotImported={kommoNotImported}
        onKommoNotImportedChange={setKommoNotImported}
        hasMessage={hasMessage}
        onHasMessageChange={setHasMessage}
        noMessage={noMessage}
        onNoMessageChange={setNoMessage}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
      />
      <div className="flex gap-2 flex-wrap">
        {([
          { value: "quente" as QualityFilter, label: "🔥 Quente", cls: "bg-green-500/10 text-green-400 border-green-500/30" },
          { value: "morno" as QualityFilter, label: "🟡 Morno", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
          { value: "frio" as QualityFilter, label: "🔵 Frio", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
          { value: "all" as QualityFilter, label: "Todos", cls: "bg-secondary text-foreground border-border" },
          { value: "desqualificado" as QualityFilter, label: "Desqualificados", cls: "bg-muted/50 text-muted-foreground border-border" },
          { value: "sem_avaliacao" as QualityFilter, label: "⬜ Sem avaliação", cls: "bg-secondary/50 text-muted-foreground border-border" },
        ]).map((tab) => {
          const count = leads.filter((l) => {
            if (tab.value === "all") return l.lead_quality !== "desqualificado";
            if (tab.value === "sem_avaliacao") return !l.lead_quality && l.score == null;
            return l.lead_quality === tab.value;
          }).length;
          return (
            <Button
              key={tab.value}
              variant="outline"
              size="sm"
              onClick={() => setQualityFilter(tab.value)}
              className={`${qualityFilter === tab.value ? tab.cls + " ring-1 ring-accent" : "bg-secondary/30 text-muted-foreground border-border/50"}`}
            >
              {tab.label} ({count})
            </Button>
          );
        })}
      </div>

      {bulkScoring && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Analisando qualidade via IA... {bulkScoreProgress.current}/{bulkScoreProgress.total}</p>
          <Progress value={(bulkScoreProgress.current / bulkScoreProgress.total) * 100} className="h-2" />
        </div>
      )}

      <Card className="border-border/50 bg-card/80">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelectedOnPage}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Comercial</TableHead>
                <TableHead>Sinais</TableHead>
                <TableHead>Score IA</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Decisor</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Redes</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={17} className="text-center text-muted-foreground py-12">
                    Nenhum lead encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((lead) => {
                  const ks = kommoStatuses[lead.id];
                  const isExported = ks?.status === "success";
                  const isScoring = reAnalyzing.has(lead.id);
                  return (
                    <TableRow key={lead.id} className={`border-border/30 hover:bg-secondary/30 ${isExported ? "opacity-50 bg-green-500/5" : ""}`}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(lead.id)}
                          onCheckedChange={() => toggleSelect(lead.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{lead.nome_empresa}</TableCell>
                      <TableCell><CommercialCell lead={lead} /></TableCell>
                      <TableCell><SignalIcons lead={lead} /></TableCell>
                      <TableCell>
                        <QualityBadgeWithHover lead={lead} isScoring={isScoring} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{(lead as any).cnpj || "—"}</TableCell>
                      <TableCell className="text-sm">{lead.nome_decisor || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{lead.telefone || "—"}</TableCell>
                      <TableCell>
                        {lead.site ? (
                          <a href={lead.site} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            <span className="truncate max-w-[120px]">{lead.site.replace(/https?:\/\//, "")}</span>
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{lead.endereco || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {lead.instagram && (
                            <a href={lead.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300">
                              <Instagram className="h-4 w-4" />
                            </a>
                          )}
                          {lead.linkedin && (
                            <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lead.cidade || "—"}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          lead.fonte === "linkedin" ? "bg-blue-500/10 text-blue-400" :
                          lead.fonte === "b2bleads" ? "bg-purple-500/10 text-purple-400" :
                          "bg-primary/10 text-primary"
                        }`}>
                          {lead.fonte === "linkedin" ? "LinkedIn" : lead.fonte === "google" ? "Google" : lead.fonte === "b2bleads" ? "B2BLeads" : lead.fonte || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {ks?.status === "success" && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Kommo
                          </Badge>
                        )}
                        {ks?.status === "error" && (
                          <Badge
                            variant="outline"
                            className="bg-destructive/10 text-destructive border-destructive/30 text-xs cursor-help"
                            title={ks.error || "Erro ao exportar"}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Erro
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <MessageCell
                          lead={lead}
                          onUpdate={(patch) => setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, ...patch } as any : l))}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openWhatsApp(lead)}
                            className="text-green-400 hover:text-green-300 hover:bg-green-400/10 h-8 w-8"
                            title="Enviar WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => reAnalyzeLead(lead)}
                            disabled={isScoring}
                            className="text-accent hover:text-accent/80 hover:bg-accent/10 h-8 w-8"
                            title="Re-analisar via IA"
                          >
                            {isScoring ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Leads por página:</span>
          {[15, 30, 50, 100].map((n) => (
            <Button
              key={n}
              variant={pageSize === n ? "default" : "outline"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setPageSize(n)}
            >
              {n}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {filtered.length === 0
              ? "0 resultados"
              : `${pageStart + 1}–${Math.min(pageStart + pageSize, filtered.length)} de ${filtered.length}`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage(1)}
            >
              «
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </Button>
            <span className="px-2 text-xs tabular-nums">
              Página {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              »
            </Button>
          </div>
        </div>
      </div>


      {/* Floating toolbar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selected.size} leads selecionados</span>
          <Button
            size="sm"
            onClick={handleExportKommo}
            disabled={exporting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Enviando {exportProgress.current}/{exportProgress.total}...
              </>
            ) : (
              <>
                <Building2 className="h-4 w-4 mr-1" />
                Exportar para Kommo
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
        </div>
      )}

      {/* Exporting progress bar */}
      {exporting && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-card border border-border rounded-xl shadow-2xl px-6 py-3 w-80 z-50">
          <p className="text-sm mb-2 text-muted-foreground">Enviando {exportProgress.current} de {exportProgress.total}...</p>
          <Progress value={exportProgress.total > 0 ? (exportProgress.current / exportProgress.total) * 100 : 0} />
        </div>
      )}

      {/* Config missing modal */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Configuração necessária
            </DialogTitle>
            <DialogDescription>
              Para exportar leads para a Kommo, configure o Subdomínio, API Token e Pipeline ID em Configurações.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigModal(false)}>Fechar</Button>
            <Button onClick={() => { setShowConfigModal(false); window.location.href = "/settings"; }}>
              Ir para Configurações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm export modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Exportar para Kommo
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Você está prestes a exportar <strong>{selectedLeads.filter(l => kommoStatuses[l.id]?.status !== "success").length}</strong> leads para a Kommo.</p>
              <p className="text-xs text-muted-foreground">Leads duplicados serão automaticamente ignorados pela Kommo.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>Cancelar</Button>
            <Button onClick={confirmExportKommo} className="bg-blue-600 hover:bg-blue-700 text-white">
              Confirmar exportação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result modal */}
      <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resultado da exportação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {exportResult.success > 0 && (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="h-5 w-5" />
                <span>{exportResult.success} leads exportados com sucesso</span>
              </div>
            )}
            {exportResult.duplicates > 0 && (
              <div className="flex items-center gap-2 text-yellow-400">
                <AlertTriangle className="h-5 w-5" />
                <span>{exportResult.duplicates} leads já existiam (duplicatas)</span>
              </div>
            )}
            {exportResult.errors.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-5 w-5" />
                  <span>{exportResult.errors.length} leads com erro</span>
                </div>
                <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground pl-7 space-y-1">
                  {exportResult.errors.map((e, i) => (
                    <p key={i}>• {e.name}: {e.error}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultModal(false)}>Fechar</Button>
            {kommoSubdomain && (
              <Button
                onClick={() => window.open(`https://${kommoSubdomain}.kommo.com`, "_blank")}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Ver no Kommo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Leads;
