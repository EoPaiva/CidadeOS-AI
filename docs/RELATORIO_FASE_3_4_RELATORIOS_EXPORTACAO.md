# Relatorio - Fase 3.4 - Relatorios PDF e exportacao

## Objetivo

Entregar prestacao de contas operacional por periodo com arquivos CSV e PDF, preservando a privacidade do cidadao por padrao.

## Implementado

- Relatorio mensal com escolha do mes de referencia.
- Relatorio agregado por bairro.
- Relatorio agregado por setor.
- Relatorio de ocorrencias criticas.
- Filtros de 30, 90, 180 e 365 dias ou todo o historico.
- Indicadores de volume, andamento, resolucao, atraso e criticidade.
- Base operacional exportavel com protocolo, categoria, bairro, setor, situacao, prioridade, origem, SLA e datas.
- Download CSV com resumo e linhas operacionais.
- Protecao contra interpretacao de formulas maliciosas em planilhas CSV.
- Download PDF multipagina com resumo, agrupamentos e linhas operacionais.
- Rotas equivalentes no modo demo, servidor local e API serverless.
- Acesso restrito a `SUPER_ADMIN`, `CITY_ADMIN` e `DEPARTMENT_MANAGER`.
- Escopo do gestor de setor limitado ao proprio setor.

## Privacidade

Nome, telefone, e-mail, descricao livre, endereco detalhado, ponto de referencia e demais dados pessoais nao entram nos relatorios nem nas exportacoes.

## Banco de dados

Sem SQL obrigatorio novo. Os relatorios sao calculados sob demanda e nao sao persistidos.

## Rotas

- `GET /api/reports/summary`
- `GET /api/reports/export?format=csv`
- `GET /api/reports/export?format=pdf`

Parametros suportados: `type`, `period` e `month`.

## Validacao

- Sintaxe das tres camadas.
- Restricao por perfil.
- Verificacao de ausencia de chaves de PII.
- Download CSV.
- PDF valido com assinatura `%PDF-1.4`.
- Build e QA visual responsivo.

## Status

- Implementado: Fase 3.4 completa.
- Pendente para a proxima fase: autenticacao robusta e perfis de producao.
