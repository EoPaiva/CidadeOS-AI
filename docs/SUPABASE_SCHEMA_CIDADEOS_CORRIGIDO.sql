-- ============================================================
-- CidadeOS AI — Supabase/Postgres completo
-- Teste compartilhado + base futura
-- Versão corrigida: seed de usuários demo ajustado
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cidadeos_user_role') then
    create type cidadeos_user_role as enum (
      'super_admin','city_admin','department_manager','agent','health_agent','defense_civil_agent','citizen','family_member','rural_producer','tester'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'cidadeos_occurrence_status') then
    create type cidadeos_occurrence_status as enum (
      'recebido','em_analise','encaminhado','em_execucao','aguardando_terceiro','aguardando_cidadao','resolvido','cancelado','duplicado','arquivado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'cidadeos_priority') then
    create type cidadeos_priority as enum ('baixa','media','alta','critica');
  end if;

  if not exists (select 1 from pg_type where typname = 'cidadeos_visibility') then
    create type cidadeos_visibility as enum ('publica','interna','restrita');
  end if;

  if not exists (select 1 from pg_type where typname = 'cidadeos_whatsapp_message_direction') then
    create type cidadeos_whatsapp_message_direction as enum ('received','sent','prepared','failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'cidadeos_whatsapp_processing_status') then
    create type cidadeos_whatsapp_processing_status as enum (
      'novo','pendente_triagem','aguardando_informacoes','convertido_ocorrencia','vinculado_protocolo','arquivado','erro'
    );
  end if;
end $$;

-- ============================================================
-- FUNÇÕES
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create sequence if not exists public.cidadeos_protocol_seq start 1;

create or replace function public.generate_cidadeos_protocol()
returns text
language plpgsql
as $$
declare
  seq_value bigint;
begin
  seq_value := nextval('public.cidadeos_protocol_seq');
  return 'CID-' || to_char(now(), 'YYYY') || '-' || lpad(seq_value::text, 6, '0');
end;
$$;

-- ============================================================
-- TABELAS PRINCIPAIS
-- ============================================================

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text,
  country text not null default 'Brasil',
  slug text unique not null,
  official_email text,
  official_phone text,
  official_website text,
  logo_url text,
  primary_color text default '#0A1F3D',
  secondary_color text default '#19A7A8',
  active boolean not null default true,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_cities_updated_at on public.cities;
create trigger trg_cities_updated_at before update on public.cities for each row execute function public.set_updated_at();

create table if not exists public.neighborhoods (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  zone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_id, name)
);
drop trigger if exists trg_neighborhoods_updated_at on public.neighborhoods;
create trigger trg_neighborhoods_updated_at before update on public.neighborhoods for each row execute function public.set_updated_at();

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  description text,
  contact_email text,
  contact_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_id, name)
);
drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at before update on public.departments for each row execute function public.set_updated_at();

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete set null,
  name text not null,
  email text unique,
  phone text,
  password_hash text,
  role cidadeos_user_role not null default 'citizen',
  department_id uuid references public.departments(id) on delete set null,
  active boolean not null default true,
  last_login_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at before update on public.app_users for each row execute function public.set_updated_at();

create table if not exists public.occurrence_categories (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  module text not null,
  description text,
  icon text,
  color text,
  default_department_id uuid references public.departments(id) on delete set null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_occurrence_categories_updated_at on public.occurrence_categories;
create trigger trg_occurrence_categories_updated_at before update on public.occurrence_categories for each row execute function public.set_updated_at();

create table if not exists public.occurrence_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.occurrence_categories(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  default_priority cidadeos_priority not null default 'media',
  default_sla_hours int,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id, key)
);
drop trigger if exists trg_occurrence_subcategories_updated_at on public.occurrence_subcategories;
create trigger trg_occurrence_subcategories_updated_at before update on public.occurrence_subcategories for each row execute function public.set_updated_at();

create table if not exists public.occurrences (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  protocol text unique not null default public.generate_cidadeos_protocol(),
  title text not null,
  description text not null,
  category_id uuid references public.occurrence_categories(id) on delete set null,
  subcategory_id uuid references public.occurrence_subcategories(id) on delete set null,
  neighborhood_id uuid references public.neighborhoods(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  assigned_agent_id uuid references public.app_users(id) on delete set null,
  citizen_user_id uuid references public.app_users(id) on delete set null,
  citizen_name text,
  citizen_phone text,
  citizen_email text,
  priority cidadeos_priority not null default 'media',
  status cidadeos_occurrence_status not null default 'recebido',
  origin text not null default 'portal',
  source_channel text,
  address text,
  reference_point text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  public_visibility boolean not null default true,
  duplicate_of_id uuid references public.occurrences(id) on delete set null,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  public_message text,
  internal_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_occurrences_city_status on public.occurrences(city_id, status);
create index if not exists idx_occurrences_protocol on public.occurrences(protocol);
create index if not exists idx_occurrences_created_at on public.occurrences(created_at desc);
drop trigger if exists trg_occurrences_updated_at on public.occurrences;
create trigger trg_occurrences_updated_at before update on public.occurrences for each row execute function public.set_updated_at();

create table if not exists public.occurrence_status_history (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  changed_by uuid references public.app_users(id) on delete set null,
  old_status cidadeos_occurrence_status,
  new_status cidadeos_occurrence_status not null,
  comment text,
  public_message text,
  visibility cidadeos_visibility not null default 'interna',
  created_at timestamptz not null default now()
);
create index if not exists idx_occurrence_status_history_occurrence on public.occurrence_status_history(occurrence_id);

create table if not exists public.occurrence_comments (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  comment text not null,
  visibility cidadeos_visibility not null default 'interna',
  created_at timestamptz not null default now()
);

create table if not exists public.occurrence_attachments (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid references public.occurrences(id) on delete cascade,
  city_id uuid references public.cities(id) on delete cascade,
  uploaded_by uuid references public.app_users(id) on delete set null,
  file_url text not null,
  storage_bucket text default 'occurrence-attachments',
  storage_path text,
  file_type text,
  file_name text,
  file_size_bytes bigint,
  visibility cidadeos_visibility not null default 'publica',
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  neighborhood_id uuid references public.neighborhoods(id) on delete set null,
  title text not null,
  message text not null,
  severity cidadeos_priority not null default 'media',
  category text,
  active boolean not null default true,
  starts_at timestamptz default now(),
  ends_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_alerts_updated_at on public.alerts;
create trigger trg_alerts_updated_at before update on public.alerts for each row execute function public.set_updated_at();

create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null,
  summary text,
  metrics_json jsonb not null default '{}'::jsonb,
  generated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(city_id, month, year)
);

create table if not exists public.module_configs (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  module_name text not null,
  enabled boolean not null default false,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_id, module_name)
);
drop trigger if exists trg_module_configs_updated_at on public.module_configs;
create trigger trg_module_configs_updated_at before update on public.module_configs for each row execute function public.set_updated_at();

-- ============================================================
-- WHATSAPP BUSINESS
-- ============================================================

create table if not exists public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  channel_name text not null default 'WhatsApp Oficial',
  official_phone text,
  default_department_id uuid references public.departments(id) on delete set null,
  business_portfolio_id text,
  waba_id text,
  phone_number_id text,
  app_id text,
  app_secret_encrypted text,
  access_token_encrypted text,
  verify_token_encrypted text,
  webhook_url text,
  templates_json jsonb not null default '{}'::jsonb,
  business_hours_json jsonb not null default '{}'::jsonb,
  default_welcome_message text,
  protocol_created_message text,
  status_updated_message text,
  enabled boolean not null default false,
  connection_status text not null default 'nao_configurado',
  last_verified_at timestamptz,
  last_error text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_id, phone_number_id)
);
drop trigger if exists trg_whatsapp_channels_updated_at on public.whatsapp_channels;
create trigger trg_whatsapp_channels_updated_at before update on public.whatsapp_channels for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  channel_id uuid references public.whatsapp_channels(id) on delete set null,
  citizen_phone text not null,
  citizen_name text,
  status text not null default 'aberta',
  last_message_at timestamptz,
  occurrence_id uuid references public.occurrences(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_whatsapp_conversations_city_phone on public.whatsapp_conversations(city_id, citizen_phone);
drop trigger if exists trg_whatsapp_conversations_updated_at on public.whatsapp_conversations;
create trigger trg_whatsapp_conversations_updated_at before update on public.whatsapp_conversations for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  channel_id uuid references public.whatsapp_channels(id) on delete set null,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  occurrence_id uuid references public.occurrences(id) on delete set null,
  citizen_phone text,
  direction cidadeos_whatsapp_message_direction not null default 'received',
  processing_status cidadeos_whatsapp_processing_status not null default 'novo',
  message_type text,
  message_body text,
  prepared_response text,
  meta_message_id text,
  payload_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_whatsapp_messages_city_status on public.whatsapp_messages(city_id, processing_status);
create index if not exists idx_whatsapp_messages_created_at on public.whatsapp_messages(created_at desc);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete set null,
  channel_id uuid references public.whatsapp_channels(id) on delete set null,
  event_type text,
  payload_json jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.whatsapp_occurrence_links (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  whatsapp_message_id uuid references public.whatsapp_messages(id) on delete cascade,
  occurrence_id uuid references public.occurrences(id) on delete cascade,
  link_type text not null default 'created_from_message',
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(whatsapp_message_id, occurrence_id)
);

-- ============================================================
-- MÓDULOS FUTUROS
-- ============================================================

create table if not exists public.dengue_reports (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  inspected boolean not null default false,
  inspection_date timestamptz,
  larvae_found boolean,
  action_taken text,
  agent_id uuid references public.app_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_dengue_reports_updated_at on public.dengue_reports;
create trigger trg_dengue_reports_updated_at before update on public.dengue_reports for each row execute function public.set_updated_at();

create table if not exists public.water_issues (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  issue_type text,
  recurring boolean not null default false,
  estimated_severity text,
  company_notified boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_water_issues_updated_at on public.water_issues;
create trigger trg_water_issues_updated_at before update on public.water_issues for each row execute function public.set_updated_at();

create table if not exists public.elder_care_records (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  person_name text not null,
  neighborhood_id uuid references public.neighborhoods(id) on delete set null,
  risk_level cidadeos_priority not null default 'media',
  responsible_family_contact text,
  assigned_health_agent_id uuid references public.app_users(id) on delete set null,
  last_checkin_at timestamptz,
  notes text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_elder_care_records_updated_at on public.elder_care_records;
create trigger trg_elder_care_records_updated_at before update on public.elder_care_records for each row execute function public.set_updated_at();

create table if not exists public.rural_reports (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  producer_id uuid references public.app_users(id) on delete set null,
  road_name text,
  production_impact text,
  climate_risk text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_rural_reports_updated_at on public.rural_reports;
create trigger trg_rural_reports_updated_at before update on public.rural_reports for each row execute function public.set_updated_at();

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete set null,
  user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_city_created on public.audit_logs(city_id, created_at desc);

-- ============================================================
-- VIEWS
-- ============================================================

create or replace view public.v_public_occurrence_summary as
select
  o.id,
  o.city_id,
  c.name as city_name,
  o.protocol,
  o.title,
  o.status,
  o.priority,
  o.origin,
  o.created_at,
  o.updated_at,
  o.resolved_at,
  n.name as neighborhood_name,
  d.name as department_name,
  cat.name as category_name,
  o.public_message
from public.occurrences o
join public.cities c on c.id = o.city_id
left join public.neighborhoods n on n.id = o.neighborhood_id
left join public.departments d on d.id = o.department_id
left join public.occurrence_categories cat on cat.id = o.category_id
where o.public_visibility = true;

create or replace view public.v_city_dashboard_metrics as
select
  city_id,
  count(*) as total_occurrences,
  count(*) filter (where status in ('recebido','em_analise','encaminhado','em_execucao','aguardando_terceiro','aguardando_cidadao')) as open_occurrences,
  count(*) filter (where status = 'resolvido') as resolved_occurrences,
  count(*) filter (where priority = 'critica') as critical_occurrences,
  count(*) filter (where sla_due_at is not null and sla_due_at < now() and status not in ('resolvido','cancelado','arquivado','duplicado')) as overdue_occurrences
from public.occurrences
group by city_id;

-- ============================================================
-- STORAGE
-- ============================================================

insert into storage.buckets (id, name, public)
values ('occurrence-attachments', 'occurrence-attachments', false)
on conflict (id) do nothing;

drop policy if exists "CidadeOS attachments insert authenticated" on storage.objects;
drop policy if exists "CidadeOS attachments read authenticated" on storage.objects;

create policy "CidadeOS attachments insert authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'occurrence-attachments');

create policy "CidadeOS attachments read authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'occurrence-attachments');

-- ============================================================
-- RLS + POLICIES PÚBLICAS MÍNIMAS
-- ============================================================

alter table public.cities enable row level security;
alter table public.neighborhoods enable row level security;
alter table public.departments enable row level security;
alter table public.app_users enable row level security;
alter table public.occurrence_categories enable row level security;
alter table public.occurrence_subcategories enable row level security;
alter table public.occurrences enable row level security;
alter table public.occurrence_status_history enable row level security;
alter table public.occurrence_comments enable row level security;
alter table public.occurrence_attachments enable row level security;
alter table public.alerts enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.module_configs enable row level security;
alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_occurrence_links enable row level security;
alter table public.dengue_reports enable row level security;
alter table public.water_issues enable row level security;
alter table public.elder_care_records enable row level security;
alter table public.rural_reports enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "public can read active cities" on public.cities;
create policy "public can read active cities" on public.cities for select to anon, authenticated using (active = true);

drop policy if exists "public can read neighborhoods" on public.neighborhoods;
create policy "public can read neighborhoods" on public.neighborhoods for select to anon, authenticated using (active = true);

drop policy if exists "public can read departments" on public.departments;
create policy "public can read departments" on public.departments for select to anon, authenticated using (active = true);

drop policy if exists "public can read categories" on public.occurrence_categories;
create policy "public can read categories" on public.occurrence_categories for select to anon, authenticated using (active = true);

drop policy if exists "public can read subcategories" on public.occurrence_subcategories;
create policy "public can read subcategories" on public.occurrence_subcategories for select to anon, authenticated using (active = true);

drop policy if exists "public can create occurrence" on public.occurrences;
create policy "public can create occurrence" on public.occurrences for insert to anon, authenticated with check (true);

drop policy if exists "public can read public occurrence summary" on public.occurrences;
create policy "public can read public occurrence summary" on public.occurrences for select to anon, authenticated using (public_visibility = true);

drop policy if exists "public can read active alerts" on public.alerts;
create policy "public can read active alerts" on public.alerts for select to anon, authenticated using (active = true);

drop policy if exists "public can read reports" on public.monthly_reports;
create policy "public can read reports" on public.monthly_reports for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.cities to anon, authenticated;
grant select on public.neighborhoods to anon, authenticated;
grant select on public.departments to anon, authenticated;
grant select on public.occurrence_categories to anon, authenticated;
grant select on public.occurrence_subcategories to anon, authenticated;
grant insert, select on public.occurrences to anon, authenticated;
grant select on public.alerts to anon, authenticated;
grant select on public.monthly_reports to anon, authenticated;
grant select on public.v_public_occurrence_summary to anon, authenticated;
grant select on public.v_city_dashboard_metrics to anon, authenticated;

-- ============================================================
-- SEEDS INICIAIS
-- ============================================================

insert into public.cities (name, state, slug, official_phone, demo)
values ('Cidade Modelo', 'SP', 'cidade-modelo', '+55 12 00000-0000', true)
on conflict (slug) do update set name = excluded.name, state = excluded.state, official_phone = excluded.official_phone, demo = excluded.demo, updated_at = now();

with city as (select id from public.cities where slug = 'cidade-modelo')
insert into public.neighborhoods (city_id, name, zone)
select city.id, x.name, x.zone
from city, (values ('Centro','urbana'),('Jardim América','urbana'),('Bairro Alto','urbana'),('Vila Nova','urbana'),('Zona Rural','rural')) as x(name, zone)
on conflict (city_id, name) do nothing;

with city as (select id from public.cities where slug = 'cidade-modelo')
insert into public.departments (city_id, name, description)
select city.id, x.name, x.description
from city,
(values
  ('Zeladoria Urbana','Buracos, iluminação, lixo, praças e vias públicas.'),
  ('Defesa Civil','Alagamentos, quedas de árvores, áreas de risco e eventos climáticos.'),
  ('Vigilância Sanitária','Dengue, focos de mosquito, terrenos abandonados e risco sanitário.'),
  ('Água e Saneamento','Vazamentos, falta d’água, baixa pressão e esgoto.'),
  ('Assistência Social','Idosos vulneráveis, pedidos de visita e situação de risco social.'),
  ('Obras Rurais','Estradas rurais, pontes, acessos e infraestrutura rural.')
) as x(name, description)
on conflict (city_id, name) do nothing;

insert into public.occurrence_categories (key, name, module, description, icon, color, sort_order)
values
  ('urbano','Zeladoria Urbana','PrevenCidade','Buracos, iluminação, limpeza urbana e espaços públicos.','building-2','#0A1F3D',1),
  ('defesa_civil','Defesa Civil','PrevenCidade','Alagamentos, queda de árvores e situações de risco.','shield-alert','#B42318',2),
  ('saude_publica','Saúde Pública','DengueMap','Focos de dengue, água parada e risco sanitário.','heart-pulse','#157347',3),
  ('agua_saneamento','Água e Saneamento','ÁguaGuard','Vazamentos, falta d’água e esgoto irregular.','droplets','#0E3A5E',4),
  ('assistencia_social','Assistência Social','CuidaVila','Idosos vulneráveis, visitas e situações de risco social.','users','#5A6878',5),
  ('zona_rural','Zona Rural','AgroRadar','Estradas rurais, pontes e riscos à produção.','tractor','#795548',6),
  ('clima_alertas','Clima e Alertas','Alertas AI','Chuvas fortes, calor extremo e comunicados oficiais.','cloud-lightning','#B54708',7)
on conflict (key) do update set name = excluded.name, module = excluded.module, description = excluded.description, icon = excluded.icon, color = excluded.color, sort_order = excluded.sort_order, updated_at = now();

with cats as (select id, key from public.occurrence_categories)
insert into public.occurrence_subcategories (category_id, key, name, default_priority, default_sla_hours, sort_order)
select cats.id, x.subkey, x.name, x.priority::cidadeos_priority, x.sla, x.sort_order
from cats
join (values
  ('urbano','buraco','Buraco na via','media',72,1),
  ('urbano','iluminacao','Iluminação pública','media',72,2),
  ('urbano','lixo','Lixo acumulado','media',72,3),
  ('defesa_civil','alagamento','Alagamento','critica',2,1),
  ('defesa_civil','arvore_caida','Queda de árvore','alta',24,2),
  ('saude_publica','dengue','Foco de dengue','alta',24,1),
  ('saude_publica','agua_parada','Água parada','alta',24,2),
  ('agua_saneamento','vazamento','Vazamento de água','alta',24,1),
  ('agua_saneamento','falta_agua','Falta d’água','alta',24,2),
  ('assistencia_social','idoso_vulneravel','Idoso vulnerável','alta',24,1),
  ('zona_rural','estrada_rural','Estrada rural','media',72,1),
  ('zona_rural','ponte','Ponte danificada','alta',24,2),
  ('clima_alertas','chuva_forte','Chuva forte','alta',12,1)
) as x(catkey, subkey, name, priority, sla, sort_order)
on cats.key = x.catkey
on conflict (category_id, key) do update set name = excluded.name, default_priority = excluded.default_priority, default_sla_hours = excluded.default_sla_hours, sort_order = excluded.sort_order, updated_at = now();

with city as (select id from public.cities where slug = 'cidade-modelo')
insert into public.module_configs (city_id, module_name, enabled, config_json)
select city.id, x.module_name, x.enabled, '{}'::jsonb
from city, (values ('PrevenCidade',true),('DengueMap',true),('ÁguaGuard',true),('CuidaVila',false),('AgroRadar',false),('Alertas AI',true),('WhatsApp Business',false)) as x(module_name, enabled)
on conflict (city_id, module_name) do update set enabled = excluded.enabled, updated_at = now();

with city as (select id from public.cities where slug = 'cidade-modelo')
insert into public.alerts (city_id, title, message, severity, category, active)
select city.id, x.title, x.message, x.severity::cidadeos_priority, x.category, true
from city,
(values
  ('Orientação preventiva contra dengue','Evite água parada em recipientes, calhas, pneus e terrenos. Registre focos suspeitos pelo portal.','alta','Saúde Pública'),
  ('Canal oficial de ocorrências','Use este portal para registrar solicitações e acompanhar o andamento por protocolo.','media','Atendimento ao Cidadão')
) as x(title, message, severity, category)
where not exists (select 1 from public.alerts a where a.city_id = city.id and a.title = x.title);

-- Usuários demo corrigidos
with city as (
  select id from public.cities where slug = 'cidade-modelo'
),
users_seed as (
  select * from (values
    ('Administrador CidadeOS','admin@cidadeos.local','city_admin',null),
    ('Agente de Zeladoria','agente@cidadeos.local','agent','Zeladoria Urbana'),
    ('Super Admin CidadeOS','super@cidadeos.local','super_admin',null),
    ('Testador Externo','tester@cidadeos.local','tester',null)
  ) as x(name, email, role, department_name)
),
deps as (
  select id, city_id, name from public.departments
)
insert into public.app_users (city_id, name, email, role, department_id, active, metadata)
select city.id, users_seed.name, users_seed.email, users_seed.role::cidadeos_user_role, deps.id, true, '{"demo": true}'::jsonb
from city
cross join users_seed
left join deps on deps.city_id = city.id and deps.name = users_seed.department_name
on conflict (email) do update set
  name = excluded.name,
  role = excluded.role,
  department_id = excluded.department_id,
  active = true,
  metadata = excluded.metadata,
  updated_at = now();

-- ============================================================
-- FIM
-- ============================================================
