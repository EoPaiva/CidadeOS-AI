# CidadeOS AI — Fase 2.7
## WhatsApp Mídia + Templates + Segurança de Webhook

🟢 Implementado

- Validação opcional da assinatura `X-Hub-Signature-256`.
- Suporte a `META_APP_SECRET` / `WHATSAPP_APP_SECRET`.
- Recebimento de mídia pelo webhook da Meta: imagem, documento, áudio e vídeo.
- Download da mídia recebida pela Meta quando houver Access Token.
- Upload da mídia recebida para Supabase Storage no bucket `occurrence-attachments`.
- Registro da mídia no payload de `whatsapp_messages`.
- Auditoria para mídia salva ou falha ao baixar/salvar.
- Envio de templates aprovados via rota `/api/whatsapp/send-template`.
- Registro de mensagens de template em `whatsapp_messages`.
- Triagem WhatsApp com indicação de mídia recebida.
- Controle acumulado de database desde a Fase 2.3 atualizado.

🟡 Parcial / preparado

- A mídia é salva e rastreada no payload da mensagem WhatsApp.
- O vínculo automático da mídia com uma ocorrência existente pode ser refinado na próxima fase.
- A validação de assinatura fica desativada por padrão no preview para não travar testes.
- Templates exigem aprovação prévia no WhatsApp Manager.

🔴 Pendente

- Criar ocorrência automaticamente já com mídia do WhatsApp como anexo oficial.
- Exibir mídia recebida do WhatsApp dentro da galeria de evidências por padrão.
- Painel de status dos templates aprovados.
- IA para classificar mensagem e sugerir bairro/endereço.
- Regras avançadas por cidade/tenant.

## Testes

- `node --check api/[...path].js`
- `node --check public/app.js`
- `npm run check`
- `npm run build`
