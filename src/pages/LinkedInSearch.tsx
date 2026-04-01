import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, MapPin, Briefcase, Loader2, Linkedin, Tag, Factory, Download, MessageCircle, Trash2, ExternalLink, Instagram, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import LinkedInFilterSidebar from "@/components/linkedin/LinkedInFilterSidebar";
import { useLeadSearch, emptyFilters, type LeadFilters } from "@/hooks/useLeadSearch";

type Lead = Tables<"leads"> & {
  termo_pesquisa?: string | null;
  cidade?: string | null;
  fonte?: string | null;
};

const LinkedInSearch = () => {
  // Search form state
  const [jobTitle, setJobTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");

  // Leads state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filters, setFilters] = useState<LeadFilters>(emptyFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { toast } = useToast();

  // Load LinkedIn leads
  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("fonte", "linkedin")
      .order("created_at", { ascending: false });
    if (data) setLeads(data as Lead[]);
  };

  // Filter hook
  const { results, totalCount, activeFilters, filterCounts } = useLeadSearch(leads, filters);

  // Job title suggestions from existing data
  const jobTitleSuggestions = useMemo(() => {
    const titles = new Set<string>();
    leads.forEach(l => {
      if (l.nome_decisor) {
        // Extract potential job title from decisor info
        const parts = l.query_origem?.split(" - ") || [];
        if (parts[0]) titles.add(parts[0].split(" / ")[0].trim());
      }
      if (l.termo_pesquisa) titles.add(l.termo_pesquisa);
    });
    return Array.from(titles).filter(t => t.length > 2).sort();
  }, [leads]);

  // Selection
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map(l => l.id)));
    }
  };

  // Search handler
  const handleSearch = async () => {
    if (!jobTitle.trim() || !location.trim()) {
      toast({ title: "Preencha cargo e localização", variant: "destructive" });
      return;
    }

    const { data: apiKeyData } = await supabase
      .from("settings").select("value").eq("key", "api_key").maybeSingle();
    const { data: providerData } = await supabase
      .from("settings").select("value").eq("key", "api_provider").maybeSingle();

    if (!apiKeyData?.value) {
      toast({ title: "API Key não configurada", description: "Vá em Configurações e adicione sua API Key.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setProgress(10);
    setStatusText("Iniciando busca no LinkedIn...");

    try {
      setProgress(30);
      setStatusText("Consultando LinkedIn...");

      const { data, error } = await supabase.functions.invoke("extract-leads", {
        body: {
          query: jobTitle.trim(),
          location: location.trim(),
          setor: industry.trim() || undefined,
          keywords: keywords.trim() || undefined,
          apiKey: apiKeyData.value,
          provider: providerData?.value || "serpapi",
          source: "linkedin",
        },
      });

      if (error) throw error;

      setProgress(80);
      setStatusText("Salvando leads...");

      const newLeads = data?.leads || [];
      let newCount = 0;
      let dupCount = 0;

      for (const lead of newLeads) {
        const { error: insertError } = await supabase.from("leads").upsert(
          {
            nome_empresa: lead.nome_empresa,
            telefone: lead.telefone || null,
            site: lead.site || null,
            endereco: lead.endereco || null,
            instagram: lead.instagram || null,
            linkedin: lead.linkedin || null,
            cnpj: lead.cnpj || null,
            nome_decisor: lead.nome_decisor || null,
            query_origem: `${jobTitle}${industry ? ` / ${industry}` : ""}${keywords ? ` [${keywords}]` : ""} - ${location}`,
            termo_pesquisa: jobTitle.trim(),
            cidade: lead.cidade || null,
            fonte: "linkedin",
          },
          { onConflict: "nome_empresa,telefone" }
        );
        if (insertError) dupCount++;
        else newCount++;
      }

      setProgress(100);
      setStatusText("Concluído!");
      toast({
        title: "Extração concluída!",
        description: `${newLeads.length} decisores encontrados. ${newCount} novos, ${dupCount} duplicados.`,
      });

      // Refresh leads list
      await fetchLeads();
    } catch (err: any) {
      toast({ title: "Erro na extração", description: err.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setTimeout(() => { setLoading(false); setProgress(0); setStatusText(""); }, 2000);
    }
  };

  // Export CSV
  const exportCSV = () => {
    const toExport = selected.size > 0 ? results.filter(l => selected.has(l.id)) : results;
    const headers = ["Decisor", "Empresa", "Telefone", "Site", "LinkedIn", "Cidade", "Busca"];
    const rows = toExport.map(l => [
      l.nome_decisor || "", l.nome_empresa, l.telefone || "", l.site || "",
      l.linkedin || "", l.cidade || "", l.termo_pesquisa || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linkedin_leads_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `${toExport.length} leads exportados!` });
  };

  // Delete
  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    await supabase.from("leads").delete().in("id", ids);
    setLeads(prev => prev.filter(l => !selected.has(l.id)));
    setSelected(new Set());
    toast({ title: `${ids.length} leads removidos` });
  };

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Filter Sidebar */}
      <LinkedInFilterSidebar
        filters={filters}
        onChange={setFilters}
        filterCounts={filterCounts}
        jobTitleSuggestions={jobTitleSuggestions}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Search Form - Collapsible */}
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-blue-400" />
              Nova Extração
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cargo (ex: CEO)..."
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  className="pl-8 h-9 text-sm bg-secondary/50 border-border/50"
                  disabled={loading}
                />
              </div>
              <div className="relative">
                <Factory className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Setor (ex: Tecnologia)..."
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  className="pl-8 h-9 text-sm bg-secondary/50 border-border/50"
                  disabled={loading}
                />
              </div>
              <div className="relative">
                <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Keywords..."
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  className="pl-8 h-9 text-sm bg-secondary/50 border-border/50"
                  disabled={loading}
                />
              </div>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Localização..."
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="pl-8 h-9 text-sm bg-secondary/50 border-border/50"
                  disabled={loading}
                />
              </div>
            </div>

            {loading && (
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{statusText}</span>
                  <span className="text-primary font-mono">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}

            <Button
              onClick={handleSearch}
              disabled={loading}
              size="sm"
              className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Buscando...</>
              ) : (
                <><Linkedin className="mr-1.5 h-4 w-4" />Buscar Decisores</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Leads LinkedIn
              {activeFilters > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
                  {activeFilters} filtro{activeFilters > 1 ? "s" : ""} ativo{activeFilters > 1 ? "s" : ""}
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              Mostrando {totalCount} de {leads.length} leads
            </p>
          </div>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button variant="destructive" size="sm" onClick={deleteSelected}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir ({selected.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
            </Button>
          </div>
        </div>

        {/* Results Table */}
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={results.length > 0 && selected.size === results.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Decisor</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>LinkedIn</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Busca</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <p className="text-muted-foreground mb-3">
                        {leads.length === 0
                          ? "Nenhum lead LinkedIn encontrado. Use o formulário acima para buscar decisores."
                          : "Nenhum lead encontrado para os filtros aplicados."}
                      </p>
                      {activeFilters > 0 && (
                        <Button variant="outline" size="sm" onClick={() => setFilters(emptyFilters)}>
                          Limpar Filtros
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  results.map(lead => (
                    <TableRow key={lead.id} className="border-border/30 hover:bg-secondary/30">
                      <TableCell>
                        <Checkbox
                          checked={selected.has(lead.id)}
                          onCheckedChange={() => toggleSelect(lead.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm">{lead.nome_decisor || "—"}</TableCell>
                      <TableCell className="text-sm">{lead.nome_empresa}</TableCell>
                      <TableCell className="font-mono text-xs">{lead.telefone || "—"}</TableCell>
                      <TableCell>
                        {lead.site ? (
                          <a href={lead.site} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline flex items-center gap-1 text-xs">
                            <ExternalLink className="h-3 w-3" />
                            <span className="truncate max-w-[100px]">{lead.site.replace(/https?:\/\//, "")}</span>
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {lead.linkedin ? (
                          <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                            <Linkedin className="h-4 w-4" />
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lead.cidade || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{lead.termo_pesquisa || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LinkedInSearch;
