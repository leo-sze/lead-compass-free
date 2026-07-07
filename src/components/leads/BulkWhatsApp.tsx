import { useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface BulkWhatsAppProps {
  leads: Lead[];
  onSent?: (leadIds: string[]) => void;
}

const BulkWhatsApp = ({ leads, onSent }: BulkWhatsAppProps) => {
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const eligible = leads.filter((l) => l.telefone && (l.mensagem_personalizada || "").trim());
  const missingMsg = leads.filter((l) => l.telefone && !(l.mensagem_personalizada || "").trim()).length;
  const missingPhone = leads.filter((l) => !l.telefone).length;

  const sendBulk = async () => {
    if (eligible.length === 0) {
      toast({
        title: "Nenhum lead elegível",
        description: "Leads precisam ter telefone e mensagem personalizada gerada.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    setProgress(10);

    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-via-kommo", {
        body: {
          leads: eligible.map((l) => ({
            id: l.id,
            telefone: l.telefone,
            nome_empresa: l.nome_empresa,
            mensagem_personalizada: l.mensagem_personalizada,
          })),
        },
      });
      setProgress(100);
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const results: Array<{ id: string; status: string; error?: string }> = (data as any)?.results || [];
      const ok = results.filter((r) => r.status === "success");
      const err = results.filter((r) => r.status === "error");
      const skipped = results.filter((r) => r.status === "skipped");

      toast({
        title: `${ok.length} mensagens disparadas via Kommo`,
        description: [
          err.length ? `${err.length} com erro` : null,
          skipped.length ? `${skipped.length} puladas` : null,
          missingMsg ? `${missingMsg} sem mensagem IA` : null,
          missingPhone ? `${missingPhone} sem telefone` : null,
        ].filter(Boolean).join(" · ") || undefined,
        variant: err.length ? "destructive" : "default",
      });

      if (ok.length && onSent) onSent(ok.map((r) => r.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Falha ao enviar via Kommo", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={sendBulk}
        disabled={sending || eligible.length === 0}
        className="text-green-400 border-green-400/30 hover:bg-green-400/10"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <MessageCircle className="h-4 w-4 mr-1" />
        )}
        Enviar WhatsApp via Kommo ({eligible.length})
      </Button>
      {sending && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">Disparando via Kommo...</p>
        </div>
      )}
    </div>
  );
};

export default BulkWhatsApp;
