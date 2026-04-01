import { useState } from "react";
import { Search, MapPin, Briefcase, Loader2, Linkedin, Tag, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const LinkedInSearch = () => {
  const [jobTitle, setJobTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

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

      const leads = data?.leads || [];
      let newCount = 0;
      let dupCount = 0;

      for (const lead of leads) {
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
        description: `${leads.length} decisores encontrados. ${newCount} novos, ${dupCount} duplicados.`,
      });
      setTimeout(() => navigate("/leads"), 1500);
    } catch (err: any) {
      toast({ title: "Erro na extração", description: err.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setTimeout(() => { setLoading(false); setProgress(0); setStatusText(""); }, 2000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-400 px-4 py-2 rounded-full text-sm font-medium mb-4">
          <Linkedin className="h-4 w-4" />
          LinkedIn — Busca de Decisores
        </div>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          Encontre decisores
        </h1>
        <p className="text-muted-foreground text-lg">
          Busque por cargo, indústria, palavras-chave e localização.
        </p>
      </div>

      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-lg">Nova Extração — LinkedIn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Job Title (Cargo)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: CEO, Diretor de Marketing, Fundador..."
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Industry (Indústria / Setor)</label>
            <div className="relative">
              <Factory className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: Tecnologia, Alimentos, Construção Civil..."
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Keywords (Palavras-chave)</label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: B2B, SaaS, exportação, varejo..."
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Location (Localização)</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: São Paulo, Rio de Janeiro, Brasil..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50"
                disabled={loading}
              />
            </div>
          </div>

          {loading && (
            <div className="space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{statusText}</span>
                <span className="text-primary font-mono">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button onClick={handleSearch} disabled={loading} className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Buscando decisores...</>
            ) : (
              <><Linkedin className="mr-2 h-5 w-5" />Buscar Decisores</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default LinkedInSearch;
