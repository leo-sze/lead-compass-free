

# Separar Google Maps e LinkedIn em módulos distintos

## Contexto

Atualmente, a página de busca (Index) tem um toggle entre Google Maps e LinkedIn, mas ambos compartilham a mesma edge function, os mesmos campos de input e o mesmo fluxo. O usuário quer que cada fonte funcione como um produto especializado:

- **Google Maps** → estilo GLeads (busca local de empresas por nicho + cidade, retorna telefone, site, endereço, redes sociais)
- **LinkedIn** → estilo Apollo/Lusha (busca de pessoas/decisores por cargo, empresa, setor; retorna nome do decisor, cargo, empresa, perfil LinkedIn)

## Plano

### 1. Criar duas páginas de busca separadas

- **`/google-search`** — Busca Google Maps (GLeads)
  - Campos: "Nicho/Segmento" + "Cidade/Região"
  - Foco em dados de empresa: nome, telefone, site, endereço, Instagram
  - Botão "Extrair Leads"

- **`/linkedin-search`** — Busca LinkedIn (Apollo/Lusha)
  - Campos: "Cargo/Função" (ex: CEO, Diretor de Marketing), "Setor/Empresa" (ex: agências de marketing), "Localização"
  - Foco em dados de pessoa: nome do decisor, cargo, empresa, perfil LinkedIn
  - Resultados já vêm com decisor preenchido

- Página `/` (Index) vira um hub com dois cards grandes para escolher o tipo de busca

### 2. Separar a edge function ou usar parâmetros distintos

- Manter `extract-leads` mas com lógica bem separada internamente:
  - `source: "google"` → Google Maps engine, parser de empresa
  - `source: "linkedin"` → Google search `site:linkedin.com/in` com filtros por cargo, parser focado em pessoa/decisor
- LinkedIn query template muda: `site:linkedin.com/in "{cargo}" "{setor}" "{localização}"` com filtros de cargo (CEO, Diretor, Fundador, etc.)

### 3. Atualizar sidebar e rotas

- Sidebar passa de 3 para 4 itens:
  - 🔍 Google Maps (busca empresas)
  - 👤 LinkedIn (busca decisores)
  - 📋 Leads (CRM)
  - ⚙️ Configurações

### 4. Atualizar a tabela de leads

- Adicionar coluna "Fonte" visível na tabela para diferenciar leads Google vs LinkedIn
- Filtro por fonte na lista de leads

### Arquivos a criar/editar

| Arquivo | Ação |
|---------|------|
| `src/pages/GoogleSearch.tsx` | Criar — formulário de busca Google Maps |
| `src/pages/LinkedInSearch.tsx` | Criar — formulário de busca LinkedIn com campos cargo/setor/local |
| `src/pages/Index.tsx` | Refatorar — hub de escolha entre as duas buscas |
| `src/components/AppSidebar.tsx` | Editar — adicionar itens de navegação |
| `src/App.tsx` | Editar — adicionar rotas |
| `supabase/functions/extract-leads/index.ts` | Editar — refinar lógica LinkedIn para buscar por cargo/função, não por nicho de empresa |
| `src/pages/Leads.tsx` | Editar — adicionar filtro por fonte, coluna visível |
| `src/components/leads/LeadFilters.tsx` | Editar — adicionar filtro "Fonte" |

