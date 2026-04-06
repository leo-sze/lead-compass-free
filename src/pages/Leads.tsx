import { useState, useEffect, useMemo, useCallback } from "react";
import { Download, MessageCircle, Trash2, ExternalLink, Instagram, UserSearch, Loader2, Sparkles, Building2, X, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
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
import type { Tables } from "@/integrations/supabase/types";
import LeadFilters from "@/components/leads/LeadFilters";
import BulkWhatsApp from "@/components/leads/BulkWhatsApp";

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

type QualityFilter = "all" | "quente" | "morno" | "frio" | "desqualificado";

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

type KommoStatus = "success" | "error" | "duplicate";

const Leads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [selectedTermo, setSelectedTermo] = useState("all");
  const [selectedCidade, setSelectedCidade] = useState("all");
  const [selectedFonte, setSelectedFonte] = useState("all");
  const [hasPhone, setHasPhone] = useState(false);
  const [hasSite, setHasSite] = useState(false);
  const [hasInstagram, setHasInstagram] = useState(false);
  const [hasDecisor, setHasDecisor] = useState(false);
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("quente");
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    "Olá {nome_empresa}, tudo bem? Gostaria de apresentar nossos serviços."
  );
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState("");
  const [reAnalyzing, setReAnalyzing] = useState<Set<string>>(new Set());
  const [bulkScoring, setBulkScoring] = useState(false);
  const [bulkScoreProgress, setBulkScoreProgress] = useState({ current: 0, total: 0 });
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
    fetchTemplate();
    fetchKommoSubdomain();
  }, []);

  useEffect(() => {
    localStorage.setItem("kommo_statuses", JSON.stringify(kommoStatuses));
  }, [kommoStatuses]);

  const fetchLeads = async () => {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (data) setLeads(data as Lead[]);
  };

  const fetchTemplate = async () => {
    const { data } = await supabase.from("settings").select("value").eq("key", "whatsapp_template").maybeSingle();
    if (data?.value) setWhatsappTemplate(data.value);
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
    if (qualityFilter !== "all") {
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
    if (hasSite) result = result.filter((l) => l.site);
    if (hasInstagram) result = result.filter((l) => l.instagram);
    if (hasDecisor) result = result.filter((l) => l.nome_decisor);
    result = [...result].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return result;
  }, [leads, filter, selectedTermo, selectedCidade, selectedFonte, hasPhone, hasSite, hasInstagram, qualityFilter]);

  const selectedLeads = useMemo(
    () => leads.filter((l) => selected.has(l.id)),
    [leads, selected]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((l) => l.id)));
    }
  };

  const removeExportedLeads = async () => {
    const exportedIds = Array.from(selected).filter(id => kommoStatuses[id]?.status === "success");
    if (exportedIds.length === 0) {
      toast({ title: "Nenhum lead enviado selecionado", variant: "destructive" });
      return;
    }
    await supabase.from("leads").delete().in("id", exportedIds);
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

  const openWhatsApp = (lead: Lead) => {
    if (!lead.telefone) {
      toast({ title: "Sem telefone disponível", variant: "destructive" });
      return;
    }
    const phone = lead.telefone.replace(/\D/g, "");
    const msg = whatsappTemplate
      .replace(/{nome_empresa}/g, lead.nome_empresa)
      .replace(/{telefone}/g, lead.telefone || "")
      .replace(/{endereco}/g, lead.endereco || "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
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
    await supabase.from("leads").delete().in("id", ids);
    setLeads((prev) => prev.filter((l) => !selected.has(l.id)));
    setSelected(new Set());
    toast({ title: `${ids.length} leads removidos` });
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

  const selectableCount = filtered.length;

  return (
    <div className="space-y-6">
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
              <BulkWhatsApp leads={selectedLeads} template={whatsappTemplate} />
              <Button variant="destructive" size="sm" onClick={deleteSelected}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir ({selected.size})
              </Button>
              {Array.from(selected).some(id => kommoStatuses[id]?.status === "success") && (
                <Button variant="outline" size="sm" onClick={removeExportedLeads} className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                  <CheckCircle className="h-4 w-4 mr-1" /> Remover enviados ({Array.from(selected).filter(id => kommoStatuses[id]?.status === "success").length})
                </Button>
              )}
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
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
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
        hasSite={hasSite}
        onHasSiteChange={setHasSite}
        hasInstagram={hasInstagram}
        onHasInstagramChange={setHasInstagram}
        hasDecisor={hasDecisor}
        onHasDecisorChange={setHasDecisor}
      />

      {/* Quality filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          { value: "quente" as QualityFilter, label: "🔥 Quente", cls: "bg-green-500/10 text-green-400 border-green-500/30" },
          { value: "morno" as QualityFilter, label: "🟡 Morno", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
          { value: "frio" as QualityFilter, label: "🔵 Frio", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
          { value: "all" as QualityFilter, label: "Todos", cls: "bg-secondary text-foreground border-border" },
          { value: "desqualificado" as QualityFilter, label: "Desqualificados", cls: "bg-muted/50 text-muted-foreground border-border" },
        ]).map((tab) => {
          const count = leads.filter((l) => {
            if (tab.value === "all") return l.lead_quality !== "desqualificado";
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
                    checked={selectableCount > 0 && selected.size === selectableCount}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Decisor</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Redes</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground py-12">
                    Nenhum lead encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead) => {
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
                        <span className={`text-xs px-2 py-0.5 rounded-full ${lead.fonte === "linkedin" ? "bg-blue-500/10 text-blue-400" : "bg-primary/10 text-primary"}`}>
                          {lead.fonte === "linkedin" ? "LinkedIn" : lead.fonte === "google" ? "Google" : lead.fonte || "—"}
                        </span>
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
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openWhatsApp(lead)}
                            className="text-green-400 hover:text-green-300 hover:bg-green-400/10 h-8 w-8"
                            title="Abrir WhatsApp"
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
    </div>
  );
};

export default Leads;
