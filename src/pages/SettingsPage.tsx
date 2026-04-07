import { useState, useEffect } from "react";
import { Save, Key, MessageCircle, Eye, EyeOff, Building2, Database, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SettingsPage = () => {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("serpapi");
  const [googlePlacesKey, setGooglePlacesKey] = useState("");
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [kommoSubdomain, setKommoSubdomain] = useState("");
  const [kommoToken, setKommoToken] = useState("");
  const [showKommoToken, setShowKommoToken] = useState(false);
  const [kommoPipelineId, setKommoPipelineId] = useState("");
  const [b2bCookie, setB2bCookie] = useState("");
  const [showB2bCookie, setShowB2bCookie] = useState(false);
  const [b2bLastValidation, setB2bLastValidation] = useState<string | null>(null);
  const [testingB2b, setTestingB2b] = useState(false);
  const [b2bValid, setB2bValid] = useState<boolean | null>(null);
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    "Olá {nome_empresa}, tudo bem? Gostaria de apresentar nossos serviços."
  );
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase.from("settings").select("*");
    if (data) {
      for (const row of data) {
        if (row.key === "api_key") setApiKey(row.value || "");
        if (row.key === "api_provider") setProvider(row.value || "serpapi");
        if (row.key === "whatsapp_template") setWhatsappTemplate(row.value || "");
        if (row.key === "google_places_api_key") setGooglePlacesKey(row.value || "");
        if (row.key === "kommo_subdomain") setKommoSubdomain(row.value || "");
        if (row.key === "kommo_api_token") setKommoToken(row.value || "");
        if (row.key === "kommo_pipeline_id") setKommoPipelineId(row.value || "");
        if (row.key === "b2bleads_cookie") {
          setB2bCookie(row.value || "");
          if (row.value) setB2bValid(true);
        }
        if (row.key === "b2bleads_last_validation") setB2bLastValidation(row.value || null);
      }
    }
  };

  const saveSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase.from("settings").select("id").eq("key", key).maybeSingle();
    if (existing) {
      await supabase.from("settings").update({ value }).eq("key", key);
    } else {
      await supabase.from("settings").insert({ key, value });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting("api_key", apiKey);
      await saveSetting("api_provider", provider);
      await saveSetting("whatsapp_template", whatsappTemplate);
      await saveSetting("google_places_api_key", googlePlacesKey);
      await saveSetting("kommo_subdomain", kommoSubdomain);
      await saveSetting("kommo_api_token", kommoToken);
      await saveSetting("kommo_pipeline_id", kommoPipelineId);
      await saveSetting("b2bleads_cookie", b2bCookie);
      toast({ title: "Configurações salvas!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
    setSaving(false);
  };

  const previewMessage = whatsappTemplate
    .replace(/{nome_empresa}/g, "Restaurante Exemplo")
    .replace(/{telefone}/g, "11999999999")
    .replace(/{endereco}/g, "Rua Exemplo, 123");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Configure sua API de busca e mensagem do WhatsApp</p>
      </div>

      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            API de Busca
          </CardTitle>
          <CardDescription>
            Obtenha sua API Key gratuita em{" "}
            <a href="https://serpapi.com" target="_blank" rel="noopener" className="text-accent hover:underline">
              serpapi.com
            </a>{" "}
            ou{" "}
            <a href="https://searchapi.io" target="_blank" rel="noopener" className="text-accent hover:underline">
              searchapi.io
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Provedor</label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="serpapi">SerpApi</SelectItem>
                <SelectItem value="searchapi">SearchApi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                placeholder="Cole sua API Key aqui..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-10 bg-secondary/50 font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Google Places API
          </CardTitle>
          <CardDescription>
            Usado apenas como fallback (primeiro busca no site da empresa). A API oferece 5.000 buscas gratuitas/mês (tier Pro) a partir de março/2025.{" "}
            <a href="https://console.cloud.google.com/" target="_blank" rel="noopener" className="text-accent hover:underline">
              Obter chave no Google Cloud
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Input
              type={showGoogleKey ? "text" : "password"}
              placeholder="Cole sua Google Places API Key aqui..."
              value={googlePlacesKey}
              onChange={(e) => setGooglePlacesKey(e.target.value)}
              className="pr-10 bg-secondary/50 font-mono"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => setShowGoogleKey(!showGoogleKey)}
            >
              {showGoogleKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Integração Kommo
          </CardTitle>
          <CardDescription>
            Exporte leads diretamente para seu CRM Kommo.{" "}
            <a href="https://www.kommo.com/br/" target="_blank" rel="noopener" className="text-accent hover:underline">
              Saiba mais
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Subdomínio Kommo</label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="minhaempresa"
                value={kommoSubdomain}
                onChange={(e) => setKommoSubdomain(e.target.value)}
                className="bg-secondary/50"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">.kommo.com</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">API Token</label>
            <div className="relative">
              <Input
                type={showKommoToken ? "text" : "password"}
                placeholder="Cole seu API Token aqui..."
                value={kommoToken}
                onChange={(e) => setKommoToken(e.target.value)}
                className="pr-10 bg-secondary/50 font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowKommoToken(!showKommoToken)}
              >
                {showKommoToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Gere em Kommo → Configurações → Integrações → Token de API
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Pipeline ID</label>
            <Input
              placeholder="Ex: 1234567"
              value={kommoPipelineId}
              onChange={(e) => setKommoPipelineId(e.target.value)}
              className="bg-secondary/50 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              ID numérico do pipeline. Encontre em Kommo → Configurações → Funis → clique no funil → veja a URL (ex: /leads/pipeline/1234567)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-400" />
            Mensagem WhatsApp
          </CardTitle>
          <CardDescription>
            Use variáveis:{" "}
            <Badge variant="secondary" className="font-mono text-xs">{"{nome_empresa}"}</Badge>{" "}
            <Badge variant="secondary" className="font-mono text-xs">{"{telefone}"}</Badge>{" "}
            <Badge variant="secondary" className="font-mono text-xs">{"{endereco}"}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={whatsappTemplate}
            onChange={(e) => setWhatsappTemplate(e.target.value)}
            rows={4}
            className="bg-secondary/50 font-mono text-sm"
          />
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</label>
            <div className="bg-green-900/20 border border-green-900/30 rounded-lg p-3 text-sm text-green-200">
              {previewMessage}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full h-12 text-base font-semibold">
        <Save className="mr-2 h-5 w-5" />
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>
    </div>
  );
};

export default SettingsPage;
