import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface LeadFiltersProps {
  filter: string;
  onFilterChange: (value: string) => void;
  termos: string[];
  selectedTermo: string;
  onTermoChange: (value: string) => void;
  cidades: string[];
  selectedCidade: string;
  onCidadeChange: (value: string) => void;
  fontes: string[];
  selectedFonte: string;
  onFonteChange: (value: string) => void;
  hasPhone: boolean;
  onHasPhoneChange: (value: boolean) => void;
  noPhone: boolean;
  onNoPhoneChange: (value: boolean) => void;
  hasSite: boolean;
  onHasSiteChange: (value: boolean) => void;
  hasInstagram: boolean;
  onHasInstagramChange: (value: boolean) => void;
  hasDecisor: boolean;
  onHasDecisorChange: (value: boolean) => void;
  noDecisor: boolean;
  onNoDecisorChange: (value: boolean) => void;
  kommoImported: boolean;
  onKommoImportedChange: (value: boolean) => void;
  kommoNotImported: boolean;
  onKommoNotImportedChange: (value: boolean) => void;
  hasMessage: boolean;
  onHasMessageChange: (value: boolean) => void;
  noMessage: boolean;
  onNoMessageChange: (value: boolean) => void;
  dateFrom: Date | undefined;
  onDateFromChange: (value: Date | undefined) => void;
  dateTo: Date | undefined;
  onDateToChange: (value: Date | undefined) => void;
}
const LeadFilters = ({
  filter, onFilterChange,
  termos, selectedTermo, onTermoChange,
  cidades, selectedCidade, onCidadeChange,
  fontes, selectedFonte, onFonteChange,
  hasPhone, onHasPhoneChange,
  noPhone, onNoPhoneChange,
  hasSite, onHasSiteChange,
  hasInstagram, onHasInstagramChange,
  hasDecisor, onHasDecisorChange,
  noDecisor, onNoDecisorChange,
  kommoImported, onKommoImportedChange,
  kommoNotImported, onKommoNotImportedChange,
  hasMessage, onHasMessageChange,
  noMessage, onNoMessageChange,
  dateFrom, onDateFromChange,
  dateTo, onDateToChange,
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
        <div className="min-w-[150px]">
          <Label className="text-xs text-muted-foreground mb-1">Data de</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-secondary/50", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Início"}
                {dateFrom && <X className="ml-auto h-3 w-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); onDateFromChange(undefined); }} />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={onDateFromChange} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
        <div className="min-w-[150px]">
          <Label className="text-xs text-muted-foreground mb-1">Data até</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-secondary/50", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fim"}
                {dateTo && <X className="ml-auto h-3 w-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); onDateToChange(undefined); }} />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={onDateToChange} initialFocus className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
      </div>
        <div className="min-w-[140px]">
          <Label className="text-xs text-muted-foreground mb-1">Fonte</Label>
          <Select value={selectedFonte} onValueChange={onFonteChange}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="Todas as fontes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fontes</SelectItem>
              {fontes.map((f) => (
                <SelectItem key={f} value={f}>{f === "google" ? "Google Maps" : f === "linkedin" ? "LinkedIn" : f === "Apollo CSV" ? "Lista" : f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={hasPhone} onCheckedChange={(v) => { onHasPhoneChange(!!v); if (v) onNoPhoneChange(false); }} />
          Com telefone
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={noPhone} onCheckedChange={(v) => { onNoPhoneChange(!!v); if (v) onHasPhoneChange(false); }} />
          Sem telefone
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={hasSite} onCheckedChange={(v) => onHasSiteChange(!!v)} />
          Com site
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={hasInstagram} onCheckedChange={(v) => onHasInstagramChange(!!v)} />
          Com Instagram
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={hasDecisor} onCheckedChange={(v) => { onHasDecisorChange(!!v); if (v) onNoDecisorChange(false); }} />
          Com decisor
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={noDecisor} onCheckedChange={(v) => { onNoDecisorChange(!!v); if (v) onHasDecisorChange(false); }} />
          Sem decisor
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={kommoImported} onCheckedChange={(v) => { onKommoImportedChange(!!v); if (v) onKommoNotImportedChange(false); }} />
          Importado para Kommo
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={kommoNotImported} onCheckedChange={(v) => { onKommoNotImportedChange(!!v); if (v) onKommoImportedChange(false); }} />
          Não importado Kommo
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={hasMessage} onCheckedChange={(v) => { onHasMessageChange(!!v); if (v) onNoMessageChange(false); }} />
          Com mensagem
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={noMessage} onCheckedChange={(v) => { onNoMessageChange(!!v); if (v) onHasMessageChange(false); }} />
          Sem mensagem
        </label>
      </div>
    </div>
  );
};

export default LeadFilters;
