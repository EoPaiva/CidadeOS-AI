-- ============================================================
-- CidadeOS AI — Fase 2.6 WhatsApp Cloud API Real
-- Migração opcional/segura para reforçar rastreabilidade
-- ============================================================

alter table if exists public.whatsapp_channels
  add column if not exists last_message_sent_at timestamptz,
  add column if not exists last_message_received_at timestamptz;

alter table if exists public.whatsapp_messages
  add column if not exists sent_by uuid references public.app_users(id) on delete set null;

create index if not exists idx_whatsapp_messages_meta_message_id
on public.whatsapp_messages(meta_message_id);

create index if not exists idx_whatsapp_channels_phone_number_id
on public.whatsapp_channels(phone_number_id);
