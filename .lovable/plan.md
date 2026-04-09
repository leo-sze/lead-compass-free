

# Corrigir busca de telefones na função find-phone

## Problema

A função `find-phone` usa um regex genérico para extrair telefones do HTML dos sites. Esse regex captura qualquer sequência de 10-11 dígitos, incluindo IDs de rastreamento, códigos JS, pixels, etc. Resultado: números falsos como `1110051030`, `4616409202`.

Comparando com a planilha Apollo, os telefones reais estão nos campos "Corporate Phone" (ex: `+55 11 3081-4171`) e o Google Places retorna números formatados corretamente (ex: `(11) 98488-4979`).

## Solução

### 1. Inverter a prioridade: Google Places primeiro, site como fallback

O Google Places retorna telefones verificados e formatados. Deve ser a fonte primária, não o fallback.

### 2. Melhorar o scraping de sites

Em vez de buscar qualquer sequência de dígitos no HTML inteiro:
- Buscar apenas em contextos relevantes: links `tel:`, `href="tel:"`, `href="whatsapp"`, atributos `data-phone`
- Buscar texto próximo a palavras-chave: "telefone", "tel", "whatsapp", "contato", "fone", "ligue"
- Ignorar números dentro de tags `<script>`, `<style>`, atributos CSS
- Validar o número encontrado: deve ter DDD válido (11-99) e formato brasileiro

### 3. Validação de números brasileiros

Adicionar função de validação:
- DDD deve estar entre 11 e 99
- Celular: 9 dígitos (começa com 9)
- Fixo: 8 dígitos
- Rejeitar números que não passem nessa validação

### 4. Usar dados do CSV quando disponíveis

O frontend já envia `companyName`, `website`, `city`, `state`. Adicionar campo opcional `existingPhones` para enviar telefones que já existem na planilha (Corporate Phone, etc.), evitando buscas desnecessárias.

## Arquivo alterado

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/find-phone/index.ts` | Inverter prioridade (Places primeiro), melhorar regex/contexto de scraping, validação de DDD brasileiro |
| `src/pages/FindContacts.tsx` | Enviar telefones existentes do CSV no payload para evitar buscas redundantes |

## Detalhes técnicos

**Novo fluxo da edge function:**
1. Se o contato já tem telefone existente → retornar normalizado
2. Google Places API (se API key configurada) → buscar por nome + cidade
3. Fallback: scrape do site, mas apenas em contextos `tel:` e próximo a palavras-chave de contato
4. Normalizar resultado final com `+55DDDTELEFONE`

**Scraping melhorado:**
```
// Extrair de links tel:
const telLinks = html.match(/href=["']tel:([^"']+)["']/gi)

// Extrair próximo a keywords de contato
// Buscar em seções "contato", "footer", ignorar <script>/<style>
```

**Validação:**
```
function isValidBrazilianPhone(digits: string): boolean {
  // DDD: 11-99, número: 8-9 dígitos
  if (digits.length < 10 || digits.length > 11) return false;
  const ddd = parseInt(digits.slice(0, 2));
  return ddd >= 11 && ddd <= 99;
}
```

