# CidadeOS AI — Fase 1.4 WhatsApp Business configurável por cidade

## 🟢 Implementado
- Menu interno **WhatsApp Business** no painel administrativo.
- Configuração por cidade/cliente, sem número fixo da plataforma.
- Campos para número oficial, WABA ID, Phone Number ID, App ID, App Secret, Access Token, Verify Token, templates, mensagens padrão e setor responsável.
- Salvamento no banco local JSON com interface mascarada para credenciais sensíveis.
- Status de completude, ativação do canal, validação local e eventos de webhook.
- Endpoint preparado para webhook: `/api/webhooks/whatsapp/{cityId}`.
- Tutorial mastigado para o cliente com links oficiais da Meta/WhatsApp.
- Botão público de WhatsApp oficial quando houver número configurado.
- Auditoria para salvamento/teste de configuração.
- Scripts Windows mantidos para localhost.

## 🟡 Parcial/preparado
- Validação local não chama a API real da Meta nesta fase para evitar falhas por credenciais incompletas.
- Webhook recebe eventos e registra payload, mas o processamento automático de mensagens fica para próxima fase.
- Tokens são mascarados na interface; em produção, trocar a codificação local por criptografia forte com chave de backend.

## 🔴 Pendente
- Envio real pela WhatsApp Cloud API.
- Criação automática de ocorrência por conversa.
- Janela conversacional, templates aprovados e status de entrega em produção.
- PostgreSQL/PostGIS e storage externo.
- Painel multi-tenant comercial completo.

## Arquivos alterados
- `server/db.js`
- `server/index.js`
- `public/app.js`
- `public/styles.css`
- `VERSAO_ATUAL.txt`

## Testes/checks
- `npm run check`
- `/api/health`
- login demo
- `/api/whatsapp/config`
- salvamento/teste local de WhatsApp
- abertura do portal
