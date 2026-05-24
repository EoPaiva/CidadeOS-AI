# Relatorio - Fase 3.0 IA assistida para triagem

## Objetivo

Adicionar uma camada opcional de IA assistida para apoiar classificacao, resumo e triagem de ocorrencias, preservando a decisao humana e mantendo fallback local quando nao houver chave ou quando a IA falhar.

## Entregue

- Endpoint `POST /api/triage/suggest` agora retorna sugestao assistida com resumo, categoria, prioridade, setor, risco, bairro/endereco provavel, campos ausentes, possivel duplicidade e resposta sugerida ao cidadao.
- Fallback por regras locais continua ativo e independente de chave externa.
- Integracao opcional com IA no backend usando chave segura do ambiente, sem expor segredo no frontend.
- Validacao local dos IDs retornados pela IA contra categorias, subcategorias, setores e bairros cadastrados.
- Redacao de dados pessoais em resumos e respostas sugeridas.
- Duplicidade calculada por similaridade textual, categoria, bairro e local informado, sem marcar nada automaticamente.
- Modal da ocorrencia mostra `Resumo automatico`, `Risco`, `Bairro/Endereco provavel`, `Campos ausentes`, `Possivel duplicidade` e `Resposta sugerida ao cidadao`.
- `PATCH /api/occurrences/:id/triage-suggestion` continua exigindo confirmacao do agente antes de aplicar categoria, setor, prioridade, SLA e mensagem publica.
- WhatsApp simulado/webhook passa a carregar o objeto de sugestao assistida por fallback local no `payload_json`.

## Banco de dados

Sem SQL obrigatorio novo.

A fase reutiliza campos existentes em `occurrences`, `occurrence_status_history`, `audit_logs` e `whatsapp_messages.payload_json`. Nenhuma migracao foi executada.

## Regras de seguranca operacional

- A IA e assistiva, nao decisoria.
- O agente confirma antes de aplicar qualquer mudanca.
- Bairro e endereco nao sao inventados; quando faltam, a resposta sugerida pede complemento.
- Resumos publicos passam por redacao de telefone, email e documento.
- Falha, timeout ou ausencia de chave de IA retorna fallback local.

## Validacao

- `npm run check`
- `npm run build`
- QA local de API sem chave de IA: `rules_local_v1`, resumo gerado, risco `ALTO`, campos ausentes `bairro`/`localizacao`, resposta de complemento e aplicacao somente apos PATCH confirmado.
- QA local de interface via Chrome/CDP: modal da ocorrencia exibiu `Resumo automatico`, `Fatores de risco`, `Possivel duplicidade`, `Resposta sugerida ao cidadao` e complemento de bairro/localizacao.
- O arquivo local de dados usado no QA foi restaurado apos os testes. Nenhuma migracao de banco foi executada.
