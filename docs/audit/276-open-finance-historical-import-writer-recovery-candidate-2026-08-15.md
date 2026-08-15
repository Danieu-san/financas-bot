# Gate 41 - recovery do writer historico idempotente

Data: 2026-08-15

## Parecer anterior

O hash `3723c7ed05e2e04fcc3f1aae86a315b1f4d2db12` recebeu `NO-GO`.
O parecer identificou que uma operacao marcada `failed` podia voltar como novo
append, embora um erro nao reconhecido como retriable ainda pudesse representar
resultado remoto ambiguo. Tambem pediu prova causal de `uncertain` com SQLite
fechado/reaberto e negativos explicitos de escopo, cartao e `write_plan` em
estado nao gravavel.

## Arquivos do recovery

- `src/openFinance/openFinanceHistoricalImportWriter.js`;
- `src/services/google.js`;
- `tests/openFinanceHistoricalImportWriter.test.js`;
- este manifesto;
- como contexto do contrato original,
  `docs/audit/275-open-finance-historical-import-writer-candidate-2026-08-15.md`.

O hash imutavel do recovery sera o commit que publicar estes arquivos.

## Correcao

1. o writer historico trata `pending`, `uncertain` e `failed` exclusivamente
   como `reconcileOnly`;
2. o writer Google tenta reconciliar `failed` somente quando recebe
   `reconcileOnly`; se a ultima linha nao provar o mesmo fingerprint, devolve
   `FINANCIAL_WRITE_UNCERTAIN` e nao chama append;
3. o comportamento normal dos demais fluxos permanece inalterado: `failed`
   sem `reconcileOnly` ainda segue seu contrato anterior;
4. recovery positivo de `uncertain` ou `failed` confirma o recibo existente
   sem contabilizar nova escrita; recovery negativo para imediatamente;
5. os controles negativos agora exercitam explicitamente `write_plan` em
   `excluded`, falta de `user_id` e falta de `card_id`.

## Evidencia causal

- teste focal do writer: 8/8;
- testes focais preexistentes do `google.appendRowToSheet`: 6/6;
- o teste de restart fecha e reabre fisicamente o SQLite entre as etapas;
- `uncertain` sem linha: bloqueado, zero append, estado preservado;
- `uncertain` com linha final identica: reconciliado, zero append;
- `failed` sem linha: bloqueado, zero append, estado preservado;
- `failed` com linha final identica: reconciliado, zero append;
- replay e falha parcial continuam verdes, mas o item `failed` retomado agora
  conta como reconciliado e nunca como nova escrita;
- unica suite ampla posterior a mudanca causal: 140 arquivos, 1.737 aprovados,
  zero falhas e dez skips controlados; cobertura de linhas 91,57%, branches
  74,41% e funcoes 91,15%;
- nenhuma planilha real foi alterada e nenhum dado privado entrou no Git.

## Limites

- este recovery pede somente fechamento tecnico local do writer;
- aplicacao real, backup, rollback, novo snapshot, novo plano e reconciliacao
  de producao continuam bloqueados;
- a execucao operacional ainda deve manter um unico processo do lote por vez.

## Perguntas para reauditoria

1. O estado `failed` deixou de permitir append cego no writer historico?
2. O `appendRowToSheet` real agora reconcilia `failed + reconcileOnly` sem
   mudar o contrato normal de outros chamadores?
3. Fechamento/reabertura real do SQLite e cenarios positivo/negativo sustentam
   restart e resultado ambiguo?
4. Os negativos de estado, usuario e cartao fecham o achado medio?
5. Resta achado material ou lacuna indispensavel no escopo tecnico local?
