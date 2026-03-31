import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface LeadFiltersProps {
  filter: string;
  onFilterChange: (value: string) => void;
  termos: string[];
  selectedTermo: string;
  onTermoChange: (value: string) => void;
  cidades: string[];
  selectedCidade: string;
  onCidadeChange: (value: string) => void;
  hasPhone: boolean;
  onHasPhoneChange: (value: boolean) => void;
  hasSite: boolean;
  onHasSiteChange: (value: boolean) => void;
  hasInstagram: boolean;
  onHasInstagramChange: (value: boolean) => void;
}

const LeadFilters = ({
  filter, onFilterChange,
  termos, selectedTermo, onTermoChange,
  cidades, selectedCidade, onCidadeChange,
  hasPhone, onHasPhoneChange,
  hasSite, onHasSiteChange,
  hasInstagram, onHasInstagramChange,
}: LeadFiltersProps) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Label className="text-xs text-muted-foreground mb-1">Busca</Label>
          <Input
            placeholder="Filtrar por nome ou endereço..."
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="bg-secondary/50"
          />
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1">Termo de pesquisa</Label>
          <Select value={selectedTermo} onValueChange={onTermoChange}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="Todos os termos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os termos</SelectItem>
              {termos.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1">Cidade</Label>
          <Select value={selectedCidade} onValueChange={onCidadeChange}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="Todas as cidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as cidades</SelectItem>
              {cidades.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={hasPhone} onCheckedChange={(v) => onHasPhoneChange(!!v)} />
          Com telefone
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={hasSite} onCheckedChange={(v) => onHasSiteChange(!!v)} />
          Com site
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={hasInstagram} onCheckedChange={(v) => onHasInstagramChange(!!v)} />
          Com Instagram
        </label>
      </div>
    </div>
  );
};

export default LeadFilters;
