# CidadeOS AI — Fase 1.4 WhatsApp Business

Plataforma demonstrativa para registro, protocolo, transparência e inteligência urbana municipal.

## Rodar localmente

No Windows, clique em:

```txt
atualizar-e-iniciar.bat
```

Ou rode manualmente:

```bash
npm install
npm run check
npm run dev
```

Acesse:

```txt
http://localhost:3333
```

## Contas demo

```txt
admin@cidadeos.local / CidadeOS@123
agente@cidadeos.local / CidadeOS@123
saude@cidadeos.local / CidadeOS@123
super@cidadeos.local / CidadeOS@123
```

## Direção visual

Esta fase aplica a identidade híbrida: 60% institucional/.gov e 40% govtech/smart city. O objetivo é parecer uma plataforma pública moderna, séria, acessível e tecnológica, sem reaproveitar estética de SaaS genérico ou portfólio pessoal.

## Dados locais

O banco local fica em `data/cidadeos.json` após iniciar o projeto. Para atualizar o zip sem perder registros locais, preserve a pasta `data/` e `data/attachments/`.


## Fase 1.4
Inclui módulo WhatsApp Business configurável por cidade, tutorial do cliente, webhook preparado, credenciais mascaradas e validação local segura.


## Fase 2.2 Deploy Preview

Esta versão prepara o CidadeOS AI para testes online na Vercel, mantendo o localhost funcional.

- Localhost: `npm run dev` e acesso em `http://localhost:3333`.
- Vercel: usar `npm run build` com output `public`.
- Em ambiente online sem API completa, o sistema ativa um modo demonstrativo com dados no navegador do testador.

Consulte `docs/COMO_PUBLICAR_NA_VERCEL.md`.
