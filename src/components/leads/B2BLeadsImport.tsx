import { useState, useEffect } from "react";
import { Search, Loader2, AlertCircle, CheckCircle2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizePhone } from "@/lib/utils";

const ESTADOS_BR = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"
];

const PORTES = [
  { value: "", label: "Todos" },
  { value: "MEI", label: "Microempreendedor Individual" },
  { value: "ME", label: "Microempresa" },
  { value: "EPP", label: "Empresa de Pequeno Porte" },
  { value: "DEMAIS", label: "Demais" },
];

interface B2BLeadsImportProps {
  onImportComplete: () => void;
}

export default function B2BLeadsImport({ onImportComplete }: B2BLeadsImportProps) {
  const [ramo, setRamo] = useState("");
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [porte, setPorte] = useState("");
  const [dataAberturaDE, setDataAberturaDE] = useState("");
  const [dataAberturaAte, setDataAberturaAte] = useState("");
  const [limite, setLimite] = useState(50);
  const [cookie, setCookie] = useState("");
  const [cookieValid, setCookieValid] = useState<boolean | null>(null);
  const [lastValidation, setLastValidation] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState("");
  const [showResultModal, setShowResultModal] = useState(false);
  const [importResult, setImportResult] = useState({ imported: 0, duplicates: 0 });
  const { toast } = useToast();

  useEffect(() => {
    loadCookieSettings();
  }, []);

  const loadCookieSettings = async () => {
    const { data } = await supabase.from("settings").select("key, value").in("key", [
      "b2bleads_cookie", "b2bleads_last_validation"
    ]);
    if (data) {
      for (const row of data) {
        if (row.key === "b2bleads_cookie" && row.value) {
          setCookie(row.value);
          setCookieValid(true);
        }
        if (row.key === "b2bleads_last_validation" && row.value) {
          setLastValidation(row.value);
        }
      }
    }
  };

  const isStale = lastValidation
    ? (Date.now() - new Date(lastValidation).getTime()) > 24 * 60 * 60 * 1000
    : false;

  const handleSearch = async () => {
    if (!cookie || !ramo || !estado) {
      toast({ title: "Preencha ramo de atividade e estado", variant: "destructive" });
      return;
    }

    setSearching(true);
    setProgress("Iniciando busca no B2BLeads...");

    try {
      const { data, error } = await supabase.functions.invoke("scrape-b2bleads", {
        body: {
          cookie,
          ramo,
          estado,
          cidade: cidade || undefined,
          porte: porte || undefined,
          data_abertura_de: dataAberturaDE || undefined,
          data_abertura_ate: dataAberturaAte || undefined,
          limite,
        },
      });

      if (error) throw error;
      if (data?.error) {
        if (data.error.includes("expirad") || data.error.includes("login")) {
          setCookieValid(false);
          toast({ title: "Sessão expirada", description: "Atualize o cookie de sessão em Configurações.", variant: "destructive" });
        } else {
          toast({ title: "Erro na busca", description: data.error, variant: "destructive" });
        }
        setSearching(false);
        setProgress("");
        return;
      }

      const leads = data?.leads || [];
      if (leads.length === 0) {
        toast({ title: "Nenhum lead encontrado", description: "Tente alterar os filtros.", variant: "destructive" });
        setSearching(false);
        setProgress("");
        return;
      }

      // Deduplicate by CNPJ
      setProgress(`Importando ${leads.length} leads...`);
      const { data: existingLeads } = await supabase
        .from("leads")
        .select("cnpj")
        .not("cnpj", "is", null);

      const existingCnpjs = new Set((existingLeads || []).map(l => l.cnpj).filter(Boolean));

      const newLeads = leads.filter((l: any) => !l.cnpj || !existingCnpjs.has(l.cnpj));
      const duplicates = leads.length - newLeads.length;

      if (newLeads.length > 0) {
        const toInsert = newLeads.map((l: any) => ({
          nome_empresa: l.nome_empresa || "Sem nome",
          cnpj: l.cnpj || null,
          telefone: normalizePhone(l.telefone),
          endereco: l.endereco || null,
          cidade: l.cidade || null,
          nome_decisor: l.nome_decisor || null,
          site: l.site || null,
          fonte: "b2bleads",
          tags: [],
        }));

        await supabase.from("leads").insert(toInsert);
      }

      setImportResult({ imported: newLeads.length, duplicates });
      setShowResultModal(true);
      onImportComplete();
    } catch (e: any) {
      console.error("B2BLeads error:", e);
      toast({ title: "Erro ao buscar leads", description: e.message, variant: "destructive" });
    }

    setSearching(false);
    setProgress("");
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Importar do B2BLeads
          </CardTitle>
          <CardDescription>
            Busque leads segmentados diretamente do b2bleads.com.br
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cookie status */}
          <div className="flex items-center gap-2 text-sm">
            {cookieValid === false ? (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                <AlertCircle className="h-3 w-3 mr-1" /> Cookie expirado
              </Badge>
            ) : cookie ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                <AlertCircle className="h-3 w-3 mr-1" /> Cookie não configurado
              </Badge>
            )}
            {lastValidation && (
              <span className="text-xs text-muted-foreground">
                Última validação: {new Date(lastValidation).toLocaleString("pt-BR")}
              </span>
            )}
            {isStale && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                ⚠️ Validação há mais de 24h
              </Badge>
            )}
          </div>

          {!cookie && (
            <p className="text-xs text-muted-foreground">
              Configure o cookie de sessão em <a href="/settings" className="text-accent hover:underline">Configurações</a> antes de buscar.
            </p>
          )}

          {/* Search form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Ramo de atividade *</label>
              <Input
                placeholder="Ex: academias, esportes, restaurantes..."
                value={ramo}
                onChange={e => setRamo(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Estado *</label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_BR.map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Cidade (opcional)</label>
              <Input
                placeholder="Ex: Curitiba"
                value={cidade}
                onChange={e => setCidade(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Porte</label>
              <Select value={porte} onValueChange={setPorte}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {PORTES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Data abertura — De</label>
              <Input
                type="date"
                value={dataAberturaDE}
                onChange={e => setDataAberturaDE(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Data abertura — Até</label>
              <Input
                type="date"
                value={dataAberturaAte}
                onChange={e => setDataAberturaAte(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Máximo de leads</label>
              <Input
                type="number"
                min={1}
                max={200}
                value={limite}
                onChange={e => setLimite(Math.min(200, Math.max(1, Number(e.target.value))))}
                className="bg-secondary/50"
              />
            </div>
          </div>

          <Button
            onClick={handleSearch}
            disabled={searching || !cookie || !ramo || !estado}
            className="w-full"
          >
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {progress}
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Buscar leads
              </>
            )}
          </Button>

          {searching && (
            <Progress value={undefined} className="h-1" />
          )}
        </CardContent>
      </Card>

      {/* Result modal */}
      <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              Importação concluída
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p><strong>{importResult.imported}</strong> leads importados do B2BLeads</p>
            {importResult.duplicates > 0 && (
              <p className="text-muted-foreground">{importResult.duplicates} leads ignorados (CNPJ já existente)</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
