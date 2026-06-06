# CidadeOS AI — Database pendente desde a Fase 2.3

Este arquivo acumula tudo que precisa ser rodado no Supabase depois da Fase 2.3.
Regra combinada: não rodar a cada sprint. Rodar somente quando o usuário pedir o SQL completo.

## Fase 2.4

Sem SQL obrigatório novo. Usa estruturas já previstas na Fase 2.3: `occurrence_attachments`, bucket `occurrence-attachments` e visibilidade.

## Fase 2.5 — Evidências / Anexos

```sql
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
```

## Fase 2.6 — WhatsApp Cloud API

```sql
alter table if exists public.whatsapp_channels
  add column if not exists last_message_sent_at timestamptz,
  add column if not exists last_message_received_at timestamptz;

alter table if exists public.whatsapp_messages
  add column if not exists sent_by uuid references public.app_users(id) on delete set null;

create index if not exists idx_whatsapp_messages_meta_message_id on public.whatsapp_messages(meta_message_id);
create index if not exists idx_whatsapp_channels_phone_number_id on public.whatsapp_channels(phone_number_id);
```

## Fase 2.7 — WhatsApp Mídia + Templates + Segurança de Webhook

```sql
alter table if exists public.whatsapp_messages
  add column if not exists media_storage_bucket text,
  add column if not exists media_storage_path text,
  add column if not exists media_downloaded_at timestamptz;

alter table if exists public.whatsapp_channels
  add column if not exists signature_validation_enabled boolean not null default false,
  add column if not exists templates_status_json jsonb not null default '{}'::jsonb;

create index if not exists idx_whatsapp_messages_media_storage_path on public.whatsapp_messages(media_storage_path);
create index if not exists idx_whatsapp_messages_type_created on public.whatsapp_messages(message_type, created_at desc);
```

## Fase 2.8 — Vínculo automático de mídia WhatsApp com evidências

Sem SQL obrigatório novo.

A Fase 2.8 reutiliza:

- `public.whatsapp_messages.media_storage_bucket`, `media_storage_path` e `media_downloaded_at` da Fase 2.7.
- `public.occurrence_attachments.source` e `metadata` da Fase 2.5 para marcar evidências vindas do WhatsApp.
- bucket `occurrence-attachments`, ou `WHATSAPP_MEDIA_BUCKET` quando configurado.

O backend foi preparado com fallback: se `source`/`metadata` ainda não existirem em `occurrence_attachments`, o vínculo do anexo tenta gravar os campos básicos sem bloquear a conversão da mensagem em protocolo. Não aplicar nada agora; manter acumulado até o pedido explícito do SQL completo.

## Fase 2.9 — Triagem inteligente por regras locais

Sem SQL obrigatório novo.

A Fase 2.9 calcula sugestões de triagem sob demanda no backend/local/demo usando palavras-chave e estruturas já existentes:

- `occurrence_categories`
- `occurrence_subcategories`
- `departments`
- campos existentes de ocorrência: `category_id`, `subcategory_id`, `department_id`, `priority`, `sla_due_at`, `public_message`
- `payload_json` de `whatsapp_messages` para guardar a sugestão calculada junto da mensagem

Nenhuma sugestão substitui automaticamente a decisão do agente. O sistema só aplica categoria, setor, prioridade, mensagem pública e SLA depois de confirmação explícita na interface.

## Fase 3.0 - IA assistida para classificacao e resumo

Sem SQL obrigatorio novo.

A Fase 3.0 mantem a IA como camada assistiva e opcional no backend. Quando uma chave de IA existir no ambiente seguro do servidor, a sugestao pode incluir:

- resumo operacional sem dados pessoais;
- categoria, prioridade, setor e risco provaveis;
- bairro/endereco provavel somente quando houver dado informado ou correspondencia com cadastro local;
- campos ausentes para pedir complemento ao cidadao;
- candidatos de possivel duplicidade calculados com dados ja existentes;
- resposta sugerida ao cidadao.

Se nao houver chave de IA, timeout ou falha externa, o sistema usa o fallback por regras locais da Fase 2.9 e continua funcionando. Nenhuma sugestao e aplicada sem confirmacao explicita do agente.

Os dados de aplicacao continuam usando campos ja existentes de `occurrences`, `occurrence_status_history`, `audit_logs` e `payload_json` de `whatsapp_messages`.

## Fase 3.1 - Duplicidade e agrupamento

Sem SQL obrigatorio novo.

A Fase 3.1 reutiliza campos e tabelas ja previstos:

- `occurrences.duplicate_of_id` para vincular a ocorrencia duplicada ao protocolo principal;
- `occurrences.status` com `DUPLICADO` ou `ARQUIVADO`, conforme decisao explicita do agente;
- `occurrence_status_history` para registrar a decisao operacional;
- `occurrence_comments` para registrar no protocolo principal quais relatos foram agrupados;
- `audit_logs` para rastreabilidade da acao de vinculo ou arquivamento.

Nao ha mesclagem automatica. O sistema apenas sugere candidatos por categoria, bairro, endereco e similaridade textual; o vinculo depende de confirmacao humana no painel.

## Fase 3.2 - Mapa e geolocalizacao

Sem SQL obrigatorio novo.

A Fase 3.2 reutiliza campos e tabelas ja previstos:

- `occurrences.latitude` e `occurrences.longitude` para coordenadas opcionais;
- `occurrences.address` e `occurrences.reference_point` para ponto de referencia e local aproximado;
- `neighborhoods` para filtro por bairro/regiao e calor territorial;
- `occurrences.priority`, `occurrences.status` e `occurrences.sla_due_at` para destacar pontos criticos e atrasados;
- `audit_logs` para registrar a precisao usada na abertura publica.

Regra de privacidade aplicada na aplicacao: coordenada precisa so e salva quando o morador/operador marcar consentimento explicito. Sem consentimento, latitude e longitude sao arredondadas para precisao aproximada antes do armazenamento. A consulta publica nao expõe latitude/longitude e reduz numeros de endereco; detalhes sensiveis ficam restritos ao painel interno.

## Fase 3.3 - Painel executivo

Sem SQL obrigatorio novo.

O painel executivo calcula indicadores agregados em tempo de consulta usando campos e tabelas ja existentes:

- `occurrences.status`, `priority`, `sla_due_at`, `created_at` e `resolved_at`;
- `occurrences.category_id`, `neighborhood_id`, `department_id`, `origin` e `source_channel`;
- `occurrence_categories`, `neighborhoods` e `departments` para rotulos agregados.

Nenhum dado pessoal do cidadao e retornado pela rota executiva. Os indicadores sao filtrados pela cidade e pelas permissoes do perfil autenticado.

## Fase 3.4 - Relatorios PDF e exportacao

Sem SQL obrigatorio novo.

Os relatorios mensal, por bairro, por setor e de ocorrencias criticas sao calculados em tempo de consulta usando estruturas existentes:

- `occurrences` para protocolo, categoria, bairro, setor, situacao, prioridade, origem, SLA e datas operacionais;
- `occurrence_categories`, `neighborhoods` e `departments` para rotulos;
- permissoes atuais para limitar cidade e setor do gestor.

CSV e PDF nao incluem nome, telefone, e-mail, descricao livre, endereco detalhado ou outros dados pessoais do cidadao por padrao. Nenhuma exportacao e persistida no banco.
