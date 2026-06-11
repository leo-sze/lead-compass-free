import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  Upload,
  Search,
  Phone,
  Building2,
  User,
  Trash2,
  FileSpreadsheet,
  Globe,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ContactRecord {
  nomeCompleto: string;
  nomeEmpresa: string;
  cidade: string;
  site: string;
  email: string;
  phones: string[];
}

const STORAGE_KEY = "phone-lookup-db-v1";

function normalizePhone(raw: string): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d;
}

function parseKommoCsv(file: File): Promise<ContactRecord[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const records: ContactRecord[] = res.data.map((row) => {
          const phoneFields = [
            row["Telefone comercial"],
            row["Tel. direto com."],
            row["Celular"],
            row["Faz"],
            row["Telefone residencial"],
            row["Outro telefone"],
          ];
          const phones = phoneFields
            .filter(Boolean)
            .map((p) => normalizePhone(String(p)))
            .filter((p) => p.length >= 10);
          return {
            nomeCompleto: row["Nome completo"] || "",
            nomeEmpresa: row["Nome da empresa"] || "",
            cidade: row["Cidade"] || "",
            site: row["Site"] || "",
            email: row["Email comercial"] || row["Email pessoal"] || "",
            phones,
          };
        });
        resolve(records);
      },
      error: reject,
    });
  });
}

function extractPhonesFromCsv(
  file: File
): Promise<{ raw: string; normalized: string }[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const out: { raw: string; normalized: string }[] = [];
        const seen = new Set<string>();
        for (const row of res.data) {
          const cells = Array.isArray(row)
            ? row
            : Object.values(row as Record<string, string>);
          for (const cell of cells) {
            const raw = String(cell ?? "").trim();
            const norm = normalizePhone(raw);
            if (norm.length >= 10 && norm.length <= 11 && !seen.has(norm)) {
              seen.add(norm);
              out.push({ raw, normalized: norm });
            }
          }
        }
        resolve(out);
      },
      error: reject,
    });
  });
}

interface OnlineResult {
  query: string;
  phone: string;
  company: string | null;
  source: string | null;
  snippet: string | null;
}

interface DbResult {
  query: string;
  normalized: string;
  match: ContactRecord | null;
}

export default function PhoneLookup() {
  const [tab, setTab] = useState<"online" | "db">("online");

  // ONLINE state
  const [onlineInput, setOnlineInput] = useState("");
  const [onlineResults, setOnlineResults] = useState<OnlineResult[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // DB state
  const [records, setRecords] = useState<ContactRecord[]>([]);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [dbBulk, setDbBulk] = useState("");
  const [dbResults, setDbResults] = useState<DbResult[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  const phoneIndex = useMemo(() => {
    const map = new Map<string, ContactRecord>();
    for (const r of records)
      for (const p of r.phones) if (!map.has(p)) map.set(p, r);
    return map;
  }, [records]);

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setRecords(parsed.records || []);
        setLoadedAt(parsed.loadedAt || null);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // ===== ONLINE =====
  const collectFromText = (text: string) => {
    const out: { raw: string; normalized: string }[] = [];
    const seen = new Set<string>();
    for (const line of text.split(/[\n,;]+/)) {
      const raw = line.trim();
      if (!raw) continue;
      const norm = normalizePhone(raw);
      if (norm.length >= 10 && norm.length <= 11 && !seen.has(norm)) {
        seen.add(norm);
        out.push({ raw, normalized: norm });
      }
    }
    return out;
  };

  const runOnline = async (phones: { raw: string; normalized: string }[]) => {
    if (phones.length === 0) {
      toast({
        title: "Nenhum telefone válido encontrado",
        variant: "destructive",
      });
      return;
    }
    if (phones.length > 50) {
      toast({
        title: "Lista grande",
        description: `Processando apenas os primeiros 50 de ${phones.length}.`,
      });
      phones = phones.slice(0, 50);
    }
    setOnlineLoading(true);
    setOnlineResults([]);
    setProgress({ done: 0, total: phones.length });

    const BATCH = 5;
    const all: OnlineResult[] = [];
    try {
      for (let i = 0; i < phones.length; i += BATCH) {
        const batch = phones.slice(i, i + BATCH);
        const { data, error } = await supabase.functions.invoke(
          "phone-to-company",
          {
            body: {
              items: batch.map((p) => ({ query: p.raw, phone: p.normalized })),
            },
          }
        );
        if (error) throw error;
        const results: OnlineResult[] = data?.results || [];
        all.push(...results);
        setOnlineResults([...all]);
        setProgress({
          done: Math.min(i + BATCH, phones.length),
          total: phones.length,
        });
      }
      const found = all.filter((r) => r.company).length;
      toast({
        title: "Busca concluída",
        description: `${found}/${all.length} empresas identificadas.`,
      });
    } catch (e) {
      toast({
        title: "Erro na busca",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setOnlineLoading(false);
    }
  };

  const handleOnlineFile = async (file: File) => {
    const phones = await extractPhonesFromCsv(file);
    setOnlineInput(phones.map((p) => p.raw).join("\n"));
    runOnline(phones);
  };

  const exportOnline = () => {
    const csv = Papa.unparse(
      onlineResults.map((r) => ({
        telefone: r.query,
        empresa: r.company || "",
        fonte: r.source || "",
        descricao: r.snippet || "",
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `empresas-por-telefone-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== DB =====
  const persist = (recs: ContactRecord[]) => {
    const stamp = new Date().toISOString();
    setRecords(recs);
    setLoadedAt(stamp);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ records: recs, loadedAt: stamp })
      );
    } catch {
      toast({
        title: "Aviso",
        description: "Base muito grande para cache local.",
      });
    }
  };

  const handleDbFile = async (file: File) => {
    setDbLoading(true);
    try {
      const recs = await parseKommoCsv(file);
      persist(recs);
      toast({
        title: "Base carregada",
        description: `${recs.length} contatos importados.`,
      });
    } catch (e) {
      toast({
        title: "Erro ao ler CSV",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setDbLoading(false);
    }
  };

  const clearDb = () => {
    setRecords([]);
    setLoadedAt(null);
    setDbResults([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const dbLookup = (raw: string): DbResult => {
    const normalized = normalizePhone(raw);
    let match: ContactRecord | null = phoneIndex.get(normalized) || null;
    if (!match && normalized.length >= 10) {
      const ddd = normalized.slice(0, 2);
      const rest = normalized.slice(2);
      const alt = rest.startsWith("9")
        ? ddd + rest.slice(1)
        : ddd + "9" + rest;
      match = phoneIndex.get(alt) || null;
    }
    return { query: raw, normalized, match };
  };

  const runDb = () => {
    const lines = dbBulk
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    setDbResults(lines.map(dbLookup));
  };

  const handleDbQueryFile = (file: File) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const phones: string[] = [];
        const seen = new Set<string>();
        for (const row of res.data) {
          const cells = Array.isArray(row)
            ? row
            : Object.values(row as Record<string, string>);
          for (const cell of cells) {
            const raw = String(cell ?? "").trim();
            const norm = normalizePhone(raw);
            if (norm.length >= 10 && norm.length <= 11 && !seen.has(norm)) {
              seen.add(norm);
              phones.push(raw);
            }
          }
        }
        if (!phones.length) {
          toast({
            title: "Nenhum telefone encontrado",
            variant: "destructive",
          });
          return;
        }
        setDbBulk(phones.join("\n"));
        setDbResults(phones.map(dbLookup));
      },
    });
  };

  const onlineFound = onlineResults.filter((r) => r.company).length;
  const dbFound = dbResults.filter((r) => r.match).length;

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Phone className="h-7 w-7 text-primary" />
          Buscar Empresa por Telefone
        </h1>
        <p className="text-muted-foreground mt-1">
          Suba uma lista de telefones e descubra o nome da empresa — busca
          online (Google) ou na sua base CSV Kommo.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "online" | "db")}>
        <TabsList>
          <TabsTrigger value="online">
            <Globe className="h-4 w-4 mr-1" /> Buscar online
          </TabsTrigger>
          <TabsTrigger value="db">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Buscar na minha base
          </TabsTrigger>
        </TabsList>

        {/* ONLINE */}
        <TabsContent value="online" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lista de telefones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={
                  "Cole telefones — um por linha\nEx:\n41 99999-1234\n(11) 3000-2000\n+55 21 3322-1100"
                }
                rows={6}
                value={onlineInput}
                onChange={(e) => setOnlineInput(e.target.value)}
                disabled={onlineLoading}
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => runOnline(collectFromText(onlineInput))}
                  disabled={onlineLoading}
                >
                  {onlineLoading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-1" />
                  )}
                  Buscar empresas
                </Button>
                <label className="inline-flex">
                  <Button variant="outline" asChild disabled={onlineLoading}>
                    <span className="cursor-pointer">
                      <Upload className="h-4 w-4 mr-1" /> Carregar CSV
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    disabled={onlineLoading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleOnlineFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Máximo 50 telefones por busca. Cada número é pesquisado no
                Google para identificar a empresa pelos sites onde aparece.
              </p>
              {onlineLoading && progress.total > 0 && (
                <div className="space-y-1">
                  <Progress
                    value={(progress.done / progress.total) * 100}
                  />
                  <p className="text-xs text-muted-foreground">
                    Processando {progress.done}/{progress.total}…
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {onlineResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>
                    Resultados ({onlineFound}/{onlineResults.length}{" "}
                    identificados)
                  </span>
                  <Button variant="outline" size="sm" onClick={exportOnline}>
                    Exportar CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Empresa identificada</TableHead>
                      <TableHead>Fonte</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onlineResults.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">
                          {r.query}
                        </TableCell>
                        <TableCell>
                          {r.company ? (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              {r.company}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {r.snippet && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {r.snippet}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.source ? (
                            <a
                              href={r.source}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline text-xs flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {(() => {
                                try {
                                  return new URL(r.source).hostname;
                                } catch {
                                  return r.source;
                                }
                              })()}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {r.company ? (
                            <Badge variant="default">Encontrado</Badge>
                          ) : (
                            <Badge variant="secondary">Não encontrado</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DB */}
        <TabsContent value="db" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" /> Base de Dados (Kommo)
                </span>
                {records.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearDb}>
                    <Trash2 className="h-4 w-4 mr-1" /> Limpar
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {records.length === 0 ? (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/40 transition">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="font-medium">
                    Selecionar CSV do Kommo
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleDbFile(f);
                    }}
                    disabled={dbLoading}
                  />
                </label>
              ) : (
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <Badge variant="secondary">{records.length} contatos</Badge>
                  <Badge variant="outline">
                    {phoneIndex.size} telefones indexados
                  </Badge>
                  {loadedAt && (
                    <span className="text-muted-foreground">
                      Carregado em{" "}
                      {new Date(loadedAt).toLocaleString("pt-BR")}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {records.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Consulta em lote</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Cole uma lista de telefones (um por linha)"
                  rows={5}
                  value={dbBulk}
                  onChange={(e) => setDbBulk(e.target.value)}
                />
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={runDb}>
                    <Search className="h-4 w-4 mr-1" /> Buscar todos
                  </Button>
                  <label className="inline-flex">
                    <Button variant="outline" asChild>
                      <span className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-1" /> Carregar CSV
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleDbQueryFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </CardContent>
            </Card>
          )}

          {dbResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Resultados ({dbFound}/{dbResults.length} encontrados)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dbResults.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">
                          {r.query}
                        </TableCell>
                        <TableCell>
                          {r.match?.nomeCompleto ? (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {r.match.nomeCompleto}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.match?.nomeEmpresa ? (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              {r.match.nomeEmpresa}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{r.match?.cidade || "—"}</TableCell>
                        <TableCell>
                          {r.match ? (
                            <Badge variant="default">Encontrado</Badge>
                          ) : (
                            <Badge variant="secondary">Não encontrado</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
