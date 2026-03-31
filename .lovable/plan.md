
<title>GLeads Clone - Extrator de Leads B2B</title>
<overview>Ferramenta de extração de leads B2B com busca automatizada, CRM interno, integração WhatsApp e exportação CSV. Dark mode, design profissional, dados salvos no Supabase sem autenticação.</overview>

<steps>
<step>
<title>Setup Supabase e tabela de leads</title>
<description>Criar tabela `leads` no Supabase com campos: nome_empresa, telefone, site, endereco, instagram, linkedin, query_origem, created_at. Habilitar RLS com política pública de leitura/escrita (sem login). Adicionar unique constraint para evitar duplicados (nome_empresa + telefone).</description>
</step>

<step>
<title>Design system dark mode</title>
<description>Configurar tema dark como padrão com cores profissionais (fundo escuro #0F172A, accent verde/azul neon). Criar layout de dashboard com sidebar de navegação (Busca, Leads, Configurações).</description>
</step>

<step>
<title>Página de Busca com extração</title>
<description>Dois campos: "O que você busca?" e "Onde?". Botão "Pesquisar e Extrair" que chama uma Edge Function. Barra de progresso animada durante a extração. A Edge Function usa a API configurada (SerpApi ou SearchApi) para buscar resultados do Google Maps, faz parsing dos dados e retorna leads limpos (nome, telefone, site, endereço, redes sociais).</description>
</step>

<step>
<title>Tabela de Leads (CRM)</title>
<description>Tabela com todos os leads extraídos, com colunas para cada campo. Botão de WhatsApp direto em cada linha (abre wa.me com mensagem customizada e variáveis). Filtros por query de origem. Seleção múltipla para ações em lote. Botão de exportar CSV com todos os leads ou apenas selecionados.</description>
</step>

<step>
<title>Página de Configurações</title>
<description>Campo para colar API Key (SerpApi ou SearchApi), com seletor de provedor. Template de mensagem WhatsApp editável com variáveis disponíveis ({nome_empresa}, {telefone}). Preview da mensagem. Configurações salvas no Supabase em tabela `settings`.</description>
</step>

<step>
<title>Edge Function de extração</title>
<description>Criar Edge Function que recebe query + localização + API key do usuário. Faz chamada à API selecionada (SerpApi/SearchApi) buscando no Google Maps. Faz parsing e limpeza dos resultados. Verifica duplicados no Supabase antes de inserir. Retorna leads encontrados com contagem de novos vs duplicados.</description>
</step>
</steps>
