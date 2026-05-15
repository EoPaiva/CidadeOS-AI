-- CidadeOS AI — Schema inicial sugerido para Supabase/PostgreSQL
-- Execute em uma base de teste antes de produção.

create table if not exists cities (
  id text primary key,
  name text not null,
  state text,
  country text default 'Brasil',
  slug text unique,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists neighborhoods (
  id text primary key,
  city_id text references cities(id) on delete cascade,
  name text not null,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists departments (
  id text primary key,
  city_id text references cities(id) on delete cascade,
  name text not null,
  description text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists users_profiles (
  id text primary key,
  city_id text references cities(id) on delete set null,
  name text not null,
  email text unique not null,
  phone text,
  role text not null,
  department_id text references departments(id) on delete set null,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists occurrences (
  id text primary key,
  city_id text references cities(id) on delete cascade,
  protocol text unique not null,
  title text not null,
  description text not null,
  category_id text,
  subcategory_id text,
  neighborhood_id text references neighborhoods(id) on delete set null,
  department_id text references departments(id) on delete set null,
  assigned_agent_id text references users_profiles(id) on delete set null,
  priority text not null default 'MEDIA',
  status text not null default 'RECEBIDO',
  address text,
  reference_point text,
  latitude numeric,
  longitude numeric,
  public_visibility boolean default true,
  duplicate_of_id text references occurrences(id) on delete set null,
  sla_due_at timestamptz,
  public_message text,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists occurrence_status_history (
  id text primary key,
  occurrence_id text references occurrences(id) on delete cascade,
  changed_by text references users_profiles(id) on delete set null,
  old_status text,
  new_status text not null,
  comment text,
  public_message text,
  created_at timestamptz default now()
);

create table if not exists whatsapp_channels (
  id text primary key,
  city_id text references cities(id) on delete cascade,
  channel_name text,
  official_phone text,
  phone_number_id text,
  waba_id text,
  app_id text,
  access_token_encrypted text,
  app_secret_encrypted text,
  verify_token_encrypted text,
  enabled boolean default false,
  connection_status text default 'PENDENTE_CONFIGURACAO',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists whatsapp_messages (
  id text primary key,
  city_id text references cities(id) on delete cascade,
  channel_id text references whatsapp_channels(id) on delete set null,
  occurrence_id text references occurrences(id) on delete set null,
  citizen_phone text,
  direction text,
  message_type text,
  message_body text,
  meta_message_id text,
  status text,
  payload_json jsonb,
  created_at timestamptz default now()
);

create table if not exists audit_logs (
  id text primary key,
  city_id text references cities(id) on delete set null,
  user_id text references users_profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
