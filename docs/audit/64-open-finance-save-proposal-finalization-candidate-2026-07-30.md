# 9P.4 — candidato de finalização idempotente da proposta Open Finance

Atualizado em: 2026-07-30

Base:
`20b8b7873c6626a3e74019ef025624e75303df7f`.

## Estado

`CANDIDATO LOCAL VERDE; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

## Objetivo

Finalizar uma revisão 9P.3 `ready` somente depois de reler e revalidar a fonte
Open Finance autorizada, a planilha familiar e o catálogo familiar, exigir um
segundo `sim` explícito e produzir no máximo um lançamento com operation key e
recibo duráveis.

## Fronteira implementada

- o código permanece dormente com `OPEN_FINANCE_WRITE_MODE=off`;
- o modo local `confirm` ainda é bloqueado pelo rollout vigente e não foi
  ativado em produção;
- a revalidação exige a mesma compra simples `POSTED`, a mesma geração, conta,
  identidade do provedor, valor, data e descrição;
- parcelamento, fonte incompleta, escopo ambíguo, reconciliação diferente de
  `new` e item removido do catálogo falham antes do writer;
- pessoa, categoria, pagamento, conta e cartão são relidos na fonte familiar
  user-scoped; o `card_id` estável segue até o adaptador da planilha unificada;
- o plano de escrita é determinístico e usa `appendRowToSheet`, protegido pelo
  `FinancialWriteLedger` e por uma operation key HMAC estável;
- estado, rascunho validado, operation key e recibo ficam em SQLite cifrado
  AES-256-GCM e vinculados ao ator familiar autorizado;
- recusa, expiração, invalidação e revogação são terminais; revogação remove
  proposta, revisão e finalização na mesma transação do banco de preview;
- falha ambígua preserva `uncertain` e reapresenta a mesma operation key ao
  mecanismo de reconciliação, sem gerar uma nova identidade de operação;
- o recibo só vira `receipt_delivered` depois que a revisão durável passa para
  `finalized`; falha nessa etapa deixa o recibo em `committed` para replay;
- a entrada pública serializada trata duas confirmações simultâneas do mesmo
  remetente em FIFO. Uma falha de envio depois do append deixa o recibo
  recuperável, e a segunda mensagem não cria outro lançamento.

## Prova causal executada pelo Codex

- finalização focal: `8/8`;
- entrada pública completa: `124/124`;
- conjunto Open Finance ampliado, incluindo revogação e restore: `55/55`;
- adaptador de cartão da planilha pessoal: `1/1`;
- runner hermético completo:
  - testes: `1.340`;
  - aprovados: `1.335`;
  - falhas: `0`;
  - skips funcionais previstos: `5`;
  - arquivos de teste descobertos: `126`;
  - cobertura: linhas `90,39%`, branches `72,24%`, funções `89,94%`;
- sintaxe dos arquivos de produto alterados: verde;
- `git diff --check`: verde.

O runner bloqueou rede em `fetch`, `http`, `https`, `net`, subprocessos Node e
subprocessos não Node. Não houve chamada real a WhatsApp, Pluggy, Google,
Oracle/OCI ou AWS, escrita real, restart, QR ou deploy.

## Arquivos centrais para auditoria

- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `src/openFinance/openFinanceSaveProposalFinalizationStore.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/handlers/messageHandler.js`;
- `src/services/google.js`;
- `tests/openFinanceSaveProposalFinalization.test.js`;
- `tests/financialStateMachine.test.js`;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `tests/unit.test.js`;
- este documento.

## Limites

- escopo de processo único e FIFO por remetente herdado de STATE-01;
- nenhuma autorização para ativar flags, integrar serviços reais ou publicar;
- o parecer independente será estático e não deve declarar que executou os
  testes locais;
- `GO` deste candidato, se emitido, autoriza somente o fechamento técnico local
  de 9P.4.

## Perguntas fechadas para o auditor

1. A revalidação imediatamente anterior à confirmação e o catálogo relido
   impedem escrita a partir de fonte, escopo ou seleção obsoletos?
2. O store, a entrada FIFO e o ledger sustentam um único efeito em confirmação
   concorrente, restart, falha de envio e replay?
3. Estados `uncertain`, `committed` e `receipt_delivered` preservam causalidade
   sem sucesso falso nem segundo append?
4. Revogação e expiração encerram a autorização antes de nova escrita?
5. Resta achado `CRITICAL`, `HIGH` ou `MEDIUM`, ou lacuna causal indispensável,
   dentro do escopo local declarado?
