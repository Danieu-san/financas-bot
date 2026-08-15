# Pré-preenchimento da proposta proativa — fechamento de produção

Data: 2026-08-15

## Release

- commit implantado: `6fbf73048a8dceb5ce8e366c67c1c2cac5b6930a`;
- código auditado: `99a222076de9206a0c2e3b9aeeeae81e2e9b41d4`;
- diferença entre ambos: somente fechamento documental;
- provedor: Oracle OCI;
- processo: `financas-bot`, único, online e com zero reinícios;
- health local e público: `ok=true`, `sqlite=true`, WhatsApp
  `ready/healthy`;
- rollback OCI anterior permaneceu disponível e não foi acionado.

## Smoke real

O lote numerado real ofereceu uma compra `99` em `Nubank Cristina`. Depois de
`salvar 1`, a revisão exibiu sem seleção manual:

- pessoa: `Thaís`;
- categoria: `Transporte / UBER / 99`;
- pagamento: `Crédito`;
- cartão: `Nubank - Cristina`;
- conta financeira: não aplicável ao crédito.

O comando `6` concluiu apenas a conferência. O produto revalidou a transação na
fonte Open Finance e na planilha e pediu o segundo consentimento, ainda sem
escrita. Depois de `sim`, entregou o recibo durável
`279ce882229332d32cd1c51c`.

## Persistência

- operação: `append.Cartão Nubank - Cristina`;
- status: `committed`;
- destino: `'Lançamentos Cartão'!A41:J41`;
- contagem da mesma `operation_key`: 1;
- os outros três itens do lote não foram selecionados nem escritos.

O lançamento é uma despesa real ausente da planilha e foi preservado. Não foi
criado resíduo sintético.

## Veredito

`PRE-PREENCHIMENTO PROATIVO DE COMPRA: GO FUNCIONAL DE PRODUCAO`.

Este GO libera o writer histórico idempotente do Gate 41. Ele não substitui o
dry-run, backup, auditoria, recibos, rollback nem a reconciliação posterior do
lote histórico.

