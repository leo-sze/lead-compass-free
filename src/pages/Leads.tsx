import { useState, useEffect, useMemo, useCallback } from "react";
import { Download, MessageCircle, Trash2, ExternalLink, Instagram, UserSearch, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import LeadFilters from "@/components/leads/LeadFilters";
import BulkWhatsApp from "@/components/leads/BulkWhatsApp";

type Lead = Tables<"leads"> & {
  termo_pesquisa?: string | null;
  cidade?: string | null;
  fonte?: string | null;
};

const Leads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [selectedTermo, setSelectedTermo] = useState("all");
  const [selectedCidade, setSelectedCidade] = useState("all");
  const [hasPhone, setHasPhone] = useState(false);
  const [hasSite, setHasSite] = useState(false);
  const [hasInstagram, setHasInstagram] = useState(false);
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    "Olá {nome_empresa}, tudo bem? Gostaria de apresentar nossos serviços."
  );
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchLeads();
    fetchTemplate();
  }, []);

  const fetchLeads = async () => {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (data) setLeads(data as Lead[]);
  };

  const fetchTemplate = async () => {
    const { data } = await supabase.from("settings").select("value").eq("key", "whatsapp_template").maybeSingle();
    if (data?.value) setWhatsappTemplate(data.value);
  };

  const termos = useMemo(() => {
    const set = new Set(leads.map((l) => l.termo_pesquisa).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [leads]);

  const cidades = useMemo(() => {
    const set = new Set(leads.map((l) => l.cidade).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    let result = leads;
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
    if (hasPhone) result = result.filter((l) => l.telefone);
    if (hasSite) result = result.filter((l) => l.site);
    if (hasInstagram) result = result.filter((l) => l.instagram);
    return result;
  }, [leads, filter, selectedTermo, selectedCidade, hasPhone, hasSite, hasInstagram]);

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
    const headers = ["Nome", "Decisor", "Telefone", "Site", "Endereço", "Instagram", "LinkedIn", "Termo", "Cidade", "Fonte"];
    const rows = toExport.map((l) => [
      l.nome_empresa, l.nome_decisor || "", l.telefone || "", l.site || "", l.endereco || "",
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
        // Backward compat: if only nome_decisor returned at top level
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
        hasPhone={hasPhone}
        onHasPhoneChange={setHasPhone}
        hasSite={hasSite}
        onHasSiteChange={setHasSite}
        hasInstagram={hasInstagram}
        onHasInstagramChange={setHasInstagram}
      />

      <Card className="border-border/50 bg-card/80">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Decisor</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Redes</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                    Nenhum lead encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead) => (
                  <TableRow key={lead.id} className="border-border/30 hover:bg-secondary/30">
                    <TableCell>
                      <Checkbox
                        checked={selected.has(lead.id)}
                        onCheckedChange={() => toggleSelect(lead.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{lead.nome_empresa}</TableCell>
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Leads;
