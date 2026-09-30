import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CalendarIcon, Check, ChevronsUpDown, Search, SlidersHorizontal, X } from "lucide-react";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  activeChips, DEFAULTS, popoverFilterCount,
  type LeadFilterState, type Period, type StageFilter, type Temp, type Tri,
} from "@/hooks/useLeadFilters";

interface BarProps {
  state: LeadFilterState;
  set: (p: Partial<LeadFilterState>) => void;
  cidades: string[]; termos: string[]; fontes: string[];
}

const fonteLabel = (f: string) => (f === "google" ? "Google Maps" : f === "linkedin" ? "LinkedIn" : f === "Apollo CSV" ? "Lista" : f);

function TriControl({ label, value, onChange, yes = "Com", no = "Sem" }: { label: string; value: Tri; onChange: (v: Tri) => void; yes?: string; no?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <ToggleGroup type="single" size="sm" value={value} onValueChange={(v) => v && onChange(v as Tri)} className="bg-secondary/40 rounded-md p-0.5">
        <ToggleGroupItem value="any" className="h-7 px-2 text-xs">Qualquer</ToggleGroupItem>
        <ToggleGroupItem value="yes" className="h-7 px-2 text-xs">{yes}</ToggleGroupItem>
        <ToggleGroupItem value="no" className="h-7 px-2 text-xs">{no}</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

function CitySelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between bg-secondary/50 font-normal">
          {value || "Todas as cidades"} <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[260px]" align="start">
        <Command>
          <CommandInput placeholder="Buscar cidade..." />
          <CommandList>
            <CommandEmpty>Nenhuma cidade.</CommandEmpty>
            <CommandItem onSelect={() => { onChange(""); setOpen(false); }}>Todas as cidades</CommandItem>
            {options.map((c) => (
              <CommandItem key={c} value={c} onSelect={() => { onChange(c); setOpen(false); }}>
                <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")} /> {c}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FiltersPanel({ state, onApply, cidades, termos, fontes, onClose }: Omit<BarProps, "set"> & { onApply: (p: Partial<LeadFilterState>) => void; onClose: () => void }) {
  const [d, setD] = useState<LeadFilterState>(state);
  useEffect(() => setD(state), [state]);
  const u = (p: Partial<LeadFilterState>) => setD((x) => ({ ...x, ...p }));
  return (
    <div className="space-y-5 p-4 max-h-[75vh] overflow-y-auto">
      <section className="space-y-2">
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground">Origem</h4>
        <div><Label className="text-xs text-muted-foreground">Cidade</Label><CitySelect value={d.cidade} options={cidades} onChange={(v) => u({ cidade: v })} /></div>
        <div>
          <Label className="text-xs text-muted-foreground">Termo de pesquisa</Label>
          <Select value={d.termo || "all"} onValueChange={(v) => u({ termo: v === "all" ? "" : v })}>
            <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os termos</SelectItem>{termos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Fonte</Label>
          <Select value={d.fonte || "all"} onValueChange={(v) => u({ fonte: v === "all" ? "" : v })}>
            <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todas as fontes</SelectItem>{fontes.map((f) => <SelectItem key={f} value={f}>{fonteLabel(f)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </section>
      <section className="space-y-2">
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground">Dados do lead</h4>
        <TriControl label="Telefone" value={d.phone} onChange={(v) => u({ phone: v })} />
        <TriControl label="Site" value={d.site} onChange={(v) => u({ site: v })} />
        <TriControl label="Instagram" value={d.ig} onChange={(v) => u({ ig: v })} />
        <TriControl label="Decisor" value={d.decisor} onChange={(v) => u({ decisor: v })} />
      </section>
      <section className="space-y-2">
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground">Status</h4>
        <TriControl label="Exportado" value={d.exported} onChange={(v) => u({ exported: v })} yes="Sim" no="Não" />
        <TriControl label="Mensagem" value={d.msg} onChange={(v) => u({ msg: v })} yes="Gerada" no="Não gerada" />
        <div>
          <Label className="text-xs text-muted-foreground">Etapa do enriquecimento</Label>
          <Select value={d.stage || "all"} onValueChange={(v) => u({ stage: (v === "all" ? "" : v) as StageFilter })}>
            <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer</SelectItem>
              <SelectItem value="pending">Não iniciados</SelectItem>
              <SelectItem value="stopped1">Parou na Etapa 1</SelectItem>
              <SelectItem value="stopped2">Parou na Etapa 2</SelectItem>
              <SelectItem value="stopped3">Parou na Etapa 3</SelectItem>
              <SelectItem value="error">Com erro</SelectItem>
              <SelectItem value="complete">Concluídos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center justify-between text-sm pt-1">
          Mostrar só incompletos
          <Switch checked={d.incompletos} onCheckedChange={(v) => u({ incompletos: v })} />
        </label>
      </section>
      <div className="flex justify-between pt-2 border-t border-border/50">
        <Button variant="ghost" size="sm" onClick={() => {
          const reset = { ...DEFAULTS, q: state.q, temp: state.temp, period: state.period, from: state.from, to: state.to };
          setD(reset); onApply(reset); onClose();
        }}>Limpar</Button>
        <Button size="sm" onClick={() => { onApply(d); onClose(); }}>Aplicar</Button>
      </div>
    </div>
  );
}

function PeriodPicker({ state, set }: Pick<BarProps, "state" | "set">) {
  const [open, setOpen] = useState(false);
  const from = state.from ? new Date(state.from + "T00:00:00") : undefined;
  const to = state.to ? new Date(state.to + "T00:00:00") : undefined;
  const label = { "": "Todo o período", today: "Hoje", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", month: "Este mês", custom: from ? `${format(from, "dd/MM")} – ${to ? format(to, "dd/MM") : "…"}` : "Personalizado" }[state.period];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="bg-secondary/50 font-normal"><CalendarIcon className="h-4 w-4 mr-2" />{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 min-w-[120px]">
            {(["", "today", "7d", "30d", "month", "custom"] as Period[]).map((p) => (
              <Button key={p || "all"} size="sm" variant={state.period === p ? "secondary" : "ghost"} className="justify-start"
                onClick={() => { set({ period: p, ...(p !== "custom" ? { from: "", to: "" } : {}) }); if (p !== "custom") setOpen(false); }}>
                {{ "": "Tudo", today: "Hoje", "7d": "7 dias", "30d": "30 dias", month: "Este mês", custom: "Personalizado" }[p]}
              </Button>
            ))}
          </div>
          {state.period === "custom" && (
            <Calendar mode="range" selected={{ from, to }} numberOfMonths={1} className="p-2 pointer-events-auto"
              onSelect={(r) => set({ from: r?.from ? format(r.from, "yyyy-MM-dd") : "", to: r?.to ? format(r.to, "yyyy-MM-dd") : "" })} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function LeadsFilterBar({ state, set, cidades, termos, fontes }: BarProps) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState(state.q);
  const [open, setOpen] = useState(false);
  useEffect(() => setQ(state.q), [state.q]);
  useEffect(() => {
    const t = setTimeout(() => { if (q !== state.q) set({ q }); }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = popoverFilterCount(state);
  const trigger = (
    <Button variant="outline" className="bg-secondary/50">
      <SlidersHorizontal className="h-4 w-4 mr-2" /> Filtros
      {count > 0 && <Badge className="ml-2 h-5 px-1.5">{count}</Badge>}
    </Button>
  );
  const panel = <FiltersPanel state={state} onApply={set} cidades={cidades} termos={termos} fontes={fontes} onClose={() => setOpen(false)} />;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative flex-1 min-w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, endereço, telefone ou CNPJ..." className="pl-9 bg-secondary/50" />
      </div>
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}><DrawerTrigger asChild>{trigger}</DrawerTrigger><DrawerContent>{panel}</DrawerContent></Drawer>
      ) : (
        <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent className="w-[380px] p-0" align="end">{panel}</PopoverContent></Popover>
      )}
      <PeriodPicker state={state} set={set} />
    </div>
  );
}

export function TemperatureTabs({ value, counts, onChange }: { value: Temp; counts: Record<Temp, number>; onChange: (t: Temp) => void }) {
  const tabs: { v: Temp; l: string }[] = [
    { v: "all", l: "Todos" }, { v: "quente", l: "🔥 Quente" }, { v: "morno", l: "Morno" },
    { v: "frio", l: "Frio" }, { v: "desqualificado", l: "Desqualificados" }, { v: "sem_avaliacao", l: "Sem avaliação" },
  ];
  return (
    <div className="inline-flex flex-wrap bg-secondary/40 rounded-lg p-1 gap-1">
      {tabs.map((t) => (
        <button key={t.v} onClick={() => onChange(t.v)}
          className={cn("px-3 py-1.5 text-sm rounded-md transition-colors", value === t.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {t.l} <span className="ml-1 text-xs tabular-nums opacity-70">{counts[t.v]}</span>
        </button>
      ))}
    </div>
  );
}

export function ActiveChips({ state, set, clear }: { state: LeadFilterState; set: (p: Partial<LeadFilterState>) => void; clear: () => void }) {
  const chips = activeChips(state);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <Badge key={c.key} variant="secondary" className="gap-1 pr-1 font-normal">
          {c.label}
          <button onClick={() => set(c.reset)} className="rounded hover:bg-background/50 p-0.5" aria-label={`Remover ${c.label}`}><X className="h-3 w-3" /></button>
        </Badge>
      ))}
      <button onClick={() => clear()} className="text-xs text-primary hover:underline">Limpar tudo</button>
    </div>
  );
}
