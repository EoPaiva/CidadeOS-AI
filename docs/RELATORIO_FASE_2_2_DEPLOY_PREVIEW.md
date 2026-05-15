# CidadeOS AI — Fase 2.2 Deploy Preview

## 🟢 Implementado

- Preparação para deploy na Vercel sem quebrar localhost.
- `vercel.json` com build estático e fallback para SPA.
- `npm run build` para validar `public/index.html`.
- `/api/health` serverless simples para Vercel.
- Modo demonstrativo online automático quando a API completa não estiver disponível.
- Fallback em `localStorage` para testes online individuais.
- Registro de ocorrência, protocolo, login demo, painel e triagem WhatsApp funcionando em preview estático.
- Banner de ambiente demonstrativo online.
- `.env.example` expandido com variáveis de Vercel/Supabase/segurança.
- Guia `docs/COMO_PUBLICAR_NA_VERCEL.md`.
- SQL inicial sugerido em `docs/SUPABASE_SCHEMA_PREVIEW.sql`.

## 🟡 Parcial/preparado

- Dados compartilhados online ainda dependem de Supabase/PostgreSQL.
- Uploads/anexos em produção ainda precisam de Supabase Storage/Vercel Blob.
- API completa continua no servidor local Node para localhost.
- WhatsApp real continua preparado, mas Cloud API completa fica para fase posterior.

## 🔴 Pendente

- Conectar banco externo real.
- Migrar API completa para backend online persistente ou Railway.
- Storage externo para anexos.
- Autenticação robusta de produção.
- Webhook WhatsApp real em produção com persistência compartilhada.

## Arquivos criados/alterados

- `vercel.json`
- `api/health.js`
- `scripts/build-static.js`
- `public/app.js`
- `public/styles.css`
- `.env.example`
- `package.json`
- `docs/COMO_PUBLICAR_NA_VERCEL.md`
- `docs/SUPABASE_SCHEMA_PREVIEW.sql`
- `docs/RELATORIO_FASE_2_2_DEPLOY_PREVIEW.md`

## Testes/checks

- `npm run check`
- `npm run build`
- validação de sintaxe do frontend/backend atual

## Comandos

```bash
npm install
npm run check
npm run build
npm run dev
```
