# CidadeOS AI — Fase 2.6
## WhatsApp Cloud API Real + Protocolo pelo WhatsApp

🟢 Implementado

- Webhook real da Meta em `/api/webhooks/whatsapp/{cityId}`.
- Verificação `hub.challenge` com Verify Token configurado por cidade.
- Registro de eventos recebidos em `whatsapp_webhook_events`.
- Processamento de mensagens recebidas da Meta:
  - texto;
  - imagem;
  - documento;
  - áudio/vídeo como payload preparado;
  - status de entrega.
- Mensagens reais entram na `Triagem WhatsApp`.
- Conversas são criadas/atualizadas em `whatsapp_conversations`.
- Envio real de texto pela WhatsApp Cloud API quando o canal tem:
  - canal ativo;
  - Phone Number ID;
  - Access Token;
  - Verify Token.
- Botão para enviar resposta preparada pela Cloud API.
- Teste de Cloud API no painel de WhatsApp Business.
- Fallback seguro quando credenciais estão incompletas.
- Auditoria para testes, envio real, falha de envio e protocolo enviado.
- Localhost e modo demo preservados.

🟡 Parcial / preparado

- Mídia recebida pelo WhatsApp é registrada no payload e preparada para virar evidência.
- Download real de mídia da Meta para Supabase Storage fica para próxima fase.
- Templates aprovados ficam registrados, mas o envio desta fase usa mensagem de texto dentro da janela permitida pela Cloud API.
- Criptografia real dos tokens por cidade deve ser reforçada antes de produção.

🔴 Pendente

- Baixar mídia real da Meta e salvar no Supabase Storage.
- Enviar templates aprovados da Meta fora da janela de atendimento.
- Validar assinatura `X-Hub-Signature-256`.
- IA para classificar mensagem e extrair endereço automaticamente.
- Multi-tenant comercial final.

## Testes

- `node --check api/[...path].js`
- `node --check public/app.js`
- `npm run check`
- `npm run build`
