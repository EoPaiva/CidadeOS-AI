# CidadeOS AI — Como publicar na Vercel para testes online

Esta fase prepara o projeto para um **Deploy Preview** na Vercel sem quebrar o localhost.

## Objetivo

Permitir que ajudantes testem a interface online enquanto o projeto continua funcionando em localhost.

## Modo online demonstrativo

Quando o site é aberto fora de `localhost`, o frontend ativa um modo demonstrativo com `localStorage` se a API completa não estiver disponível.

Isso permite testar:

- página pública;
- registro de ocorrência;
- protocolo;
- consulta de protocolo;
- login demo;
- painel administrativo;
- triagem WhatsApp simulada.

Limitação: os dados ficam salvos **apenas no navegador de cada pessoa**. Para dados compartilhados entre todos os testadores, conectar Supabase/PostgreSQL.

## Passos na Vercel

1. Suba o projeto para o GitHub.
2. Entre em https://vercel.com
3. Clique em **Add New Project**.
4. Importe `EoPaiva/CidadeOS-AI`.
5. Framework: **Other**.
6. Build Command: `npm run build`.
7. Output Directory: `public`.
8. Deploy.

## Variáveis iniciais

Para o preview estático funcionar, nenhuma variável real é obrigatória.

Quando for ativar banco externo, configurar:

```txt
APP_ENV=preview
APP_URL=https://seu-projeto.vercel.app
DATABASE_URL=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
COOKIE_SECRET=...
ENCRYPTION_KEY=...
```

## Login demo

```txt
admin@cidadeos.local / CidadeOS@123
agente@cidadeos.local / CidadeOS@123
saude@cidadeos.local / CidadeOS@123
super@cidadeos.local / CidadeOS@123
```

## Aviso importante

Este preview não substitui produção. Para testar com dados reais e compartilhados, usar banco externo e storage externo.
