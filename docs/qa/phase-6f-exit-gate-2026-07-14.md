# Gate 6F - Saída da Fase 6

Data: 2026-07-14

## Decisão final

`GO de produção` para encerrar a Fase 6. A Fase 7A - ADR e modelo
patrimonial - fica autorizada, mas requer troca de capacidade para
`Codex -> Sol -> Altíssimo` antes de começar.

## Escopo combinado

1. Manutenção em lote com preview e rollback lógico.
2. Importação XLS/XLSX e exportação XLSX filtrada.
3. Comprovantes privados vinculados a evento existente.
4. OCR de PDF/imagem somente em staging, sem autoridade de escrita.
5. Undo marker-only por recibo exato e auditoria append-only.

## Evidência local

- bateria combinada 6A-6E: `76/76`;
- baseline integral no mesmo hash de código: `851/851`;
- `npm audit --audit-level=high`: zero vulnerabilidades;
- JSON de pacote e estado válidos; diff check limpo;
- flags novas falham fechadas e canários exigem allowlist exata.

A bateria cobre limites de arquivo/linhas/lote, assinatura e fórmulas,
preview com validade limitada, baixa confiança, prompt injection, duplicidade,
replay, conflito, item conciliado, falha parcial, escopo e sanitização.

## E2E real combinado em produção

- 6A: `items=2`, `sheets=2`, `cleanup=zero`, `privacy=true`;
- 6B: `imports=2`, `export_rows=17`, `writes=zero`, `cleanup=zero`,
  `privacy=true`;
- 6C: `uploads=1`, `downloads=1`, `writes=zero`, `cleanup=zero`,
  `privacy=true`;
- 6D: `documents=1`, `rows=1`, `writes=zero`, `cleanup=zero`,
  `privacy=true`;
- 6E: `receipts=1`, `deletes=1`, `replays=1`, `audit=3`,
  `cleanup=zero`, `privacy=true`.

Todos os arquivos e marcadores foram sintéticos e tiveram cleanup verificado
pelo próprio runner. O E2E automatizado cobriu o requisito; smoke manual não
foi necessário.

## Produção

- código da Fase 6 no hash
  `f349ddbe7ac4eb03dddab03da26ae54533115dd3`;
- hash documental anterior ao fechamento 6F:
  `a4027205a9d1bef355a55028e4aa1203301f7acc`;
- 6A, 6B, 6C, 6D e 6E permanecem em canário restrito;
- PM2 online, zero reinícios instáveis, WhatsApp pronto e health
  `{"ok":true,"sqlite":true}`;
- worktree rastreado remoto limpo.

## Gate

- nenhum arquivo ou OCR gravou campo financeiro automaticamente;
- lote escreveu somente após preview/confirmação e em fixture isolada;
- comprovante alterou somente Drive/metadado e foi removido;
- undo removeu somente a linha marker-only identificada pelo recibo;
- nenhuma duplicidade ou resíduo foi encontrado.

O gate de saída da Fase 6 está satisfeito. A modelagem patrimonial não deve
começar em capacidade Alta, pois o roadmap exige Altíssima para separar
patrimônio, caixa, capital transferido, rendimento e resultado sem erro
semântico.
