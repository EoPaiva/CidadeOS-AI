# Relatorio - Fase 3.1 - Duplicidade e agrupamento

## Objetivo

Implementar um fluxo seguro para detectar relatos repetidos, sugerir ocorrencias semelhantes e permitir que um agente vincule ou arquive duplicadas apenas apos confirmacao explicita.

## Entregas

- Busca de possiveis duplicidades por cidade, categoria, bairro, endereco, ponto de referencia e similaridade textual.
- Endpoint local e serverless para consultar candidatos de duplicidade por ocorrencia.
- Acao de vinculo com suporte a protocolo, id ou candidato selecionado.
- Opcao de vincular mantendo status `DUPLICADO` ou vincular arquivando a duplicada com status `ARQUIVADO`.
- Registro em historico de status, comentario interno no protocolo principal e auditoria.
- Painel no modal operacional com candidatos, ocorrencias ja agrupadas e formulario manual.
- Modo demo atualizado com o mesmo comportamento funcional.

## Banco de dados

Sem SQL obrigatorio novo nesta fase.

A implementacao reutiliza `duplicate_of_id`, `occurrence_status_history`, `occurrence_comments` e `audit_logs`. Nenhuma migracao foi executada.

## Garantias operacionais

- O sistema nao mescla automaticamente ocorrencias.
- O sistema bloqueia vinculo da ocorrencia nela mesma.
- O sistema bloqueia vinculo entre cidades diferentes.
- O sistema registra a decisao humana em historico e auditoria.
- A ocorrencia principal recebe comentario interno indicando o protocolo agrupado.

## Validacao esperada

- `npm run check`
- `npm run build`
- QA local criando duas ocorrencias semelhantes, consultando candidatos, vinculando a segunda como duplicada e restaurando o JSON local apos o teste.
