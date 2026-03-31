import { useState } from "react";
import { Search, MapPin, Zap, Loader2, Globe, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

type SearchSource = "google" | "linkedin";

const Index = () => {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState<SearchSource>("google");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!query.trim() || !location.trim()) {
      toast({ title: "Preencha ambos os campos", variant: "destructive" });
      return;
    }

    const { data: apiKeyData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "api_key")
      .maybeSingle();

    const { data: providerData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "api_provider")
      .maybeSingle();

    if (!apiKeyData?.value) {
      toast({
        title: "API Key não configurada",
        description: "Vá em Configurações e adicione sua API Key.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setProgress(10);
    setStatusText("Iniciando busca...");

    try {
      setProgress(30);
      setStatusText(`Consultando ${source === "google" ? "Google Maps" : "LinkedIn"}...`);

      const { data, error } = await supabase.functions.invoke("extract-leads", {
        body: {
          query: query.trim(),
          location: location.trim(),
          apiKey: apiKeyData.value,
          provider: providerData?.value || "serpapi",
          source,
        },
      });

      if (error) throw error;

      setProgress(80);
      setStatusText("Salvando leads...");

      const leads = data?.leads || [];
      let newCount = 0;
      let dupCount = 0;

      for (const lead of leads) {
        const upsertData: any = {
            nome_empresa: lead.nome_empresa,
            telefone: lead.telefone || null,
            site: lead.site || null,
            endereco: lead.endereco || null,
            instagram: lead.instagram || null,
            linkedin: lead.linkedin || null,
            query_origem: `${query} - ${location}`,
            termo_pesquisa: query.trim(),
            fonte: source,
          };

        // LinkedIn results include decision maker name
        if (lead.nome_decisor) {
          upsertData.nome_decisor = lead.nome_decisor;
        }

        const { error: insertError } = await supabase.from("leads").upsert(
          upsertData,
          { onConflict: "nome_empresa,telefone" }
        );

        if (insertError) {
          dupCount++;
        } else {
          newCount++;
        }
      }

      setProgress(100);
      setStatusText("Concluído!");

      toast({
        title: `Extração concluída!`,
        description: `${leads.length} leads encontrados. ${newCount} novos, ${dupCount} duplicados.`,
      });

      setTimeout(() => navigate("/leads"), 1500);
    } catch (err: any) {
      toast({
        title: "Erro na extração",
        description: err.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
        setStatusText("");
      }, 2000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
          <Zap className="h-4 w-4" />
          Extrator de Leads B2B
        </div>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Encontre seus próximos clientes
        </h1>
        <p className="text-muted-foreground text-lg">
          Busque empresas por nicho e localização. Extraia dados de contato automaticamente.
        </p>
      </div>

      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-lg">Nova Extração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Source Toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Fonte de pesquisa</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={source === "google" ? "default" : "outline"}
                size="sm"
                onClick={() => setSource("google")}
                disabled={loading}
                className={source === "google" ? "bg-primary" : "border-border/50"}
              >
                <Globe className="h-4 w-4 mr-1" />
                Google Maps
              </Button>
              <Button
                type="button"
                variant={source === "linkedin" ? "default" : "outline"}
                size="sm"
                onClick={() => setSource("linkedin")}
                disabled={loading}
                className={source === "linkedin" ? "bg-primary" : "border-border/50"}
              >
                <Linkedin className="h-4 w-4 mr-1" />
                LinkedIn
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">O que você busca?</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={source === "google" ? "Ex: Restaurantes, Clínicas, Academias..." : "Ex: CEO de agências de marketing..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Onde?</label>
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

          {loading && (
            <div className="space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{statusText}</span>
                <span className="text-primary font-mono">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button
            onClick={handleSearch}
            disabled={loading}
            className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Extraindo...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-5 w-5" />
                Pesquisar e Extrair
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
