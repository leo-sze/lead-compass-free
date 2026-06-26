import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, MapPin, Briefcase, Loader2, Linkedin, Tag, Factory, Download,
  Trash2, ExternalLink, Phone, Globe, Building2, Users, ChevronDown, ChevronUp,
  Plus, X, RotateCcw, Filter, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizePhone } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads"> & {
  termo_pesquisa?: string | null;
  cidade?: string | null;
  fonte?: string | null;
};

// ─── Suggested job titles (Apollo-style) ────────────────────────
const SUGGESTED_TITLES = [
  "CEO", "CTO", "CFO", "COO", "CMO",
  "Founder", "Co-Founder", "Sócio",
  "Proprietário", "Diretor", "Gerente",
  "VP", "Head", "Coordenador",
];

const EMPLOYEE_COUNT_OPTIONS = [
  { label: "1-10", value: "1-10" },
  { label: "11-50", value: "11-50" },
  { label: "51-200", value: "51-200" },
  { label: "201-500", value: "201-500" },
  { label: "501-1000", value: "501-1000" },
  { label: "1000+", value: "1000+" },
];

const LinkedInSearch = () => {
  // Search form state
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [titleInput, setTitleInput] = useState("");
  const [industry, setIndustry] = useState("");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [showForm, setShowForm] = useState(true);

  // Leads state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState("");

  // Table filters
  const [filterHasPhone, setFilterHasPhone] = useState(false);
  const [filterHasSite, setFilterHasSite] = useState(false);
  const [filterCity, setFilterCity] = useState("");

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

  // Filtered results
  const filteredLeads = useMemo(() => {
    let result = leads;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      result = result.filter(l =>
        (l.nome_decisor?.toLowerCase().includes(q)) ||
        (l.nome_empresa?.toLowerCase().includes(q)) ||
        (l.cidade?.toLowerCase().includes(q)) ||
        (l.termo_pesquisa?.toLowerCase().includes(q))
      );
    }
    if (filterHasPhone) result = result.filter(l => l.telefone);
    if (filterHasSite) result = result.filter(l => l.site);
    if (filterCity.trim()) {
      const c = filterCity.toLowerCase();
      result = result.filter(l => l.cidade?.toLowerCase().includes(c));
    }
    return result;
  }, [leads, searchFilter, filterHasPhone, filterHasSite, filterCity]);

  const hasActiveTableFilters = filterHasPhone || filterHasSite || filterCity.trim() !== "" || searchFilter.trim() !== "";

  // Add job title
  const addTitle = (title: string) => {
    const t = title.trim();
    if (t && !jobTitles.includes(t)) {
      setJobTitles(prev => [...prev, t]);
    }
    setTitleInput("");
  };

  const removeTitle = (title: string) => {
    setJobTitles(prev => prev.filter(t => t !== title));
  };

  // Clear all search fields
  const clearSearch = () => {
    setJobTitles([]);
    setTitleInput("");
    setIndustry("");
    setKeywords("");
    setLocation("");
    setEmployeeCount("");
    setCompanyName("");
  };

  // Clear table filters
  const clearTableFilters = () => {
    setSearchFilter("");
    setFilterHasPhone(false);
    setFilterHasSite(false);
    setFilterCity("");
  };

  const hasSearchValues = jobTitles.length > 0 || industry || keywords || location || employeeCount || companyName;


  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredLeads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredLeads.map(l => l.id)));
    }
  };

  // Search handler
  const handleSearch = async () => {
    if (jobTitles.length === 0 || !location.trim()) {
      toast({ title: "Adicione pelo menos 1 cargo e localização", variant: "destructive" });
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
    setProgress(5);
    setStatusText("Preparando buscas...");

    try {
      setProgress(10);
      setStatusText(`Buscando ${jobTitles.length} cargo(s) no LinkedIn...`);

      const keywordsParts = [
        keywords.trim(),
        companyName.trim() ? `"${companyName.trim()}"` : "",
        employeeCount && employeeCount !== "any" ? `"${employeeCount} employees"` : "",
      ].filter(Boolean).join(" ");

      const { data, error } = await supabase.functions.invoke("extract-leads", {
        body: {
          query: jobTitles.join(", "),
          location: location.trim(),
          setor: industry.trim() || undefined,
          keywords: keywordsParts || undefined,
          apiKey: apiKeyData.value,
          provider: providerData?.value || "serpapi",
          source: "linkedin",
        },
      });

      if (error) throw error;

      // Handle quota/rate limit errors gracefully
      if (data?.fallback || data?.error) {
        toast({
          title: "Cota de buscas atingida",
          description: data.error || "Sua cota mensal de buscas foi atingida. Atualize seu plano do SearchApi/SerpApi.",
          variant: "destructive",
        });
        setLoading(false);
        setProgress(0);
        setStatusText("");
        return;
      }

      setProgress(70);
      setStatusText("Salvando leads...");

      const newLeads = data?.leads || [];
      let newCount = 0;
      let dupCount = 0;

      // Blocklist: telefones de leads já excluídos não devem voltar
      const phonesToCheck = newLeads.map((l: any) => normalizePhone(l.telefone)).filter(Boolean);
      const cnpjsToCheck = newLeads.map((l: any) => l.cnpj?.replace(/\D/g, "")).filter(Boolean);
      let blockedPhones = new Set<string>();
      let blockedCnpjs = new Set<string>();
      if (phonesToCheck.length > 0 || cnpjsToCheck.length > 0) {
        const [{ data: deletedPhones }, { data: deletedCnpjs }] = await Promise.all([
          phonesToCheck.length > 0
            ? supabase.from("deleted_leads").select("telefone").in("telefone", phonesToCheck)
            : Promise.resolve({ data: [] as any[] }),
          cnpjsToCheck.length > 0
            ? supabase.from("deleted_leads").select("cnpj").in("cnpj", cnpjsToCheck)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        blockedPhones = new Set((deletedPhones || []).map((r: any) => r.telefone));
        blockedCnpjs = new Set((deletedCnpjs || []).map((r: any) => r.cnpj));
      }

      for (const lead of newLeads) {
        const telefone = normalizePhone(lead.telefone);
        const cnpj = lead.cnpj?.replace(/\D/g, "") || null;
        if ((telefone && blockedPhones.has(telefone)) || (cnpj && blockedCnpjs.has(cnpj))) {
          dupCount++;
          continue;
        }
        const { error: insertError } = await supabase.from("leads").upsert(
          {
            nome_empresa: lead.nome_empresa,
            telefone,
            site: lead.site || null,
            endereco: lead.endereco || null,
            instagram: lead.instagram || null,
            linkedin: lead.linkedin || null,
            cnpj,
            nome_decisor: lead.nome_decisor || null,
            query_origem: `${jobTitles.join(", ")}${industry ? ` / ${industry}` : ""}${keywords ? ` [${keywords}]` : ""} - ${location}`,
            termo_pesquisa: lead.cargo || jobTitles[0],
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

      await fetchLeads();
    } catch (err: any) {
      toast({ title: "Erro na extração", description: err.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setTimeout(() => { setLoading(false); setProgress(0); setStatusText(""); }, 2000);
    }
  };

  // Export CSV
  const exportCSV = () => {
    const toExport = selected.size > 0 ? filteredLeads.filter(l => selected.has(l.id)) : filteredLeads;
    const headers = ["Decisor", "Cargo", "Empresa", "Telefone", "Site", "LinkedIn", "Cidade", "Busca"];
    const rows = toExport.map(l => [
      l.nome_decisor || "", l.termo_pesquisa || "", l.nome_empresa, l.telefone || "", l.site || "",
      l.linkedin || "", l.cidade || "", l.query_origem || "",
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
    const rows = leads
      .filter((lead) => selected.has(lead.id))
      .map((lead) => ({
        telefone: normalizePhone(lead.telefone),
        nome_empresa: lead.nome_empresa,
        cnpj: lead.cnpj?.replace(/\D/g, "") || null,
      }))
      .filter((row) => row.telefone || row.cnpj);
    if (rows.length > 0) {
      await supabase.from("deleted_leads").upsert(rows, { onConflict: "telefone", ignoreDuplicates: true });
    }
    const { error } = await supabase.from("leads").delete().in("id", ids);
    if (error) {
      toast({ title: "Erro ao excluir leads", description: error.message, variant: "destructive" });
      return;
    }
    setLeads(prev => prev.filter(l => !selected.has(l.id)));
    setSelected(new Set());
    toast({ title: `${ids.length} leads removidos` });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {/* ─── Search Form (Apollo-style) ───────────────────── */}
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader
          className="py-3 px-4 cursor-pointer flex flex-row items-center justify-between"
          onClick={() => setShowForm(!showForm)}
        >
          <CardTitle className="text-base flex items-center gap-2">
            <Linkedin className="h-4 w-4 text-blue-400" />
            Buscar Decisores
          </CardTitle>
          {showForm ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </CardHeader>

        {showForm && (
          <CardContent className="px-4 pb-4 space-y-4">
            {/* Job Titles (Apollo-style tags) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Cargos
              </label>

              {/* Selected tags */}
              {jobTitles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {jobTitles.map(t => (
                    <Badge key={t} variant="secondary" className="text-xs gap-1 px-2 py-1">
                      {t}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => removeTitle(t)}
                      />
                    </Badge>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar cargo (ex: CEO, Diretor)..."
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); addTitle(titleInput); }
                  }}
                  className="h-9 text-sm bg-secondary/50 border-border/50"
                  disabled={loading}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 px-3"
                  onClick={() => addTitle(titleInput)}
                  disabled={loading || !titleInput.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Quick suggestions */}
              {jobTitles.length === 0 && (
                <div className="flex flex-wrap gap-1">
                  {SUGGESTED_TITLES.map(t => (
                    <button
                      key={t}
                      className="text-xs px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                      onClick={() => addTitle(t)}
                      disabled={loading}
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Other filters in grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Localização *
                </label>
                <Input
                  placeholder="Ex: São Paulo, Brasil..."
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="h-9 text-sm bg-secondary/50 border-border/50"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Factory className="h-3.5 w-3.5" /> Setor
                </label>
                <Input
                  placeholder="Ex: Tecnologia, Varejo..."
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  className="h-9 text-sm bg-secondary/50 border-border/50"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> Empresa
                </label>
                <Input
                  placeholder="Nome da empresa..."
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="h-9 text-sm bg-secondary/50 border-border/50"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" /> Nº Funcionários
                </label>
                <Select value={employeeCount} onValueChange={setEmployeeCount} disabled={loading}>
                  <SelectTrigger className="h-9 text-sm bg-secondary/50 border-border/50">
                    <SelectValue placeholder="Qualquer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Qualquer</SelectItem>
                    {EMPLOYEE_COUNT_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" /> Keywords
                </label>
                <Input
                  placeholder="Palavras-chave..."
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  className="h-9 text-sm bg-secondary/50 border-border/50"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Progress */}
            {loading && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{statusText}</span>
                  <span className="text-primary font-mono">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}

            {/* Search + Clear buttons */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSearch}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Buscando...</>
                ) : (
                  <><Linkedin className="mr-1.5 h-4 w-4" />Buscar Decisores</>
                )}
              </Button>
              {hasSearchValues && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                  disabled={loading}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Limpar Pesquisa
                </Button>
              )}
              {jobTitles.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {jobTitles.length} cargo(s) selecionado(s)
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ─── Results Header ───────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            Leads LinkedIn
          </h2>
          <p className="text-sm text-muted-foreground">
            {filteredLeads.length} de {leads.length} leads
            {hasActiveTableFilters && " (filtrado)"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filtrar leads..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="pl-8 h-8 w-48 text-sm bg-secondary/50 border-border/50"
            />
          </div>
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={deleteSelected}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir ({selected.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* ─── Table Filters Bar ────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Filter className="h-3.5 w-3.5" /> Filtros:
        </span>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <Checkbox checked={filterHasPhone} onCheckedChange={(v) => setFilterHasPhone(!!v)} className="h-3.5 w-3.5" />
          <Phone className="h-3 w-3 text-muted-foreground" /> Com telefone
        </label>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <Checkbox checked={filterHasSite} onCheckedChange={(v) => setFilterHasSite(!!v)} className="h-3.5 w-3.5" />
          <Globe className="h-3 w-3 text-muted-foreground" /> Com site
        </label>
        <div className="relative">
          <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Filtrar cidade..."
            value={filterCity}
            onChange={e => setFilterCity(e.target.value)}
            className="pl-7 h-7 w-36 text-xs bg-secondary/50 border-border/50"
          />
        </div>
        {hasActiveTableFilters && (
          <Button variant="ghost" size="sm" onClick={clearTableFilters} className="h-7 text-xs text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3 mr-1" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* ─── Results Table ────────────────────────────────── */}
      <Card className="border-border/50 bg-card/80">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="w-10">
                  <Checkbox
                    checked={filteredLeads.length > 0 && selected.size === filteredLeads.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Decisor</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>LinkedIn</TableHead>
                <TableHead>Cidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <Linkedin className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-muted-foreground">
                        {leads.length === 0
                          ? "Nenhum lead ainda. Use o formulário acima para buscar decisores."
                          : "Nenhum lead encontrado para este filtro."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map(lead => (
                  <TableRow key={lead.id} className="border-border/30 hover:bg-secondary/30">
                    <TableCell>
                      <Checkbox
                        checked={selected.has(lead.id)}
                        onCheckedChange={() => toggleSelect(lead.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-sm">{lead.nome_decisor || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lead.termo_pesquisa || "—"}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {lead.nome_empresa}
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.telefone ? (
                        <a href={`tel:${lead.telefone}`} className="font-mono text-xs text-accent hover:underline flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.telefone}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.site ? (
                        <a href={lead.site} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline flex items-center gap-1 text-xs">
                          <Globe className="h-3 w-3" />
                          <span className="truncate max-w-[120px]">{lead.site.replace(/https?:\/\/(www\.)?/, "")}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.linkedin ? (
                        <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                          <Linkedin className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lead.cidade ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {lead.cidade}
                        </div>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LinkedInSearch;
