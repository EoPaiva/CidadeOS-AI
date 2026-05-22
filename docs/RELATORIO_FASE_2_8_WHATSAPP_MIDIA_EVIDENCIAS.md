# Relatório — Fase 2.8 WhatsApp Mídia como Evidência

Data: 2026-05-22

## Objetivo

Vincular automaticamente mídias recebidas pelo WhatsApp às evidências da ocorrência quando a mensagem vira protocolo ou quando é vinculada a um protocolo existente.

## Implementado

- Webhook serverless passa a preservar o corpo bruto para validação de assinatura da Meta.
- Upload de mídia do WhatsApp para Supabase Storage usa REST com Service Role, sem cliente `supabase` inexistente no serverless.
- Mensagens do WhatsApp agora expõem estado de mídia: `hasMedia`, `mediaStoragePath`, `mediaDownloadPending` e erro de download quando existir.
- Ao criar ocorrência a partir de mensagem com mídia já baixada, o backend cria automaticamente um registro em `occurrence_attachments`.
- Ao vincular mensagem com mídia a protocolo existente, o backend cria automaticamente o anexo correspondente.
- Duplicidade é evitada por `occurrence_id + storage_path`.
- Se a mídia ainda não foi baixada, o protocolo continua e uma auditoria `WHATSAPP_MEDIA_ATTACHMENT_PENDING` registra a pendência.
- Galeria de evidências exibe origem `whatsapp` quando o anexo é criado.
- Modo local/demo foi alinhado com o mesmo contrato de mídia e fallback.
- Rota serverless `/api/whatsapp/send-template` foi ativada para completar a camada já prevista de templates.
- Rota local `/api/whatsapp/messages/:id/send-prepared` agora retorna fallback controlado em vez de 404.

## Banco de dados

Sem SQL obrigatório novo na Fase 2.8.

A implementação reutiliza as pendências acumuladas das Fases 2.5 e 2.7 em `docs/CIDADEOS_DATABASE_PENDENTE_2_3_EM_DIANTE.md`. O backend possui fallback caso `source` e `metadata` ainda não existam em `occurrence_attachments`.

## Cuidados aplicados

- Nenhuma migração foi executada.
- Nenhuma operação destrutiva foi adicionada.
- Nenhum segredo foi escrito no frontend, README ou logs.
- Conversão/vínculo de protocolo não é bloqueado por falha de download da mídia.

## Validação

Validações executadas com sucesso em 2026-05-22:

```bash
node --check api/[...path].js
node --check public/app.js
npm run check
npm run build
```

QA local adicional:

- `npm run dev` em `http://127.0.0.1:3333`.
- Playwright com Chrome local, porque o Browser interno não estava disponível via ferramenta nesta sessão.
- Login demo, simulação de mensagem WhatsApp com `mediaStoragePath`, abertura da aba Triagem WhatsApp, conversão para ocorrência e conferência via API local.
- Resultado: 1 ocorrência criada para a mensagem, 1 anexo `source=whatsapp`, `storagePath=demo/whatsapp/fase-28-evidencia-c.jpg`, sem erros de console.
- Ações de criar/vincular deixam de aparecer em mensagens já convertidas ou vinculadas, evitando protocolo duplicado.
