import { useState, useCallback, useRef } from "react";
import { Upload, Search, Download, Phone, AlertCircle, CheckCircle2, MinusCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Contact {
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  website: string;
  city: string;
  state: string;
  country: string;
  workDirectPhone: string;
  mobilePhone: string;
  corporatePhone: string;
  otherPhone: string;
  // enrichment state
  status: "pending" | "searching" | "found" | "not_found" | "has_phone";
  foundPhone?: string;
  // preserve all original columns
  _raw: Record<string, string>;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  
  // Parse header handling quoted fields
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  });
}

function hasPhone(row: Record<string, string>): boolean {
  return !!(
    row["Work Direct Phone"]?.trim() ||
    row["Mobile Phone"]?.trim() ||
    row["Corporate Phone"]?.trim() ||
    row["Other Phone"]?.trim()
  );
}

function rowToContact(row: Record<string, string>): Contact {
  return {
    firstName: row["First Name"] || "",
    lastName: row["Last Name"] || "",
    title: row["Title"] || "",
    companyName: row["Company Name"] || row["Company"] || "",
    website: row["Website"] || "",
    city: row["City"] || "",
    state: row["State"] || "",
    country: row["Country"] || "",
    workDirectPhone: row["Work Direct Phone"] || "",
    mobilePhone: row["Mobile Phone"] || "",
    corporatePhone: row["Corporate Phone"] || "",
    otherPhone: row["Other Phone"] || "",
    status: hasPhone(row) ? "has_phone" : "pending",
    _raw: { ...row },
  };
}

export default function FindContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [summary, setSummary] = useState<{ found: number; notFound: number } | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Check if Google Places API key is configured
  useState(() => {
    supabase.from("settings").select("value").eq("key", "google_places_api_key").maybeSingle()
      .then(({ data }) => setHasApiKey(!!(data?.value)));
  });

  const missingCount = contacts.filter(c => c.status === "pending" || c.status === "searching").length;
  const pendingCount = contacts.filter(c => c.status === "pending").length;

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: "CSV vazio ou inválido", variant: "destructive" });
        return;
      }
      setContacts(rows.map(rowToContact));
      setSummary(null);
    };
    reader.readAsText(file);
  }, [toast]);

  const handleSearch = useCallback(async () => {
    const toEnrich = contacts
      .map((c, i) => ({ ...c, index: i }))
      .filter(c => c.status === "pending");
    
    if (toEnrich.length === 0) return;

    setSearching(true);
    setSummary(null);
    setProgress({ current: 0, total: toEnrich.length });

    let found = 0;
    let notFound = 0;

    // Process in batches of 5
    const BATCH_SIZE = 5;
    for (let b = 0; b < toEnrich.length; b += BATCH_SIZE) {
      const batch = toEnrich.slice(b, b + BATCH_SIZE);
      
      // Mark as searching
      setContacts(prev => {
        const next = [...prev];
        batch.forEach(item => { next[item.index] = { ...next[item.index], status: "searching" }; });
        return next;
      });

      try {
        const { data, error } = await supabase.functions.invoke("find-phone", {
          body: {
            contacts: batch.map(c => ({
              index: c.index,
              companyName: c.companyName,
              city: c.city,
              state: c.state,
            })),
          },
        });

        if (error) throw error;

        const results = data.results as { index: number; phone: string | null }[];
        
        setContacts(prev => {
          const next = [...prev];
          results.forEach(r => {
            if (r.phone) {
              next[r.index] = {
                ...next[r.index],
                status: "found",
                foundPhone: r.phone,
                corporatePhone: r.phone,
                _raw: { ...next[r.index]._raw, "Corporate Phone": r.phone },
              };
              found++;
            } else {
              next[r.index] = { ...next[r.index], status: "not_found" };
              notFound++;
            }
          });
          return next;
        });
      } catch (err: any) {
        console.error("Batch error:", err);
        setContacts(prev => {
          const next = [...prev];
          batch.forEach(item => { next[item.index] = { ...next[item.index], status: "not_found" }; });
          return next;
        });
        notFound += batch.length;
        
        if (err?.message?.includes("API Key")) {
          toast({ title: "API Key não configurada", description: "Vá em Configurações para adicionar sua Google Places API Key.", variant: "destructive" });
          setSearching(false);
          return;
        }
      }

      setProgress({ current: Math.min(b + BATCH_SIZE, toEnrich.length), total: toEnrich.length });
    }

    setSummary({ found, notFound });
    setSearching(false);
  }, [contacts, toast]);

  const handleExport = useCallback(() => {
    if (contacts.length === 0) return;
    
    const headers = Object.keys(contacts[0]._raw);
    const csvRows = [headers.join(",")];
    
    contacts.forEach(c => {
      const row = headers.map(h => {
        const val = c._raw[h] || "";
        return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      });
      csvRows.push(row.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contatos_enriquecidos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [contacts]);

  const statusBadge = (status: Contact["status"]) => {
    switch (status) {
      case "has_phone":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Phone className="h-3 w-3 mr-1" />Tem telefone</Badge>;
      case "found":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Encontrado</Badge>;
      case "not_found":
        return <Badge className="bg-muted text-muted-foreground border-border"><MinusCircle className="h-3 w-3 mr-1" />Não encontrado</Badge>;
      case "searching":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Buscando...</Badge>;
      default:
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30"><AlertCircle className="h-3 w-3 mr-1" />Sem telefone</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Encontrar Contatos</h1>
        <p className="text-muted-foreground text-sm">Importe um CSV do Apollo e encontre telefones automaticamente via Google Places</p>
      </div>

      {contacts.length === 0 ? (
        <Card className="border-dashed border-2 border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Upload className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Importar CSV do Apollo</h3>
            <p className="text-muted-foreground text-sm mb-6 text-center max-w-md">
              Faça upload do arquivo CSV exportado do Apollo.io. O sistema identificará contatos sem telefone e buscará automaticamente.
            </p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            <Button onClick={() => fileRef.current?.click()} size="lg">
              <Upload className="mr-2 h-5 w-5" />
              Selecionar arquivo CSV
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats bar */}
          <div className="flex items-center gap-4 flex-wrap">
            <Badge variant="outline" className="text-sm px-3 py-1">
              {contacts.length} contatos total
            </Badge>
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-sm px-3 py-1">
              {pendingCount} sem telefone
            </Badge>
            {summary && (
              <>
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-sm px-3 py-1">
                  {summary.found} encontrados
                </Badge>
                <Badge className="bg-muted text-muted-foreground text-sm px-3 py-1">
                  {summary.notFound} não encontrados
                </Badge>
              </>
            )}
            
            <div className="flex-1" />
            
            <Button variant="outline" size="sm" onClick={() => { setContacts([]); setSummary(null); }}>
              Novo arquivo
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={contacts.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button onClick={handleSearch} disabled={searching || pendingCount === 0} size="sm">
              {searching ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Buscando {progress.current} de {progress.total}...</>
              ) : (
                <><Search className="mr-2 h-4 w-4" />Encontrar Contatos ({pendingCount})</>
              )}
            </Button>
          </div>

          {/* Progress */}
          {searching && (
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          )}

          {/* Table */}
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c, i) => (
                      <TableRow
                        key={i}
                        className={c.status === "pending" ? "bg-orange-500/5" : undefined}
                      >
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{c.firstName} {c.lastName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.title}</TableCell>
                        <TableCell>{c.companyName}</TableCell>
                        <TableCell className="text-sm">{[c.city, c.state].filter(Boolean).join(", ")}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {c.foundPhone ? (
                            <span className="text-green-400">{c.foundPhone}</span>
                          ) : c.workDirectPhone || c.mobilePhone || c.corporatePhone || c.otherPhone ? (
                            c.workDirectPhone || c.mobilePhone || c.corporatePhone || c.otherPhone
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
