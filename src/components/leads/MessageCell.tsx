import { useState } from "react";
import { MessageSquare, Copy, RefreshCw, Loader2, Edit2, Check, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MessageCellProps {
  lead: any;
  onUpdate: (patch: any) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  gerada: { label: "Gerada", className: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  editada: { label: "Editada", className: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  enviada: { label: "Enviada", className: "bg-green-500/10 text-green-400 border-green-500/30" },
};

const MessageCell = ({ lead, onUpdate }: MessageCellProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(lead.mensagem_personalizada || "");
  const [busy, setBusy] = useState(false);

  const msg: string | null = lead.mensagem_personalizada || null;
  const status: string | null = lead.mensagem_status || null;

  const generate = async (regenerate = false) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-personalized-message", {
        body: { lead_id: lead.id, regenerate },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
      const patch = {
        mensagem_personalizada: data.mensagem,
        mensagem_pontos_usados: data.pontos_usados,
        mensagem_status: "gerada",
        mensagem_gerada_em: new Date().toISOString(),
      };
      onUpdate(patch);
      setDraft(data.mensagem);
      toast({ title: regenerate ? "Mensagem regenerada" : "Mensagem gerada" });
    } catch (e: any) {
      toast({ title: "Erro ao gerar mensagem", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!msg) return;
    await navigator.clipboard.writeText(msg);
    toast({ title: "Mensagem copiada" });
  };

  const saveEdit = async () => {
    const patch = { mensagem_personalizada: draft, mensagem_status: "editada" };
    const { error } = await supabase.from("leads").update(patch).eq("id", lead.id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    onUpdate(patch);
    setEditing(false);
    toast({ title: "Mensagem atualizada" });
  };

  const markSent = async () => {
    const patch = { mensagem_status: "enviada" };
    await supabase.from("leads").update(patch).eq("id", lead.id);
    onUpdate(patch);
  };

  if (!msg) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => generate(false)}
        disabled={busy}
        className="h-7 text-xs text-muted-foreground hover:text-accent"
      >
        {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <MessageSquare className="h-3 w-3 mr-1" />}
        Gerar
      </Button>
    );
  }

  const sc = status ? statusConfig[status] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex flex-col gap-1 cursor-pointer max-w-[220px]">
          {sc && <Badge variant="outline" className={`${sc.className} text-[10px] w-fit`}>{sc.label}</Badge>}
          <p className="text-xs text-muted-foreground line-clamp-2">{msg}</p>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-3" side="left">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold">Mensagem de prospecção</p>
          {sc && <Badge variant="outline" className={`${sc.className} text-[10px]`}>{sc.label}</Badge>}
        </div>
        {editing ? (
          <>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              rows={6}
              className="text-xs mb-2"
            />
            <p className="text-[10px] text-muted-foreground mb-2">{draft.length}/400 caracteres</p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(msg); }}>
                <X className="h-3 w-3 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={saveEdit}>
                <Check className="h-3 w-3 mr-1" /> Salvar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed whitespace-pre-wrap mb-3 bg-secondary/40 rounded p-2 border border-border/50">{msg}</p>
            {Array.isArray(lead.mensagem_pontos_usados) && lead.mensagem_pontos_usados.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Pontos usados:</p>
                <ul className="text-[10px] text-muted-foreground space-y-0.5">
                  {lead.mensagem_pontos_usados.map((p: string, i: number) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-1 justify-end">
              <Button size="sm" variant="ghost" onClick={copy}>
                <Copy className="h-3 w-3 mr-1" /> Copiar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Edit2 className="h-3 w-3 mr-1" /> Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => generate(true)} disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Regenerar
              </Button>
              {status !== "enviada" && (
                <Button size="sm" variant="ghost" onClick={markSent} className="text-green-400">
                  <Check className="h-3 w-3 mr-1" /> Marcar enviada
                </Button>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default MessageCell;
