# CidadeOS AI — Fase 2.1 WhatsApp Real + Triagem de Mensagens

## 🟢 Implementado

- Nova área **Triagem WhatsApp** no painel interno.
- Mensagens recebidas pelo webhook agora carregam sugestão de categoria, prioridade e setor.
- Simulador local de mensagem WhatsApp para testar o fluxo sem depender da Meta.
- Conversão de mensagem recebida em ocorrência oficial com protocolo.
- Vinculação manual de mensagem a protocolo existente.
- Arquivamento de mensagens que não devem virar ocorrência.
- Ação “Solicitar dados” com resposta preparada para o cidadão informar endereço/bairro/referência.
- Respostas preparadas para copiar e enviar manualmente quando a Cloud API ainda não estiver 100% ativa.
- Histórico interno registra quando uma mensagem vira ocorrência ou é vinculada.
- Estruturas locais preparadas para `whatsappConversations` e `whatsappOccurrenceLinks`.
- Painel WhatsApp mostra status, mensagens, protocolo vinculado e eventos do webhook.
- `.bat` e diagnóstico preservados.

## 🟡 Parcial/preparado

- Envio real pela WhatsApp Cloud API ainda não é disparado automaticamente.
- A classificação é heurística/local por palavras-chave, preparada para IA futura.
- Webhook real recebe payload da Meta, mas o fluxo completo de conversa guiada ainda será evoluído.
- Banco segue local em JSON para facilitar localhost.

## 🔴 Pendente

- Envio real de mensagens pela Cloud API.
- IA classificando e extraindo endereço automaticamente.
- PostgreSQL/PostGIS.
- Mapa de calor real.
- Multi-tenant comercial completo.
- Painel de planos/pagamentos.

## Arquivos alterados

- `server/index.js`
- `server/db.js`
- `public/app.js`
- `public/styles.css`
- `VERSAO_ATUAL.txt`
- `docs/RELATORIO_FASE_2_1_WHATSAPP_TRIAGEM.md`

## Testes/checks

- `npm run check`
- `/api/health`
- login demo
- `/api/whatsapp/config`
- `/api/whatsapp/simulate-message`
- conversão de mensagem em ocorrência
