# Relatorio - Fase 3.2 - Mapa e geolocalizacao

## Objetivo

Visualizar ocorrencias por localizacao sem criar dependencia de mapa externo nem coletar coordenada precisa sem consentimento.

## Entregue

- Campos opcionais de latitude e longitude no formulario publico.
- Controle de privacidade da localizacao com modo aproximado por padrao.
- Arredondamento automatico de coordenadas quando nao ha consentimento explicito para localizacao precisa.
- Consulta publica sem exposicao de latitude/longitude.
- Reducao de numeros de endereco na consulta publica para evitar exposicao sensivel.
- Aba interna `Mapa` no painel administrativo.
- Filtros por bairro/regiao, prioridade, status e ocorrencias criticas abertas.
- Mapa operacional em SVG com pontos por ocorrencia.
- Destaque visual para ocorrencias criticas, altas e atrasadas.
- Calor por bairro/regiao com ranking lateral.
- Lista rapida de ocorrencias criticas/altas com abertura do detalhe operacional.

## Banco de dados

Sem SQL obrigatorio novo nesta fase.

A implementacao reutiliza `occurrences.latitude`, `occurrences.longitude`, `occurrences.address`, `occurrences.reference_point`, `neighborhoods`, status, prioridade, SLA e auditoria ja previstos nos scripts de schema.

## Privacidade

A localizacao precisa so e preservada quando `locationPrecision` recebe `EXATA_CONSENTIDA` e `locationConsent` vem marcado. Caso contrario, as coordenadas sao aproximadas antes de salvar. A API publica retorna somente endereco reduzido, ponto de referencia, bairro e demais dados publicos do protocolo.

## Validacao prevista

- `npm run check`
- `npm run build`
- teste local de abertura de ocorrencia com coordenadas sem consentimento, conferindo arredondamento interno e ausencia de coordenadas na consulta publica
- conferencia visual da aba `Mapa` no painel
