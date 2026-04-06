

# Reconfigurar processo de análise IA para leads de lista

## Problema atual

O `score-lead` para leads sem dados do Google Maps faz uma busca genérica `"nome empresa avaliações Google Maps"` que frequentemente retorna resultados irrelevantes. O site da empresa muitas vezes está vazio, então o scrape do site nem roda. Resultado: a IA recebe contexto pobre e dá notas incorretas.

## Nova estratégia: pesquisa em 3 etapas

```text
Etapa 1: Encontrar o site real da empresa (Firecrawl search)
   ↓
Etapa 2: Scrape do site encontrado + busca de reputação (paralelo)
   ↓
Etapa 3: IA analisa com contexto rico (site + reputação + redes sociais)
```

## Mudanças no `score-lead/index.ts`

### 1. Nova função `findCompanyWebsite(nome, cidade)`
- Busca Firecrawl: `"{nome}" "{cidade}" site oficial`
- Retorna a URL do primeiro resultado que pareça ser o site da empresa (não redes sociais, não diretórios)

### 2. Nova função `searchReputation(nome, cidade)`
- Busca Firecrawl: `"{nome}" "{cidade}" avaliações OR opinião OR review`
- Mais focada em reputação real do que a busca atual por "Google Maps"

### 3. Nova função `searchSocialMedia(nome, cidade)`
- Busca Firecrawl: `"{nome}" "{cidade}" instagram OR facebook OR linkedin`
- Coleta presença em redes sociais

### 4. Refatorar fluxo `!hasRealData`
Em vez do fluxo atual (1 busca Google Maps + 1 scrape opcional):

```text
1. findCompanyWebsite → URL do site
2. Em paralelo:
   a. searchCompanyWebsite(URL encontrada ou website do lead)
   b. searchReputation(nome, cidade)
   c. searchSocialMedia(nome, cidade)
3. Montar contexto rico com seções separadas
4. Enviar à IA com prompt atualizado
```

### 5. Prompt melhorado para leads pesquisados
- Instruir a IA a identificar explicitamente qual é o site real da empresa
- Pedir que valide se os dados encontrados realmente pertencem à empresa em questão
- Adicionar campo `website_encontrado` no retorno da tool call para salvar no banco

### 6. Retornar site encontrado
- Adicionar `website_encontrado` ao response JSON do score-lead
- No frontend (Leads.tsx), atualizar o campo `site` do lead se estiver vazio e o score-lead retornar um site

## Mudanças no frontend (`Leads.tsx`)

- Na função `bulkScoreLeads` e `reAnalyzeLead`: se `scoreData.website_encontrado` existir e o lead não tiver site, salvar no campo `site` do lead

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/score-lead/index.ts` | Novas funções de pesquisa, fluxo em 3 etapas, prompt melhorado, retorno de website |
| `src/pages/Leads.tsx` | Salvar `website_encontrado` no lead após análise |

## O que NÃO muda
- Fluxo de leads do Google Maps (que já têm reviews/rating) permanece igual
- Função `enrich-lead` não é alterada
- Filtros, UI de score, exportação Kommo — tudo mantido

