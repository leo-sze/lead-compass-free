import { useMemo, useState } from "react";
import { Search, MapPin, Zap, Loader2, Globe, Target, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizePhone } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

// ─── Niche presets ──────────────────────────────────────────────
const NICHE_PRESETS: Record<string, { label: string; terms: string[] }> = {
  esportivo: {
    label: "Mercado Esportivo",
    terms: [
      "academia de ginástica",
      "crossfit",
      "studio de pilates",
      "studio funcional",
      "escola de natação",
      "artes marciais",
      "jiu jitsu",
      "muay thai",
      "yoga studio",
      "beach tennis",
      "padel",
    ],
  },
};

// ─── City subdivisions (zones / well-known bairros) ─────────────
const CITY_SUBDIVISIONS: Record<string, string[]> = {
  "sao paulo": [
    "Pinheiros", "Vila Madalena", "Itaim Bibi", "Moema", "Vila Olímpia",
    "Jardins", "Brooklin", "Tatuapé", "Mooca", "Santana", "Perdizes",
    "Lapa", "Ipiranga", "Vila Mariana", "Morumbi",
  ],
  "rio de janeiro": [
    "Copacabana", "Ipanema", "Leblon", "Barra da Tijuca", "Botafogo",
    "Tijuca", "Recreio", "Flamengo", "Méier", "Jacarepaguá",
  ],
  "belo horizonte": [
    "Savassi", "Lourdes", "Funcionários", "Buritis", "Belvedere",
    "Castelo", "Pampulha", "Santa Tereza", "Cidade Nova",
  ],
  "curitiba": [
    "Batel", "Água Verde", "Bigorrilho", "Centro", "Cabral",
    "Champagnat", "Ecoville", "Portão", "Boa Vista", "Mercês",
  ],
  "porto alegre": [
    "Moinhos de Vento", "Bela Vista", "Petrópolis", "Menino Deus",
    "Cidade Baixa", "Higienópolis", "Auxiliadora", "Mont'Serrat",
  ],
};

function cityKey(city: string): string {
  return city.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const GoogleSearch = () => {
  const [niche, setNiche] = useState<string>("custom");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [useSubdivisions, setUseSubdivisions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const detectedSubdivisions = useMemo(() => {
    return CITY_SUBDIVISIONS[cityKey(location)] || [];
  }, [location]);

  const handleSearch = async () => {
    // Build term list
    const terms: string[] = niche !== "custom"
      ? NICHE_PRESETS[niche].terms
      : [query.trim()].filter(Boolean);

    if (terms.length === 0) {
      toast({ title: "Informe um termo de busca ou escolha um nicho", variant: "destructive" });
      return;
    }
    if (!location.trim()) {
      toast({ title: "Informe a cidade", variant: "destructive" });
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

    // Build location list (city or subdivisions of city)
    const locations: string[] = useSubdivisions && detectedSubdivisions.length > 0
      ? detectedSubdivisions.map((b) => `${b}, ${location.trim()}`)
      : [location.trim()];

    setLoading(true);
    setProgress(2);
    const totalQueries = terms.length * locations.length;
    let doneQueries = 0;

    // ── Stage 1: Collect raw leads from Google Maps ────────────
    const collected = new Map<string, any>(); // dedup key: phone or fallback

    // Use fastMode when running multiple queries (skips per-query reviews + CNPJ enrichment)
    const isMultiQuery = totalQueries > 1;
    const CONCURRENCY = 4;

    const tasks: Array<{ term: string; loc: string }> = [];
    for (const term of terms) for (const loc of locations) tasks.push({ term, loc });

    const runOne = async ({ term, loc }: { term: string; loc: string }) => {
      try {
        const { data, error } = await supabase.functions.invoke("extract-leads", {
          body: {
            query: term,
            location: loc,
            apiKey: apiKeyData.value,
            provider: providerData?.value || "serpapi",
            source: "google",
            fastMode: isMultiQuery,
          },
        });
        if (error) {
          console.error("extract-leads error:", error);
          return;
        }
        for (const lead of (data?.leads || [])) {
          const phone = normalizePhone(lead.telefone || null);
          const key = phone || `name:${(lead.nome_empresa || "").toLowerCase()}|${loc.toLowerCase()}`;
          if (!collected.has(key)) {
            collected.set(key, { ...lead, telefone: phone, _term: term, _loc: loc });
          }
        }
      } catch (e) {
        console.error(`Search failed for ${term} in ${loc}:`, e);
      } finally {
        doneQueries++;
        setStatusText(`Buscando... (${doneQueries}/${totalQueries}) · ${collected.size} leads únicos`);
        setProgress(Math.max(4, Math.round((doneQueries / totalQueries) * 30)));
      }
    };

    try {
      // Run with bounded concurrency
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
        while (cursor < tasks.length) {
          const idx = cursor++;
          await runOne(tasks[idx]);
        }
      });
      await Promise.all(workers);


      const allLeads = Array.from(collected.values());
      setProgress(35);
      setStatusText(`${allLeads.length} leads únicos encontrados. Checando duplicatas no banco...`);

      // ── Stage 2: Dedup against existing leads + blocklist de excluídos ─────────
      const phones = allLeads.map((l) => l.telefone).filter(Boolean) as string[];
      const cnpjs = allLeads.map((l) => l.cnpj?.replace(/\D/g, "")).filter(Boolean) as string[];
      let existingPhones = new Set<string>();
      let existingCnpjs = new Set<string>();
      let blockedPhones = new Set<string>();
      let blockedCnpjs = new Set<string>();
      if (phones.length > 0 || cnpjs.length > 0) {
        const [{ data: existingPhonesRows }, { data: deletedPhonesRows }, { data: existingCnpjRows }, { data: deletedCnpjRows }] = await Promise.all([
          phones.length > 0 ? supabase.from("leads").select("telefone").in("telefone", phones) : Promise.resolve({ data: [] as any[] }),
          phones.length > 0 ? supabase.from("deleted_leads").select("telefone").in("telefone", phones) : Promise.resolve({ data: [] as any[] }),
          cnpjs.length > 0 ? supabase.from("leads").select("cnpj").in("cnpj", cnpjs) : Promise.resolve({ data: [] as any[] }),
          cnpjs.length > 0 ? supabase.from("deleted_leads").select("cnpj").in("cnpj", cnpjs) : Promise.resolve({ data: [] as any[] }),
        ]);
        existingPhones = new Set((existingPhonesRows || []).map((r: any) => r.telefone));
        blockedPhones = new Set((deletedPhonesRows || []).map((r: any) => r.telefone));
        existingCnpjs = new Set((existingCnpjRows || []).map((r: any) => r.cnpj));
        blockedCnpjs = new Set((deletedCnpjRows || []).map((r: any) => r.cnpj));
      }

      let blockedCount = 0;
      let duplicateCount = 0;
      const newLeads = allLeads.filter((l) => {
        const cnpj = l.cnpj?.replace(/\D/g, "") || null;
        const isBlocked = (l.telefone && blockedPhones.has(l.telefone)) || (cnpj && blockedCnpjs.has(cnpj));
        if (isBlocked) { blockedCount++; return false; }
        const isDup = (l.telefone && existingPhones.has(l.telefone)) || (cnpj && existingCnpjs.has(cnpj));
        if (isDup) { duplicateCount++; return false; }
        return true;
      });

      setProgress(45);
      setStatusText(`${newLeads.length} novos · ${duplicateCount} já no banco · ${blockedCount} excluídos antes (bloqueados). Salvando...`);

      if (newLeads.length === 0) {
        toast({
          title: "Nenhum lead novo",
          description: `Bruto: ${allLeads.length} · Duplicados: ${duplicateCount} · Bloqueados (excluídos antes): ${blockedCount}. Os bloqueados não voltam — limpe a tabela deleted_leads se quiser reusá-los.`,
        });
      }

      // ── Stage 3: Insert new leads ───────────────────────────
      const savedLeads: Array<{ id: string; transient: any }> = [];
      for (const lead of newLeads) {
        const { data: saved } = await supabase.from("leads").upsert(
          {
            nome_empresa: lead.nome_empresa,
            telefone: lead.telefone || null,
            site: lead.site || null,
            endereco: lead.endereco || null,
            instagram: lead.instagram || null,
            linkedin: lead.linkedin || null,
            cnpj: lead.cnpj?.replace(/\D/g, "") || null,
            query_origem: `${lead._term} - ${lead._loc}`,
            termo_pesquisa: lead._term,
            cidade: lead.cidade || location.trim(),
            fonte: "google",
            score_breakdown: {
              rating: lead.rating,
              total_reviews: lead.total_reviews,
              price_level: lead.price_level,
              categoria: lead.categoria,
              reviews: lead.reviews || [],
              bairro: lead.bairro,
              estado: lead.estado,
            },
          } as any,
          { onConflict: "nome_empresa,telefone" }
        ).select("id").maybeSingle();

        if (saved) savedLeads.push({ id: saved.id, transient: lead });
      }

      // ── Stage 4: Score via AI in batches of 5 ───────────────
      setProgress(50);
      setStatusText("Analisando qualidade via IA...");
      const SCORE_BATCH = 5;
      let scored = 0;
      for (let i = 0; i < savedLeads.length; i += SCORE_BATCH) {
        const batch = savedLeads.slice(i, i + SCORE_BATCH);
        await Promise.all(batch.map(async ({ id, transient: t }) => {
          try {
            const { data: scoreData, error: scoreError } = await supabase.functions.invoke("score-lead", {
              body: {
                nome_empresa: t.nome_empresa,
                endereco: t.endereco,
                bairro: t.bairro,
                cidade: t.cidade || location.trim(),
                estado: t.estado,
                rating: t.rating,
                total_reviews: t.total_reviews,
                website: t.site,
                price_level: t.price_level,
                categoria: t.categoria,
                reviews: t.reviews || [],
              },
            });
            if (!scoreError && scoreData && !scoreData.error) {
              await supabase.from("leads").update({
                score: scoreData.score,
                lead_quality: scoreData.classificacao,
                justificativa: scoreData.justificativa,
                sinais_positivos: scoreData.sinais_positivos,
                sinais_negativos: scoreData.sinais_negativos,
              } as any).eq("id", id);
            }
          } catch (e) {
            console.error("Score error for", t.nome_empresa, e);
          }
        }));
        scored += batch.length;
        const pct = 50 + Math.round((scored / Math.max(savedLeads.length, 1)) * 45);
        setProgress(pct);
        setStatusText(`Analisando qualidade via IA... ${scored}/${savedLeads.length}`);
      }

      setProgress(100);
      setStatusText("Concluído!");
      toast({
        title: "Extração concluída!",
        description: `${newLeads.length} novos · ${duplicateCount} duplicados · ${blockedCount} bloqueados · ${totalQueries} buscas.`,
      });
      setTimeout(() => navigate("/leads"), 1500);
    } catch (err: any) {
      toast({ title: "Erro na extração", description: err.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setTimeout(() => { setLoading(false); setProgress(0); setStatusText(""); }, 2000);
    }
  };

  const activeTerms = niche !== "custom" ? NICHE_PRESETS[niche].terms : [];

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
          <Globe className="h-4 w-4" />
          Google Maps — Busca de Empresas
        </div>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Encontre empresas locais
        </h1>
        <p className="text-muted-foreground text-lg">
          Busque por nicho e cidade. Extraia telefone, site, endereço e redes sociais.
        </p>
      </div>

      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-lg">Nova Extração — Google Maps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Niche selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" /> Nicho
            </label>
            <Select value={niche} onValueChange={setNiche} disabled={loading}>
              <SelectTrigger className="bg-secondary/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Personalizado (digite o termo)</SelectItem>
                {Object.entries(NICHE_PRESETS).map(([key, p]) => (
                  <SelectItem key={key} value={key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeTerms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {activeTerms.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs font-normal">{t}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Custom term (only when niche=custom) */}
          {niche === "custom" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Nicho / Segmento</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ex: Restaurantes, Clínicas, Academias..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10 bg-secondary/50 border-border/50"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {/* City */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Cidade / Região</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: São Paulo, Rio de Janeiro, Curitiba..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50"
                disabled={loading}
              />
            </div>
          </div>

          {/* Subdivisions */}
          {detectedSubdivisions.length > 0 && (
            <div className="space-y-2 p-3 rounded-md bg-secondary/30 border border-border/50">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="subs"
                  checked={useSubdivisions}
                  onCheckedChange={(v) => setUseSubdivisions(!!v)}
                  disabled={loading}
                />
                <label htmlFor="subs" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                  <Layers className="h-4 w-4" />
                  Subdividir busca por {detectedSubdivisions.length} bairros/zonas
                </label>
              </div>
              {useSubdivisions && (
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {detectedSubdivisions.map((b) => (
                    <Badge key={b} variant="outline" className="text-xs font-normal">{b}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Query plan summary */}
          {(activeTerms.length > 0 || query.trim()) && location.trim() && (
            <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-md p-3">
              <strong className="text-primary">Plano:</strong>{" "}
              {(niche !== "custom" ? activeTerms.length : 1)} termo(s) ×{" "}
              {useSubdivisions && detectedSubdivisions.length > 0 ? detectedSubdivisions.length : 1} região(ões) ={" "}
              <strong>
                {(niche !== "custom" ? activeTerms.length : 1) *
                  (useSubdivisions && detectedSubdivisions.length > 0 ? detectedSubdivisions.length : 1)}
              </strong>{" "}
              buscas
            </div>
          )}

          {loading && (
            <div className="space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{statusText}</span>
                <span className="text-primary font-mono">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button onClick={handleSearch} disabled={loading} className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90">
            {loading ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Extraindo...</>
            ) : (
              <><Zap className="mr-2 h-5 w-5" />Extrair Leads</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default GoogleSearch;
