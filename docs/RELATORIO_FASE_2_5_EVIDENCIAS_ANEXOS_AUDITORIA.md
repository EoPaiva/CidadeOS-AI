# CidadeOS AI — Fase 2.5
## Gestão de Evidências + Galeria de Anexos + Auditoria

## 🟢 Implementado

- Galeria de evidências mais profissional nos detalhes da ocorrência.
- Cards de anexos com prévia, nome, tipo, tamanho, data, origem e visibilidade.
- Botão para abrir anexo em nova aba.
- Botão para copiar link seguro/assinado quando disponível.
- Alteração de visibilidade do anexo pelo painel:
  - público;
  - interno;
  - restrito.
- Ação para arquivar anexo com confirmação.
- Ação para remover o vínculo do anexo com a ocorrência sem apagar o arquivo do Storage automaticamente.
- Auditoria para:
  - upload de anexo;
  - alteração de visibilidade;
  - arquivamento;
  - remoção de vínculo.
- Preview visual antes de enviar anexo pelo painel.
- Compressão automática de imagem no navegador quando possível.
- Validação de tipo de arquivo e limite de 5 MB preservados.
- Filtros adicionais na lista de ocorrências:
  - com anexo;
  - sem anexo;
  - origem portal/WhatsApp/painel.
- Consulta pública continua exibindo apenas anexos públicos e ativos.
- Localhost preservado.
- API serverless Vercel atualizada para gestão de anexos.
- SQL de migração incremental incluído em `docs/SUPABASE_MIGRATION_FASE_2_5_EVIDENCIAS.sql`.

## 🟡 Parcial / preparado

- O arquivamento usa colunas novas no Supabase quando a migração é aplicada.
- Se a migração ainda não estiver aplicada, o backend tenta fallback seguro para visibilidade restrita.
- Exclusão definitiva do arquivo no Storage não é feita por padrão para evitar perda acidental de evidência.
- Upload de mídia recebida pelo WhatsApp real fica preparado para fase futura.

## 🔴 Pendente

- Excluir arquivo físico do Storage com dupla confirmação.
- OCR/IA para interpretar fotos e documentos.
- Upload de mídia real vinda da WhatsApp Cloud API.
- Assinatura de validade configurável por cidade/tenant.
- Políticas avançadas por cidade para anexos restritos.

## Arquivos alterados

- `public/app.js`
- `public/styles.css`
- `server/index.js`
- `api/[...path].js`
- `package.json`
- `package-lock.json`
- `VERSAO_ATUAL.txt`

## Arquivos criados

- `docs/SUPABASE_MIGRATION_FASE_2_5_EVIDENCIAS.sql`
- `docs/RELATORIO_FASE_2_5_EVIDENCIAS_ANEXOS_AUDITORIA.md`

## Validações executadas

```bash
node --check api/[...path].js
npm run check
npm run build
```

## Observação Supabase

Para a experiência completa da Fase 2.5 no ambiente online, execute a migração:

```txt
docs/SUPABASE_MIGRATION_FASE_2_5_EVIDENCIAS.sql
```

Sem a migração, o sistema ainda tenta operar com fallback seguro, mas o arquivamento completo com `archived_at`, `archived_by` e `archived_reason` depende das colunas novas.
