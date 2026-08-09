# Gate 34 - transparencia de compra pendente

Atualizado em: 2026-08-09

## Objetivo

Explicar no alerta por que uma compra ainda `PENDING` nao recebe proposta de
salvamento, sem relaxar o contrato que exige `purchase/POSTED/new` e sem alterar
o comportamento de estornos, transferencias ou escrita financeira.

## Diagnostico real

Depois de uma atualizacao manual do Item no Meu Pluggy, o ciclo automatico das
10:27 entregou ao Daniel uma compra e um estorno novos. O transporte e a coleta
estavam funcionando. A compra chegou como alerta comum porque ainda nao era uma
proposta elegivel; o estorno permaneceu somente informativo, como definido no
roadmap. Nenhum dado financeiro privado foi copiado para esta evidencia.

A prova causal local cobre a fronteira que faltava: duas compras surgem como
`PENDING`, recebem apenas alertas de leitura, reaparecem como `POSTED` e entao
originam duas propostas entregues em um unico lote numerado. O estado duravel
fica em `awaiting_open_finance_save_selection` e `financial_writes=0`.

## Mudanca

`formatCanaryMessage` acrescenta, somente para `purchase/PENDING`:

- o status de compra ainda pendente no banco;
- a informacao de que a proposta surgira apenas depois da confirmacao bancária.

Eventos `POSTED` e outras classificacoes preservam a mensagem anterior. A
mudanca nao antecipa proposta, nao muda reconciliacao, lote, confirmacao, flags,
polling, estado privado ou escrita.

## Evidencia local

- syntax checks dos tres arquivos afetados: verdes;
- testes focais novos: `2/2`;
- bateria causal de runtime, entrega e fluxo numerico: `38/38`;
- `git diff --check`: verde;
- suite hermetica final valida: 1.555 testes, 1.545 aprovados, zero falhas e
  10 skips esperados; cobertura de linhas `90,88%`, branches `73,56%` e
  funcoes `90,51%`.

## Estado

`CANDIDATO LOCAL VERDE; AGUARDA COMMIT IMUTAVEL E AUDITORIA INDEPENDENTE`.

Producao permanece no hash
`b6f8edc37bd46ba977a7a4a4e59f54ad092300d6`, com escrita `off`, aprovacao
falsa e `confirm` bloqueado.
