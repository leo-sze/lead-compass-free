import { Globe, Linkedin, Zap, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto mt-16">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
          <Zap className="h-4 w-4" />
          LeadExtract — Extrator B2B
        </div>
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Escolha sua fonte de prospecção
        </h1>
        <p className="text-muted-foreground text-lg">
          Google Maps para empresas locais. LinkedIn para decisores e contatos-chave.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card
          className="border-border/50 bg-card/80 backdrop-blur cursor-pointer hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all group"
          onClick={() => navigate("/google-search")}
        >
          <CardContent className="p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto">
              <Globe className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">Google Maps</h2>
            <p className="text-muted-foreground text-sm">
              Busque empresas por nicho e cidade. Extraia telefone, site, endereço e redes sociais.
            </p>
            <p className="text-xs text-muted-foreground/70">Estilo GLeads</p>
            <div className="flex items-center justify-center text-primary text-sm font-medium gap-1 group-hover:gap-2 transition-all">
              Iniciar busca <ArrowRight className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-border/50 bg-card/80 backdrop-blur cursor-pointer hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all group"
          onClick={() => navigate("/linkedin-search")}
        >
          <CardContent className="p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 mx-auto">
              <Linkedin className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">LinkedIn</h2>
            <p className="text-muted-foreground text-sm">
              Busque decisores por cargo, setor e localização. Nome, empresa e perfil LinkedIn.
            </p>
            <p className="text-xs text-muted-foreground/70">Estilo Apollo / Lusha</p>
            <div className="flex items-center justify-center text-blue-400 text-sm font-medium gap-1 group-hover:gap-2 transition-all">
              Iniciar busca <ArrowRight className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
