

# Melhorar qualidade da busca LinkedIn

## Problema

A extração de empresa via regex no `parseLinkedInResult` é fundamentalmente frágil. O título do LinkedIn vem em formatos muito variados e o parser atual extrai fragmentos de texto aleatórios como nome de empresa (ex: "in", "ging", "r", "says: 'A rising tide lifts all boats'", "LinkedIn", "Carreiras"). Além disso, o filtro de relevância só verifica se o termo da busca aparece no título/snippet, o que é insuficiente.

## Solução

Substituir o parser regex por uma chamada à AI (Lovable AI / Gemini Flash Lite) para extrair dados estruturados de cada resultado do LinkedIn, e adicionar validação de relevância mais rigorosa.

### 1. Usar AI para parsear resultados LinkedIn (edge function)

Em vez de regex, enviar um batch dos resultados brutos (title + snippet + link) para a AI com um prompt pedindo:
- `nome_decisor`: nome da pessoa
- `nome_empresa`: empresa onde trabalha (null se não identificável)
- `cargo`: cargo/função
- `relevante`: boolean — se o resultado é relevante para o job title + industry + location buscados

Processar em batches de ~10 resultados por chamada para eficiência.

### 2. Filtro de relevância rigoroso

- Descartar resultados onde a AI retorna `relevante: false`
- Descartar resultados onde `nome_empresa` é null ou tem menos de 3 caracteres
- Descartar empresas que são claramente genéricas ("LinkedIn", single words sem significado)

### 3. Melhorar construção da query

- Remover a segunda query com termos de cargo em português (proprietário OR dono OR CEO...) que polui os resultados
- Usar uma query mais focada: `site:linkedin.com/in "{jobTitle}" "{industry}" "{location}"`
- Se keywords existir, adicionar como filtro adicional

### Arquivos a editar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/extract-leads/index.ts` | Substituir `parseLinkedInResult` por chamada AI em batch; simplificar queries; adicionar validação de relevância |

### Detalhes técnicos

- Usar `google/gemini-2.5-flash-lite` via `ai.gateway.lovable.dev` (sem API key extra)
- Precisa do `LOVABLE_API_KEY` (já disponível como env var nas edge functions)
- Cada batch de ~10 resultados = 1 chamada AI com tool calling retornando array de objetos
- Latência estimada: +2-3s por batch, aceitável dado que a busca já leva ~10s

