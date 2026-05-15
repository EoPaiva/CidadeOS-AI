-- CidadeOS AI — Fase 2.7
-- NÃO rodar agora se estiver seguindo o controle acumulado.

alter table if exists public.whatsapp_messages
  add column if not exists media_storage_bucket text,
  add column if not exists media_storage_path text,
  add column if not exists media_downloaded_at timestamptz;

alter table if exists public.whatsapp_channels
  add column if not exists signature_validation_enabled boolean not null default false,
  add column if not exists templates_status_json jsonb not null default '{}'::jsonb;

create index if not exists idx_whatsapp_messages_media_storage_path on public.whatsapp_messages(media_storage_path);
create index if not exists idx_whatsapp_messages_type_created on public.whatsapp_messages(message_type, created_at desc);
