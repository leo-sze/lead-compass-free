import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Instagram, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

type Account = {
  id: string;
  username: string;
  last_post_date: string | null;
  status: "ativo" | "moderado" | "inativo" | "erro";
  last_checked_at: string | null;
  created_at: string;
};

const statusStyle: Record<Account["status"], string> = {
  ativo: "bg-green-500/15 text-green-500 border-green-500/30",
  moderado: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  inativo: "bg-red-500/15 text-red-500 border-red-500/30",
  erro: "bg-muted text-muted-foreground border-border",
};

const statusLabel: Record<Account["status"], string> = {
  ativo: "Ativo",
  moderado: "Moderado",
  inativo: "Inativo",
  erro: "Erro",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function InstagramMonitor() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("instagram_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    else setAccounts((data as Account[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function checkUsername(username: string) {
    setChecking((c) => ({ ...c, [username]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("check-instagram-status", {
        body: { username },
      });
      if (error) throw error;
      toast({
        title: `@${username}`,
        description: `Status: ${statusLabel[(data?.account?.status as Account["status"]) || "erro"]}`,
      });
      await load();
    } catch (e) {
      toast({ title: "Erro na verificação", description: (e as Error).message, variant: "destructive" });
    } finally {
      setChecking((c) => ({ ...c, [username]: false }));
    }
  }

  async function addAccount() {
    const u = newUsername.trim().replace(/^@/, "").toLowerCase();
    if (!u) return;
    setAdding(true);
    setNewUsername("");
    await checkUsername(u);
    setAdding(false);
  }

  async function removeAccount(id: string) {
    const { error } = await supabase.from("instagram_accounts").delete().eq("id", id);
    if (error) toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    else await load();
  }

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Instagram className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold font-mono">Monitor de Instagram</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a atividade de perfis com base no último post.
          </p>
        </div>
      </div>

      <Card className="p-4 mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addAccount();
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="username do Instagram (sem @)"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            disabled={adding}
          />
          <Button type="submit" disabled={adding || !newUsername.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-2">Adicionar e verificar</span>
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 border-b bg-muted/40 text-xs uppercase text-muted-foreground font-medium">
          <div>Username</div>
          <div>Status</div>
          <div>Último post</div>
          <div>Verificado em</div>
          <div className="w-24 text-right">Ações</div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando…
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma conta cadastrada. Adicione um username acima.
          </div>
        ) : (
          accounts.map((a) => {
            const d = daysSince(a.last_post_date);
            return (
              <div
                key={a.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 border-b last:border-0 items-center text-sm"
              >
                <a
                  href={`https://instagram.com/${a.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono hover:text-primary"
                >
                  @{a.username}
                </a>
                <Badge variant="outline" className={statusStyle[a.status]}>
                  {statusLabel[a.status]}
                </Badge>
                <div className="text-muted-foreground whitespace-nowrap">
                  {a.last_post_date ? (
                    <>
                      {formatDate(a.last_post_date)}
                      {d !== null && <span className="ml-1 text-xs">({d}d)</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="text-muted-foreground whitespace-nowrap">
                  {formatDate(a.last_checked_at)}
                </div>
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => checkUsername(a.username)}
                    disabled={checking[a.username]}
                    title="Verificar agora"
                  >
                    {checking[a.username] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeAccount(a.id)}
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
