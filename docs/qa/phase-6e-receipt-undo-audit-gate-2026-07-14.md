# Fase 6E - Undo por recibo e auditoria

Data: 2026-07-14

## Contrato entregue

- operação reversível inicial: somente `sheet.append.marker_only` registrada
  explicitamente;
- recibo interno escopado por hash de usuário e chave da operação, aba,
  marcador exato e fingerprint da linha confirmada no Google Sheets;
- undo relê a aba e exige exatamente uma correspondência de marcador e
  fingerprint;
- linha ausente, alterada, ambígua ou já conciliada bloqueia sem exclusão;
- segunda chamada retorna replay e não executa novo delete;
- chave de operação reutilizada para outro recibo gera conflito;
- auditoria append-only registra cadastro, sucesso, bloqueio, falha e replay;
- histórico público omite usuário, mensagem, marcador, valores, conteúdo da
  linha e fingerprint.

A matriz de operações reversíveis e não reversíveis está em
`docs/decisions/ADR-004-marker-only-financial-undo.md`.

## Limite intencional

A 6E não habilita undo retroativo de gastos, entradas, cartões, imports,
manutenções em lote ou movimentos de plano. Esses fluxos não possuem ainda
uma inversa compensatória específica. Inferir a última linha seria inseguro e
permanece proibido.

## Rollout e rollback

- padrão `FINANCIAL_UNDO_MODE=off`;
- `canary` exige correspondência exata em `FINANCIAL_UNDO_USER_IDS`;
- produção ficou em canário para exatamente um usuário;
- rollback pelo configurador com `FINANCIAL_UNDO_CANARY_ACTION=disable`;
- SQLite dedicado configurável por `FINANCIAL_UNDO_DB_PATH`.

## Evidência

- TDD RED inicial por módulo ausente;
- gate local e remoto `5/5`;
- baseline integral `851/851`;
- `npm audit --audit-level=high`: zero vulnerabilidades;
- diff check e package JSON válidos;
- primeiro E2E bloqueou sem apagar porque o fingerprint pré-envio diferia da
  representação armazenada pelo Sheets; o cleanup removeu o marcador;
- o recibo passou a usar a linha relida após commit, mantendo a validação
  estrita;
- E2E local e remoto finais: `receipts=1`, `deletes=1`, `replays=1`,
  `audit=3`, `cleanup=zero`, `privacy=true`;
- commit `f349ddbe7ac4eb03dddab03da26ae54533115dd3` implantado por
  fast-forward;
- backup `.env.pre-phase6e-20260714T052736Z`;
- PM2 PID `3199710` online, WhatsApp pronto e health
  `{"ok":true,"sqlite":true}`.

## Decisão

`GO de produção`. O gate confirma que o undo marker-only não apaga uma linha
diferente e preserva a trilha auditável. A Fase 6E está encerrada e a 6F - gate
combinado de saída da Fase 6 - está autorizada.
