# CidadeOS AI — Fase 2.3 Supabase Compartilhado

## 🟢 Implementado

- API serverless em `api/[...path].js` para Vercel.
- Conexão via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` no backend/serverless.
- Manutenção do localhost antigo com `server/index.js`.
- Fallback automático para demo local no navegador quando a API online não estiver configurada.
- Ocorrências públicas salvas no Supabase em `occurrences`.
- Consulta pública por protocolo lendo o Supabase.
- Painel interno lendo ocorrências compartilhadas.
- Dashboard e transparência usando dados compartilhados.
- Login demo via tabela `app_users`, mantendo senha de teste `CidadeOS@123`.
- Atualização de status, prioridade, atribuição, duplicidade e comentários via API serverless.
- WhatsApp Business: configuração, simulação de mensagem, triagem, conversão em ocorrência e vínculo a protocolo usando tabelas do Supabase.
- `vercel.json` ajustado para rotear `/api/(.*)` para functions e o restante para `index.html`.
- SQL corrigido salvo em `docs/SUPABASE_SCHEMA_CIDADEOS_CORRIGIDO.sql`.

## 🟡 Parcial / preparado

- Upload de anexos ainda preparado, mas não finalizado em Supabase Storage pelo frontend.
- Envio real pela WhatsApp Cloud API ainda não dispara automaticamente.
- Criptografia forte de secrets por cidade será reforçada em fase futura; nesta fase a prioridade é teste compartilhado.
- Login demo ainda é simplificado para validação com ajudantes.

## 🔴 Pendente

- Envio real de mensagens pela Cloud API.
- IA para classificação automática.
- Upload real de foto/anexo em Supabase Storage.
- Autenticação robusta de produção.
- Multi-tenant comercial completo.

## Arquivos principais alterados/criados

- `api/[...path].js`
- `public/app.js`
- `vercel.json`
- `package.json`
- `.env.example`
- `docs/SUPABASE_SCHEMA_CIDADEOS_CORRIGIDO.sql`

## Checks executados

```bash
node --check api/[...path].js
npm run check
npm run build
```

## Variáveis necessárias na Vercel

```env
APP_ENV=preview
APP_NAME=CidadeOS AI
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=COLE_A_CHAVE_PUBLICAVEL
SUPABASE_SERVICE_ROLE_KEY=COLE_APENAS_NA_VERCEL_BACKEND
DATABASE_URL=postgresql://...
JWT_SECRET=...
ENCRYPTION_KEY=...
CIDADEOS_DEFAULT_CITY_SLUG=cidade-modelo
```
