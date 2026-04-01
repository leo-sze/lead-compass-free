import { useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads"> & {
  termo_pesquisa?: string | null;
  cidade?: string | null;
  fonte?: string | null;
};

export interface LeadFilters {
  globalSearch: string;
  jobTitles: string[];
  seniorities: string[];
  departments: string[];
  industries: string[];
  companySizes: string[];
  country: string;
  city: string;
  emailStatuses: string[];
}

export const SENIORITY_OPTIONS = ["Entry", "Mid", "Senior", "Manager", "Director", "VP", "C-Level"] as const;
export const DEPARTMENT_OPTIONS = ["Sales", "Engineering", "Marketing", "Finance", "HR", "Product", "Operations"] as const;
export const INDUSTRY_OPTIONS = ["SaaS", "Fintech", "Healthcare", "E-commerce", "Logistics", "EdTech"] as const;
export const COMPANY_SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
export const EMAIL_STATUS_OPTIONS = ["Verified", "Unverified", "Catch-all"] as const;

export const emptyFilters: LeadFilters = {
  globalSearch: "",
  jobTitles: [],
  seniorities: [],
  departments: [],
  industries: [],
  companySizes: [],
  country: "",
  city: "",
  emailStatuses: [],
};

function matchesText(value: string | null | undefined, search: string): boolean {
  if (!value || !search) return false;
  return value.toLowerCase().includes(search.toLowerCase());
}

function matchesAnyTag(value: string | null | undefined, tags: string[]): boolean {
  if (!tags.length) return true;
  if (!value) return false;
  const lower = value.toLowerCase();
  return tags.some(tag => lower.includes(tag.toLowerCase()));
}

function matchesAnyExact(value: string | null | undefined, options: string[]): boolean {
  if (!options.length) return true;
  if (!value) return false;
  const lower = value.toLowerCase();
  return options.some(o => lower === o.toLowerCase());
}

// Infer seniority from job title
function inferSeniority(jobTitle: string | null | undefined): string | null {
  if (!jobTitle) return null;
  const t = jobTitle.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cmo|cio|chief|founder|co-founder|sócio|presidente)\b/.test(t)) return "C-Level";
  if (/\b(vp|vice[ -]president|vice[ -]presidente)\b/.test(t)) return "VP";
  if (/\b(director|diretor|head of)\b/.test(t)) return "Director";
  if (/\b(manager|gerente|coordenador|supervisor)\b/.test(t)) return "Manager";
  if (/\b(senior|sênior|sr\.?|lead|principal)\b/.test(t)) return "Senior";
  if (/\b(junior|júnior|jr\.?|assistente|trainee|estagiário|intern)\b/.test(t)) return "Entry";
  return "Mid";
}

// Infer department from job title
function inferDepartment(jobTitle: string | null | undefined): string | null {
  if (!jobTitle) return null;
  const t = jobTitle.toLowerCase();
  if (/\b(sales|vendas|comercial|business development|bdr|sdr|account executive)\b/.test(t)) return "Sales";
  if (/\b(engineer|developer|dev|desenvolvedor|software|tech|backend|frontend|fullstack|devops|cto)\b/.test(t)) return "Engineering";
  if (/\b(marketing|growth|brand|comunicação|social media|cmo)\b/.test(t)) return "Marketing";
  if (/\b(finance|financeiro|contab|cfo|controller|tesoureiro)\b/.test(t)) return "Finance";
  if (/\b(hr|rh|human|recursos humanos|people|talent)\b/.test(t)) return "HR";
  if (/\b(product|produto|pm|product manager|cpo)\b/.test(t)) return "Product";
  if (/\b(operations|operações|logistics|logística|supply|coo)\b/.test(t)) return "Operations";
  return null;
}

function applyFilter(leads: Lead[], filters: LeadFilters): Lead[] {
  let result = leads;

  // 1. Global search
  if (filters.globalSearch) {
    const s = filters.globalSearch;
    result = result.filter(l =>
      matchesText(l.nome_decisor, s) ||
      matchesText(l.nome_empresa, s) ||
      matchesText(l.query_origem, s) ||
      matchesText(l.endereco, s)
    );
  }

  // 2. Job title tags
  if (filters.jobTitles.length > 0) {
    result = result.filter(l => matchesAnyTag(l.nome_decisor, filters.jobTitles) || matchesAnyTag(l.query_origem, filters.jobTitles));
  }

  // 3. Seniority
  if (filters.seniorities.length > 0) {
    result = result.filter(l => {
      const sen = inferSeniority(l.nome_decisor) || inferSeniority(l.query_origem);
      return sen ? filters.seniorities.includes(sen) : false;
    });
  }

  // 4. Department
  if (filters.departments.length > 0) {
    result = result.filter(l => {
      const dep = inferDepartment(l.nome_decisor) || inferDepartment(l.query_origem);
      return dep ? filters.departments.includes(dep) : false;
    });
  }

  // 5. Industry
  if (filters.industries.length > 0) {
    result = result.filter(l => matchesAnyTag(l.termo_pesquisa, filters.industries) || matchesAnyTag(l.query_origem, filters.industries));
  }

  // 6. Company size — skip for now (no data field)

  // 7. Location
  if (filters.country) {
    result = result.filter(l => matchesText(l.cidade, filters.country) || matchesText(l.endereco, filters.country));
  }
  if (filters.city) {
    result = result.filter(l => matchesText(l.cidade, filters.city) || matchesText(l.endereco, filters.city));
  }

  // 8. Email status — skip for now (no email_status field)

  return result;
}

export function useLeadSearch(leads: Lead[], filters: LeadFilters) {
  const results = useMemo(() => applyFilter(leads, filters), [leads, filters]);

  const totalCount = results.length;

  const activeFilters = useMemo(() => {
    let count = 0;
    if (filters.globalSearch) count++;
    if (filters.jobTitles.length) count++;
    if (filters.seniorities.length) count++;
    if (filters.departments.length) count++;
    if (filters.industries.length) count++;
    if (filters.companySizes.length) count++;
    if (filters.country) count++;
    if (filters.city) count++;
    if (filters.emailStatuses.length) count++;
    return count;
  }, [filters]);

  // Counts per filter option given the current pool (minus that specific filter group)
  const filterCounts = useMemo(() => {
    // Pool without each group for contextual counts
    const withoutSeniority = applyFilter(leads, { ...filters, seniorities: [] });
    const withoutDepartment = applyFilter(leads, { ...filters, departments: [] });
    const withoutIndustry = applyFilter(leads, { ...filters, industries: [] });

    const seniorityCounts: Record<string, number> = {};
    for (const s of SENIORITY_OPTIONS) {
      seniorityCounts[s] = withoutSeniority.filter(l => {
        const sen = inferSeniority(l.nome_decisor) || inferSeniority(l.query_origem);
        return sen === s;
      }).length;
    }

    const departmentCounts: Record<string, number> = {};
    for (const d of DEPARTMENT_OPTIONS) {
      departmentCounts[d] = withoutDepartment.filter(l => {
        const dep = inferDepartment(l.nome_decisor) || inferDepartment(l.query_origem);
        return dep === d;
      }).length;
    }

    const industryCounts: Record<string, number> = {};
    for (const i of INDUSTRY_OPTIONS) {
      industryCounts[i] = withoutIndustry.filter(l =>
        matchesAnyTag(l.termo_pesquisa, [i]) || matchesAnyTag(l.query_origem, [i])
      ).length;
    }

    return { seniorityCounts, departmentCounts, industryCounts };
  }, [leads, filters]);

  return { results, totalCount, activeFilters, filterCounts };
}
