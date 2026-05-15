# CidadeOS AI — Fase 2.4 Anexos Reais + Supabase Storage

## 🟢 Implementado

- Upload real de anexos no modo online usando Supabase Storage.
- Bucket usado: `occurrence-attachments`.
- Formulário público aceita jpg, png, webp e pdf até 5 MB.
- Anexo enviado junto com a ocorrência pública.
- Registro do vínculo na tabela `occurrence_attachments`.
- API serverless gera URL assinada para leitura segura dos anexos.
- Consulta pública exibe apenas anexos com visibilidade pública.
- Painel interno exibe galeria de anexos na ocorrência.
- Agente pode adicionar novo anexo e escolher visibilidade: pública, interna ou restrita.
- Auditoria para upload público, upload interno e falha de upload.
- Localhost preservado com fluxo de anexos local já existente.

## 🟡 Parcial / preparado

- Remoção/arquivamento de anexo fica preparado para próxima fase.
- Controle fino de permissões por role ainda será reforçado na fase de autenticação.
- Upload via WhatsApp real será conectado quando a Cloud API estiver ativa.

## 🔴 Pendente

- Excluir/arquivar anexos pelo painel.
- Compressão automática de imagem.
- OCR/IA para interpretar anexos.
- Políticas avançadas por tenant/cidade.

## Validação esperada

1. Abrir ocorrência com foto.
2. Consultar protocolo.
3. Entrar no painel.
4. Abrir detalhes.
5. Ver galeria de anexos.
6. Adicionar anexo operacional.
7. Confirmar que anexo interno não aparece na consulta pública.
