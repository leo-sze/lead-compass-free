import { useState, useEffect } from "react";
import { Save, Key, Eye, EyeOff, Building2, Database, Loader2, CheckCircle2, AlertCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [whatsappToken, setWhatsappToken] = useState("");
  const [showWhatsappToken, setShowWhatsappToken] = useState(false);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [b2bCookie, setB2bCookie] = useState("");
  const [showB2bCookie, setShowB2bCookie] = useState(false);
  const [b2bLastValidation, setB2bLastValidation] = useState<string | null>(null);
  const [testingB2b, setTestingB2b] = useState(false);
  const [b2bValid, setB2bValid] = useState<boolean | null>(null);
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
        
        if (row.key === "google_places_api_key") setGooglePlacesKey(row.value || "");
        if (row.key === "kommo_subdomain") setKommoSubdomain(row.value || "");
        if (row.key === "kommo_api_token") setKommoToken(row.value || "");
        if (row.key === "kommo_pipeline_id") setKommoPipelineId(row.value || "");
        if (row.key === "whatsapp_access_token") setWhatsappToken(row.value || "");
        if (row.key === "whatsapp_phone_number_id") setWhatsappPhoneNumberId(row.value || "");
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
      
      await saveSetting("google_places_api_key", googlePlacesKey);
      await saveSetting("kommo_subdomain", kommoSubdomain);
      await saveSetting("kommo_api_token", kommoToken);
      await saveSetting("kommo_pipeline_id", kommoPipelineId);
      await saveSetting("whatsapp_access_token", whatsappToken);
      await saveSetting("whatsapp_phone_number_id", whatsappPhoneNumberId);
      await saveSetting("b2bleads_cookie", b2bCookie);
      toast({ title: "Configurações salvas!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
    setSaving(false);
  };

  const testB2bConnection = async () => {
    if (!b2bCookie) {
      toast({ title: "Insira o cookie primeiro", variant: "destructive" });
      return;
    }
    setTestingB2b(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-b2bleads", {
        body: { cookie: b2bCookie, ramo: "test", estado: "SP", limite: 1 },
      });
      if (error || data?.error?.includes("expirad") || data?.error?.includes("login")) {
        setB2bValid(false);
        toast({ title: "Cookie inválido ou expirado", variant: "destructive" });
      } else {
        setB2bValid(true);
        const now = new Date().toISOString();
        setB2bLastValidation(now);
        await saveSetting("b2bleads_last_validation", now);
        toast({ title: "Conexão B2BLeads validada!" });
      }
    } catch {
      setB2bValid(false);
      toast({ title: "Erro ao testar conexão", variant: "destructive" });
    }
    setTestingB2b(false);
  };


  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Configure sua API de busca e integrações</p>
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
            <MessageCircle className="h-5 w-5 text-primary" />
            WhatsApp Direto
          </CardTitle>
          <CardDescription>
            Envia mensagens diretamente pela API oficial do WhatsApp, sem nota, campo, tag ou Salesbot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Access Token WhatsApp</label>
            <div className="relative">
              <Input
                type={showWhatsappToken ? "text" : "password"}
                placeholder="Cole o token do WhatsApp Cloud API..."
                value={whatsappToken}
                onChange={(e) => setWhatsappToken(e.target.value)}
                className="pr-10 bg-secondary/50 font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowWhatsappToken(!showWhatsappToken)}
              >
                {showWhatsappToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Phone Number ID</label>
            <Input
              placeholder="Ex: 123456789012345"
              value={whatsappPhoneNumberId}
              onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
              className="bg-secondary/50 font-mono"
            />
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
            <Database className="h-5 w-5 text-primary" />
            B2BLeads
          </CardTitle>
          <CardDescription>
            Importe leads diretamente do b2bleads.com.br usando seu cookie de sessão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Cookie de sessão</label>
            <div className="relative">
              <Input
                type={showB2bCookie ? "text" : "password"}
                placeholder="Cole o cookie laravel_session aqui..."
                value={b2bCookie}
                onChange={(e) => setB2bCookie(e.target.value)}
                className="pr-10 bg-secondary/50 font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                onClick={() => setShowB2bCookie(!showB2bCookie)}
              >
                {showB2bCookie ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Como obter: faça login em b2bleads.com.br → F12 → Application → Cookies → copie o valor do cookie chamado <code className="bg-secondary px-1 rounded">laravel_session</code>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={testB2bConnection}
              disabled={testingB2b || !b2bCookie}
            >
              {testingB2b ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Testando...</>
              ) : (
                "Testar conexão"
              )}
            </Button>
            {b2bValid === true && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="h-3 w-3" /> Válido
              </span>
            )}
            {b2bValid === false && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> Inválido/expirado
              </span>
            )}
          </div>

          {b2bLastValidation && (
            <p className="text-xs text-muted-foreground">
              Última validação: {new Date(b2bLastValidation).toLocaleString("pt-BR")}
              {(Date.now() - new Date(b2bLastValidation).getTime()) > 24 * 60 * 60 * 1000 && (
                <Badge variant="outline" className="ml-2 bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                  ⚠️ Há mais de 24h
                </Badge>
              )}
            </p>
          )}
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
