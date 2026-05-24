# Relatório — Fase 2.9 Triagem por Regras Locais

## Objetivo

Adicionar uma camada de sugestão operacional sem IA externa, usando regras locais por palavras-chave para apoiar a triagem de ocorrências.

## Entregue

- Classificador local para termos como buraco, lâmpada, poste, lixo, dengue, água parada, vazamento, alagamento, árvore, idoso, ponte e estrada rural.
- Sugestão com categoria, prioridade, setor, mensagem pública, SLA, confiança e palavras encontradas.
- Endpoint interno `POST /api/triage/suggest` para gerar sugestão sob demanda.
- Endpoint `PATCH /api/occurrences/:id/triage-suggestion` para aplicar somente após confirmação.
- Interface no modal da ocorrência com `Gerar sugestão`, `Aplicar sugestão`, `Editar manualmente` e `Ignorar`.
- Triagem WhatsApp passa a carregar a sugestão local no `payloadJson` e exibir categoria/prioridade/confiança na fila.
- Runtime alinhado em três ambientes: servidor local, API serverless e modo demo online.

## Banco de dados

Sem SQL obrigatório novo na Fase 2.9.

A aplicação reutiliza categorias, subcategorias, setores, prioridade, SLA e mensagem pública já existentes. Sugestões de WhatsApp ficam no `payload_json` da mensagem, que já existe no schema atual.

## Regra operacional

A sugestão nunca substitui automaticamente a decisão humana. Ela só altera a ocorrência quando um usuário interno confirma a ação na interface.

## Validação

- `npm run check`
- `npm run build`
- QA local via API: ocorrência criada como `Urbano/MEDIA`, sugestão local indicou `Saúde Pública/ALTA` sem alterar o registro antes da confirmação e aplicação atualizou categoria, prioridade, SLA e mensagem pública.
- QA local via navegador headless/CDP: login demo, abertura de detalhe, geração de sugestão, modo `Editar manualmente` e aplicação confirmada pela interface.
