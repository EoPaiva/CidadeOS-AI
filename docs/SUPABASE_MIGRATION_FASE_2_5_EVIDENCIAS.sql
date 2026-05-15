-- ============================================================
-- CidadeOS AI — Fase 2.5
-- Gestão de Evidências + Galeria de Anexos + Auditoria
-- Execute no Supabase SQL Editor antes/depois do deploy.
-- Seguro para rodar mais de uma vez.
-- ============================================================

alter table public.occurrence_attachments
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.app_users(id) on delete set null,
  add column if not exists archived_reason text,
  add column if not exists deleted_at timestamptz,
  add column if not exists source text default 'registro',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_occurrence_attachments_visibility on public.occurrence_attachments(visibility);
create index if not exists idx_occurrence_attachments_archived_at on public.occurrence_attachments(archived_at);
create index if not exists idx_occurrence_attachments_source on public.occurrence_attachments(source);

-- View de evidências ativas para consultas operacionais futuras.
create or replace view public.v_active_occurrence_attachments as
select
  a.id,
  a.occurrence_id,
  a.city_id,
  a.uploaded_by,
  a.file_url,
  a.storage_bucket,
  a.storage_path,
  a.file_type,
  a.file_name,
  a.file_size_bytes,
  a.visibility,
  a.source,
  a.created_at,
  a.archived_at
from public.occurrence_attachments a
where a.archived_at is null
  and a.deleted_at is null;

grant select on public.v_active_occurrence_attachments to anon, authenticated;
