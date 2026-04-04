import { useState, useEffect } from "react";
import { Save, Key, MessageCircle, Eye, EyeOff } from "lucide-react";
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
