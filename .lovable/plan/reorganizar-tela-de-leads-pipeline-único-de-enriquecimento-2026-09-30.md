# Reorganizar tela de Leads + pipeline único de enriquecimento

Feito em 3 fases, cada uma testável sozinha, sem quebrar o que já funciona hoje.

## Fase 1 — Tela de Leads (filtros, toolbar, tabela)
- Cabeçalho: "Leads · X no total · Y exibidos", botão principal **Enriquecer** e menu "⋯" (Exportar CSV, Marcar importados no Kommo, Excluir duplicatas em vermelho com confirmação e contagem).
- Barra de filtros em uma linha só: busca (nome, endereço, telefone, CNPJ) com espera de 300ms, botão **Filtros** com contador, seletor de período (Hoje, 7 dias, 30 dias, Este mês, Personalizado).
- Abas de temperatura com contadores: Todos · Quente · Morno · Frio · Desqualificados · Sem avaliação.
- Filtros ativos aparecem como chips removíveis + "Limpar tudo".
- O painel de Filtros tem seções: Origem (Cidade com busca, Termo, Fonte), Dados do lead (Telefone/Site/Instagram/Decisor com Qualquer/Com/Sem), Status (Exportado, Mensagem, Etapa do enriquecimento, Incompletos). Abre como gaveta no celular.
- Os filtros ficam salvos no endereço da página, então continuam lá depois de recarregar ou quando você compartilha o link.
- Tabela padrão: Seleção, Empresa (+ cidade), Telefone, Decisor, Temperatura/Score, Progresso (4 ícones), Status, Ações. As outras colunas podem ser ligadas pelo botão **Colunas** (fica salvo).
- Clicar na linha abre um painel lateral com todos os dados do lead, o resultado de cada etapa e o botão "Regenerar mensagem".
- Barra fixa quando há leads selecionados: Enriquecer, Gerar mensagens, Exportar CSV, Marcar no Kommo, Excluir (com confirmação).
- Paginação 15/30/50/100. Tela vazia útil ("Limpar filtros" ou "Importar leads").

## Fase 2 — Pipeline de enriquecimento
- Etapa 0, na entrada: telefone normalizado (+55), cidade/UF extraídas, duplicados barrados. Leads sem nome, telefone ou endereço vão para "Incompleto" com o motivo e só aparecem pelo filtro.
- Etapa 1, Empresa: CNPJ, razão social, situação, CNAE, porte, abertura, capital, sócios. O decisor vem do sócio-administrador. Confiança do match (alta/média/baixa): se for baixa, o decisor não é preenchido. Empresa Baixada/Inapta vira Desqualificado. Consultas por CNPJ reaproveitadas.
- Etapa 2, Presença digital: site responde?, Instagram/Facebook/LinkedIn, nota e avaliações do Google, seguidores, último post, posts em 30/90 dias.
- Etapa 3, Análise IA: uma única resposta com maturidade (1–5), frequência de postagem, sinais +/−, score 0–100, temperatura e resumo de 2 linhas. A regra de pontuação fica num arquivo fácil de ajustar.
- Etapa 4, Mensagem: opcional, automática no fim (configurável) ou manual.
- Regras: cada etapa roda na ordem certa. Se não achar CNPJ, segue para a próxima mesmo assim. Não refaz o que já está concluído, a não ser que você peça "Reprocessar". Até 3 tentativas com espera crescente. Status por etapa: pendente/processando/concluído/erro/pulado, com data e erro.
- Botão Enriquecer: "Leads selecionados", "Todos os pendentes", "Reprocessar etapa…". Barra de progresso ("42/120 leads · Etapa 2 de 4") que não trava a tela.

## Fase 3 — Automação
- Nas Configurações: opção "Enriquecer automaticamente ao importar".
- A fila continua rodando no servidor mesmo com a aba fechada.

## Detalhes técnicos
- Novas colunas em `leads`: `stage_{empresa,presenca,ia,mensagem}_status/_at/_error`, `cnpj_confidence`, `razao_social`, `situacao_cadastral`, `cnae`, `porte`, `data_abertura`, `capital_social`, `qsa jsonb`, `decisor_qualificacao`, `score_ia int`, `temperatura`, `maturidade`, `resumo_ia`, `sinais jsonb`, `raw_sources jsonb`, `incompleto_motivo`, `phone_e164` (único para deduplicar).
- Tabela `cnpj_cache` e tabela `enrichment_jobs` (fila). Uma função no servidor `run-pipeline` processa os leads em lotes e reutiliza a lógica atual de `enrich-lead`.
- `Leads.tsx` (73k) dividido em: `LeadsHeader`, `LeadsFilterBar`, `FiltersPopover`, `TemperatureTabs`, `ActiveChips`, `LeadsTable`, `ColumnsToggle`, `LeadDrawer`, `BulkBar`, `EnrichMenu`, hooks `useLeadFilters` (URL) e `usePipelineProgress`.
- Rubrica em `src/config/scoreRubric.ts`, também usada pela função no servidor.
