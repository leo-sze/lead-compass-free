import { useState, useMemo } from "react";
import { Search, X, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LeadFilters, emptyFilters,
  SENIORITY_OPTIONS, DEPARTMENT_OPTIONS, INDUSTRY_OPTIONS,
  COMPANY_SIZE_OPTIONS, EMAIL_STATUS_OPTIONS,
} from "@/hooks/useLeadSearch";

interface Props {
  filters: LeadFilters;
  onChange: (filters: LeadFilters) => void;
  filterCounts: {
    seniorityCounts: Record<string, number>;
    departmentCounts: Record<string, number>;
    industryCounts: Record<string, number>;
  };
  jobTitleSuggestions: string[];
}

function CheckboxGroup({
  label,
  options,
  selected,
  onToggle,
  counts,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (val: string) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</h4>
      <div className="space-y-1">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-secondary/40 cursor-pointer text-sm">
            <Checkbox
              checked={selected.includes(opt)}
              onCheckedChange={() => onToggle(opt)}
              className="h-3.5 w-3.5"
            />
            <span className="flex-1">{opt}</span>
            {counts && <span className="text-xs text-muted-foreground">({counts[opt] ?? 0})</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function LinkedInFilterSidebar({ filters, onChange, filterCounts, jobTitleSuggestions }: Props) {
  const [jobTitleInput, setJobTitleInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!jobTitleInput || jobTitleInput.length < 2) return [];
    const q = jobTitleInput.toLowerCase();
    return jobTitleSuggestions
      .filter(s => s.toLowerCase().includes(q) && !filters.jobTitles.includes(s))
      .slice(0, 8);
  }, [jobTitleInput, jobTitleSuggestions, filters.jobTitles]);

  const update = (partial: Partial<LeadFilters>) => onChange({ ...filters, ...partial });

  const toggleInArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  const addJobTitle = (title: string) => {
    if (!filters.jobTitles.includes(title)) {
      update({ jobTitles: [...filters.jobTitles, title] });
    }
    setJobTitleInput("");
    setShowSuggestions(false);
  };

  const handleJobTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && jobTitleInput.trim()) {
      e.preventDefault();
      addJobTitle(jobTitleInput.trim());
    }
  };

  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(emptyFilters);

  return (
    <div className="w-72 shrink-0 border-r border-border/50 bg-card/50 flex flex-col h-full">
      <div className="p-4 border-b border-border/50">
        <h3 className="text-sm font-semibold mb-3">Filtros</h3>
        {/* 2.1 Global Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar leads..."
            value={filters.globalSearch}
            onChange={e => update({ globalSearch: e.target.value })}
            className="pl-8 h-8 text-sm bg-secondary/50 border-border/50"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* 2.2 Job Title Tags */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cargo</h4>
            {filters.jobTitles.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filters.jobTitles.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs gap-1">
                    {tag}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={() => update({ jobTitles: filters.jobTitles.filter(t => t !== tag) })}
                    />
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <Input
                placeholder="Adicionar cargo..."
                value={jobTitleInput}
                onChange={e => { setJobTitleInput(e.target.value); setShowSuggestions(true); }}
                onKeyDown={handleJobTitleKeyDown}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="h-8 text-sm bg-secondary/50 border-border/50"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/60"
                      onMouseDown={() => addJobTitle(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 2.3 Seniority */}
          <CheckboxGroup
            label="Senioridade"
            options={SENIORITY_OPTIONS}
            selected={filters.seniorities}
            onToggle={v => update({ seniorities: toggleInArray(filters.seniorities, v) })}
            counts={filterCounts.seniorityCounts}
          />

          {/* 2.4 Department */}
          <CheckboxGroup
            label="Departamento"
            options={DEPARTMENT_OPTIONS}
            selected={filters.departments}
            onToggle={v => update({ departments: toggleInArray(filters.departments, v) })}
            counts={filterCounts.departmentCounts}
          />

          {/* 2.5 Industry */}
          <CheckboxGroup
            label="Setor"
            options={INDUSTRY_OPTIONS}
            selected={filters.industries}
            onToggle={v => update({ industries: toggleInArray(filters.industries, v) })}
            counts={filterCounts.industryCounts}
          />

          {/* 2.6 Company Size */}
          <CheckboxGroup
            label="Tamanho da Empresa"
            options={COMPANY_SIZE_OPTIONS}
            selected={filters.companySizes}
            onToggle={v => update({ companySizes: toggleInArray(filters.companySizes, v) })}
          />

          {/* 2.7 Location */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Localização</h4>
            <Input
              placeholder="País..."
              value={filters.country}
              onChange={e => update({ country: e.target.value })}
              className="h-8 text-sm bg-secondary/50 border-border/50"
            />
            <Input
              placeholder="Cidade..."
              value={filters.city}
              onChange={e => update({ city: e.target.value })}
              className="h-8 text-sm bg-secondary/50 border-border/50"
            />
          </div>

          {/* 2.8 Email Status */}
          <CheckboxGroup
            label="Status do Email"
            options={EMAIL_STATUS_OPTIONS}
            selected={filters.emailStatuses}
            onToggle={v => update({ emailStatuses: toggleInArray(filters.emailStatuses, v) })}
          />
        </div>
      </ScrollArea>

      {/* 2.9 Clear Filters */}
      {hasActiveFilters && (
        <div className="p-3 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={() => onChange(emptyFilters)}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Limpar Filtros
          </Button>
        </div>
      )}
    </div>
  );
}
