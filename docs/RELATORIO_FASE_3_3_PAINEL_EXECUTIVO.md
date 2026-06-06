# Relatorio - Fase 3.3 - Painel executivo

## Objetivo

Entregar uma visao clara para gestores publicos acompanharem demanda, resposta operacional e concentracao territorial sem expor dados pessoais.

## Implementado

- Nova aba `Painel executivo`, visivel para `SUPER_ADMIN`, `CITY_ADMIN` e `DEPARTMENT_MANAGER`.
- Filtro por ultimos 30, 90, 180 e 365 dias ou todo o historico.
- Indicadores de ocorrencias recebidas, abertas, resolvidas, atrasadas e criticas abertas.
- Tempo medio de resolucao e taxa de resolucao.
- Destaques para categoria com maior demanda, bairro mais citado e setor mais acionado.
- Grafico simples de volume mensal.
- Graficos agregados por origem, categoria, bairro e setor.
- Rota executiva equivalente no modo demo, servidor local e API serverless.
- Escopo respeitando cidade e perfil autenticado.
- Estados vazios e fallback quando os indicadores nao estiverem disponiveis.

## Privacidade

A rota executiva retorna somente contagens, tendencias e rotulos agregados. Nome, telefone, e-mail, endereco detalhado e demais dados pessoais do cidadao nao fazem parte da resposta.

## Banco de dados

Sem SQL obrigatorio novo. A fase reutiliza campos ja existentes em `occurrences`, `occurrence_categories`, `neighborhoods` e `departments`.

## Validacao

- `node --check api/[...path].js`
- `node --check public/app.js`
- `npm run check`
- `npm run build`
- QA local da rota executiva e da restricao por perfil
- QA visual responsivo da nova aba

## Status

- Implementado: painel executivo agregado e restrito a gestores.
- Parcial/preparado: exportacao formal dos indicadores fica para a Fase 3.4.
- Pendente: relatorios PDF e CSV.
