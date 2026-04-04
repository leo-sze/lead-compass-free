import { useState, useEffect, useMemo, useCallback } from "react";
import { Download, MessageCircle, Trash2, ExternalLink, Instagram, UserSearch, Loader2, Sparkles, Building2, X, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
};

type QualityFilter = "all" | "quente" | "morno" | "frio" | "desqualificado";

const qualityBadge = (quality: string | null | undefined, score: number | null | undefined) => {
  if (!quality) return null;
  const config: Record<string, { label: string; className: string }> = {
    quente: { label: "Quente", className: "bg-green-500/10 text-green-400 border-green-500/30" },
    morno: { label: "Morno", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
    frio: { label: "Frio", className: "bg-red-500/10 text-red-400 border-red-500/30" },
    desqualificado: { label: "Desqualificado", className: "bg-muted/50 text-muted-foreground border-border" },
  };
  const c = config[quality];
  if (!c) return null;
  return (
    <Badge variant="outline" className={`${c.className} text-xs`}>
      {c.label} {score != null ? `(${score})` : ""}
    </Badge>
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
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("quente");
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    "Olá {nome_empresa}, tudo bem? Gostaria de apresentar nossos serviços."
  );
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState("");
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
        // Hide desqualificado by default unless explicitly selected
        result = result.filter((l) => l.lead_quality !== "desqualificado");
        result = result.filter((l) => l.lead_quality === qualityFilter);
      }
    } else {
      // "all" hides desqualificado by default
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
    if (selectedTermo !== "all") {
      result = result.filter((l) => l.termo_pesquisa === selectedTermo);
    }
    if (selectedCidade !== "all") {
      result = result.filter((l) => l.cidade === selectedCidade);
    }
    if (selectedFonte !== "all") {
      result = result.filter((l) => l.fonte === selectedFonte);
    }
    if (hasPhone) result = result.filter((l) => l.telefone);
    if (hasSite) result = result.filter((l) => l.site);
    if (hasInstagram) result = result.filter((l) => l.instagram);
    // Sort by score descending
    result = [...result].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return result;
  }, [leads, filter, selectedTermo, selectedCidade, selectedFonte, hasPhone, hasSite, hasInstagram, qualityFilter]);

  const selectedLeads = useMemo(
    () => leads.filter((l) => selected.has(l.id)),
    [leads, selected]
  );

  const toggleSelect = (id: string) => {
    // Don't allow selecting leads already exported to Kommo
    if (kommoStatuses[id]?.status === "success") return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.filter(l => kommoStatuses[l.id]?.status !== "success").length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.filter(l => kommoStatuses[l.id]?.status !== "success").map((l) => l.id)));
    }
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
    const headers = ["Nome", "Score", "Qualidade", "CNPJ", "Decisor", "Telefone", "Site", "Endereço", "Instagram", "LinkedIn", "Termo", "Cidade", "Fonte"];
    const rows = toExport.map((l) => [
      l.nome_empresa, String(l.score ?? ""), l.lead_quality || "", (l as any).cnpj || "", l.nome_decisor || "", l.telefone || "", l.site || "", l.endereco || "",
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

  const handleExportKommo = async () => {
    // Check if Kommo is configured
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

  const selectableCount = filtered.filter(l => kommoStatuses[l.id]?.status !== "success").length;

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
                <TableHead className="w-20">Ações</TableHead>
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
                  return (
                    <TableRow key={lead.id} className={`border-border/30 hover:bg-secondary/30 ${isExported ? "opacity-70" : ""}`}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(lead.id)}
                          onCheckedChange={() => toggleSelect(lead.id)}
                          disabled={isExported}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{lead.nome_empresa}</TableCell>
                      <TableCell>{qualityBadge(lead.lead_quality, lead.score)}</TableCell>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openWhatsApp(lead)}
                          className="text-green-400 hover:text-green-300 hover:bg-green-400/10"
                          title="Abrir WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
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
