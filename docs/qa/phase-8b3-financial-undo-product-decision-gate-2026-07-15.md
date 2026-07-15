# Fase 8B.3 - decisao de produto sobre undo 6E - gate 2026-07-15

## Veredito

`GO de producao` para classificar a 6E como infraestrutura validada e
capacidade test-only.

O canario produtivo foi desligado. Servico, ADR, testes, E2E e configurador
foram preservados. Nenhum codigo ou dado foi removido.

## Evidencia de consumidor

A busca estatica e operacional encontrou o `financialUndoService` somente em:

- `tests/financialUndoService.test.js`;
- `scripts/runFinancialUndoE2E.js`;
- `scripts/configureFinancialUndoCanary.js` e scripts npm associados.

Nao foi encontrado consumidor em:

- `messageHandler` ou outro handler WhatsApp;
- `index.js` ou runtime principal;
- scheduler/cron;
- systemd;
- import dinamico;
- PM2/logs operacionais;
- runbook produtivo;
- store `data/financial-undo.sqlite`.

O texto `desfazer` existente no handler pertence a desvinculacao de membro, nao
ao undo financeiro marker-only.

## Mudanca operacional

- backup do `.env` criado fora do repositorio;
- configurador oficial executado com `FINANCIAL_UNDO_CANARY_ACTION=disable`;
- `FINANCIAL_UNDO_MODE=off`;
- `FINANCIAL_UNDO_USER_IDS` vazio;
- permissao do `.env` mantida em `600`;
- teste remoto do servico: `5/5`;
- PM2 online, WhatsApp pronto, cron inicializado e health
  `{"ok":true,"sqlite":true}`;
- nenhum banco de undo foi criado apos restart;
- worktree rastreado remoto limpo.

## Inteligencia da decisao

Ausencia de evento de uso nao provaria desuso porque o servico nao estava
integrado ao runtime. A evidencia decisiva e a ausencia de consumidor somada ao
default arquitetural `off`. Manter `canary` criava uma promessa de produto que
o WhatsApp nao oferecia.

O desligamento nao abandona a capacidade: ela pode ser reaberta quando houver
requisito explicito, com comando, confirmacao, recibo e E2E WhatsApp proprios.

## Rollback

O backup do `.env` permite restaurar a configuracao. Para reativar de forma
segura, usar o configurador oficial com usuario explicitamente resolvido e
repetir o gate 6E. Nao reativar apenas editando a flag sem consumidor de produto.

## Proximo gate

8B.4: caracterizar abas de cartao e modulos em quarentena por runtime, QA,
operacao e recuperacao. Nenhuma estrutura passa diretamente de “sem consumidor
estatico” para remocao.
