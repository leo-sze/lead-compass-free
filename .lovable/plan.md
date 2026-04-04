

# Refatorar enrich-lead: estratégia de 3 estágios (CNPJ → BrasilAPI → IA)

## Resumo

Substituir a lógica atual (múltiplas buscas paralelas + IA para tudo) por 3 estágios sequenciais e determinísticos. O nome_decisor passa a vir primariamente da BrasilAPI (QSA/quadro societário), que é gratuita e confiável. A IA só entra como último recurso.

## Estágio 1 — Encontrar CNPJ
- Busca Firecrawl: `"{nome_empresa}" "{cidade}" CNPJ`
- Regex para extrair CNPJ do texto retornado
- Fallback: segunda busca com `site:casadosdados.com.br`
- CNPJ salvo no campo `cnpj` dos updates

## Estágio 2 — BrasilAPI (QSA)
- `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj_limpo}` (sem auth)
- Seleciona decisor do array `qsa` por prioridade de qualificação (Administrador > Diretor/Presidente > Sócio > primeiro)
- Aproveita telefone, endereço, cidade da resposta se vazios
- Ignora empresa com situação "BAIXADA" ou "INAPTA"
- Retry 1x com 2s delay em caso de 429

## Estágio 3 — Fallback IA (só se decisor ainda vazio)
- UMA busca Firecrawl: `"{nome_empresa}" "{cidade}" fundador OR proprietário OR CEO OR diretor`
- Chamada Gemini com prompt restritivo para extrair apenas nome de pessoa real
- Se retornar null, deixa nome_decisor vazio

## Campos não-decisor (site, instagram, linkedin)
- Mantém a lógica existente de busca web + IA para esses campos, executada em paralelo com o Estágio 1
- A IA do Estágio 3 NÃO substitui essa parte — ela só busca nome_decisor

## O que muda no arquivo

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Busca de decisor | 7 buscas paralelas + IA genérica | CNPJ → BrasilAPI → 1 busca + IA focada |
| Fonte principal | Scraping genérico | BrasilAPI (dados oficiais da Receita) |
| Chamadas Firecrawl | 7 em paralelo | 2-3 sequenciais (CNPJ) + 1-2 para outros campos |
| Input schema | Sem campo cnpj | Adiciona `cnpj` opcional ao BodySchema |
| Output | Mesmo formato | Mesmo formato, `cnpj` adicionado ao `updates` |

## Detalhes técnicos

- Novo campo no BodySchema: `cnpj: z.string().nullable().optional()`
- Nova função `findCnpj(nome, cidade, apiKey)` → string | null
- Nova função `queryBrasilApi(cnpj)` → objeto com qsa, telefone, endereço etc.
- Nova função `selectDecisor(qsa)` → nome do decisor
- Busca de campos gerais (site, instagram, linkedin, telefone) continua via scrape + IA como antes, mas em paralelo e sem incluir nome_decisor
- Logging com prefixos `[CNPJ]`, `[QSA]`, `[IA]`

