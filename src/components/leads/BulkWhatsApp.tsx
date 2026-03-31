import { useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface BulkWhatsAppProps {
  leads: Lead[];
  template: string;
}

const BulkWhatsApp = ({ leads, template }: BulkWhatsAppProps) => {
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const { toast } = useToast();

  const withPhone = leads.filter((l) => l.telefone);

  const sendBulk = async () => {
    if (withPhone.length === 0) {
      toast({ title: "Nenhum lead selecionado possui telefone", variant: "destructive" });
      return;
    }

    setSending(true);
    setProgress(0);
    setCurrent(0);

    let sent = 0;
    for (const lead of withPhone) {
      const phone = lead.telefone!.replace(/\D/g, "");
      const msg = template
        .replace(/{nome_empresa}/g, lead.nome_empresa)
        .replace(/{telefone}/g, lead.telefone || "")
        .replace(/{endereco}/g, lead.endereco || "");

      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
      sent++;
      setCurrent(sent);
      setProgress(Math.round((sent / withPhone.length) * 100));

      // Delay between each to avoid browser blocking popups
      if (sent < withPhone.length) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    toast({ title: `${sent} mensagens abertas no WhatsApp!` });
    setSending(false);
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={sendBulk}
        disabled={sending || withPhone.length === 0}
        className="text-green-400 border-green-400/30 hover:bg-green-400/10"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <MessageCircle className="h-4 w-4 mr-1" />
        )}
        WhatsApp em massa ({withPhone.length})
      </Button>
      {sending && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            Enviando {current}/{withPhone.length}...
          </p>
        </div>
      )}
    </div>
  );
};

export default BulkWhatsApp;
