import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface LeadFiltersProps {
  filter: string;
  onFilterChange: (value: string) => void;
  origins: string[];
  selectedOrigin: string;
  onOriginChange: (value: string) => void;
  hasPhone: boolean;
  onHasPhoneChange: (value: boolean) => void;
  hasSite: boolean;
  onHasSiteChange: (value: boolean) => void;
  hasInstagram: boolean;
  onHasInstagramChange: (value: boolean) => void;
}

const LeadFilters = ({
  filter, onFilterChange,
  origins, selectedOrigin, onOriginChange,
  hasPhone, onHasPhoneChange,
  hasSite, onHasSiteChange,
  hasInstagram, onHasInstagramChange,
}: LeadFiltersProps) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px] max-w-md">
          <Label className="text-xs text-muted-foreground mb-1">Busca</Label>
          <Input
            placeholder="Filtrar por nome, origem ou endereço..."
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="bg-secondary/50"
          />
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1">Origem</Label>
          <Select value={selectedOrigin} onValueChange={onOriginChange}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="Todas as origens" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              {origins.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
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
