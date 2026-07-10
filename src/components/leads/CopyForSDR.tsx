import { ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface CopyForSDRProps {
  leads: Lead[];
}

const CopyForSDR = ({ leads }: CopyForSDRProps) => {
  const { toast } = useToast();

  const eligible = leads.filter(
    (l) => l.telefone && (l.mensagem_personalizada || "").trim(),
  );

  const handleCopy = async () => {
    if (eligible.length === 0) {
      toast({
        title: "Nenhum lead elegível",
        description: "Leads precisam ter telefone e mensagem personalizada gerada.",
        variant: "destructive",
      });
      return;
    }

    const text = eligible
      .map(
        (l) =>
          `${(l.nome_empresa || "").trim()} - ${(l.telefone || "").trim()} - ${(l.mensagem_personalizada || "").trim()}`,
      )
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: `${eligible.length} lead(s) copiados`,
        description: "Formato: Nome - Telefone - Mensagem",
      });
    } catch (e) {
      toast({
        title: "Erro ao copiar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      disabled={eligible.length === 0}
      className="text-accent border-accent/30 hover:bg-accent/10"
    >
      <ClipboardCopy className="h-4 w-4 mr-1" />
      Copiar p/ SDR ({eligible.length})
    </Button>
  );
};

export default CopyForSDR;
