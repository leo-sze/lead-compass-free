import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Upload, Search, Phone, Building2, User, Trash2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

interface ContactRecord {
  nomeCompleto: string;
  nomeEmpresa: string;
  cidade: string;
  site: string;
  email: string;
  phones: string[];
}

const STORAGE_KEY = "phone-lookup-db-v1";

/** Keep only digits and strip leading 55 country code for matching */
function normalizePhone(raw: string): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d;
}

function parseCsv(file: File): Promise<ContactRecord[]> {
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

interface LookupResult {
  query: string;
  normalized: string;
  match: ContactRecord | null;
}

export default function PhoneLookup() {
  const [records, setRecords] = useState<ContactRecord[]>([]);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [singleQuery, setSingleQuery] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Build O(1) phone index
  const phoneIndex = useMemo(() => {
    const map = new Map<string, ContactRecord>();
    for (const r of records) {
      for (const p of r.phones) {
        if (!map.has(p)) map.set(p, r);
      }
    }
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
        description: "Base muito grande para cache local — recarregue ao reabrir.",
      });
    }
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const recs = await parseCsv(file);
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
      setLoading(false);
    }
  };

  const clearDb = () => {
    setRecords([]);
    setLoadedAt(null);
    setResults([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const lookup = (raw: string): LookupResult => {
    const normalized = normalizePhone(raw);
    let match: ContactRecord | null = phoneIndex.get(normalized) || null;
    if (!match && normalized.length >= 10) {
      // Try without leading 9 (mobile vs fixo variations)
      const ddd = normalized.slice(0, 2);
      const rest = normalized.slice(2);
      const alt = rest.startsWith("9") ? ddd + rest.slice(1) : ddd + "9" + rest;
      match = phoneIndex.get(alt) || null;
    }
    return { query: raw, normalized, match };
  };

  const runSingle = () => {
    if (!singleQuery.trim()) return;
    setResults([lookup(singleQuery)]);
  };

  const runBulk = () => {
    const lines = bulkInput
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    setResults(lines.map(lookup));
  };

  const handleQueryFile = (file: File) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const phones: string[] = [];
        const seen = new Set<string>();
        for (const row of res.data) {
          const cells = Array.isArray(row) ? row : Object.values(row as Record<string, string>);
          for (const cell of cells) {
            const raw = String(cell ?? "").trim();
            const norm = normalizePhone(raw);
            if (norm.length >= 10 && norm.length <= 11 && !seen.has(norm)) {
              seen.add(norm);
              phones.push(raw);
            }
          }
        }
        if (phones.length === 0) {
          toast({ title: "Nenhum telefone encontrado no arquivo", variant: "destructive" });
          return;
        }
        setBulkInput(phones.join("\n"));
        setResults(phones.map(lookup));
        toast({ title: "Lista processada", description: `${phones.length} telefones consultados.` });
      },
      error: (e) => toast({ title: "Erro ao ler CSV", description: e.message, variant: "destructive" }),
    });
  };

  const exportCsv = () => {
    const csv = Papa.unparse(
      results.map((r) => ({
        telefone_consultado: r.query,
        encontrado: r.match ? "sim" : "não",
        nome: r.match?.nomeCompleto || "",
        empresa: r.match?.nomeEmpresa || "",
        cidade: r.match?.cidade || "",
        site: r.match?.site || "",
        email: r.match?.email || "",
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lookup-telefones-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const matchedCount = results.filter((r) => r.match).length;

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Phone className="h-7 w-7 text-primary" />
          Buscar Empresa por Telefone
        </h1>
        <p className="text-muted-foreground mt-1">
          Carregue sua base (CSV Kommo) e consulte qualquer telefone para
          descobrir nome e empresa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Base de Dados
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
              <span className="font-medium">Selecionar arquivo CSV</span>
              <span className="text-sm text-muted-foreground">
                Exportação do Kommo (contatos e empresas)
              </span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                disabled={loading}
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="secondary">{records.length} contatos</Badge>
              <Badge variant="outline">
                {phoneIndex.size} telefones indexados
              </Badge>
              {loadedAt && (
                <span className="text-muted-foreground">
                  Carregado em {new Date(loadedAt).toLocaleString("pt-BR")}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {records.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Consulta individual</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input
                placeholder="Ex: +55 11 99999-9999 ou 11999999999"
                value={singleQuery}
                onChange={(e) => setSingleQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSingle()}
              />
              <Button onClick={runSingle}>
                <Search className="h-4 w-4 mr-1" /> Buscar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consulta em lote</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Cole uma lista de telefones (um por linha, separados por vírgula ou ponto e vírgula)"
                rows={5}
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
              />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={runBulk}>
                  <Search className="h-4 w-4 mr-1" /> Buscar todos
                </Button>
                <label className="inline-flex">
                  <Button variant="outline" asChild>
                    <span className="cursor-pointer">
                      <Upload className="h-4 w-4 mr-1" /> Carregar CSV de telefones
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleQueryFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                O CSV pode ter qualquer formato — todos os valores que parecerem telefone serão consultados.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                Resultados ({matchedCount}/{results.length} encontrados)
              </span>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                Exportar CSV
              </Button>
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
                {results.map((r, i) => (
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
    </div>
  );
}
