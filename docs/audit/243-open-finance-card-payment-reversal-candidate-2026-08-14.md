# Gate 41.2 - devolucao de pagamento de fatura

Data: 2026-08-14

## Escopo

Este candidato fecha somente a ambiguidade incremental em que um pagamento de
fatura ja reconhecido por suas duas pernas foi devolvido a uma conta bancaria.
A decisao e privada, exata por ocorrencia e nao pode ser criada por regra de
comerciante.

Base: `15c026b4a8c56adc644880dd4d86463e6acdc34f`.

## Contrato causal

A devolucao e neutralizada somente quando todos os controles abaixo passam:

1. existe decisao humana exata `card_payment_reversal`;
2. a origem e conta `BANK`, movimento positivo `CREDIT`, `POSTED` e BRL;
3. a identidade do provedor e unica e a ocorrencia esta dentro da janela;
4. a linha nao existe nem possui duplicata forte na planilha escopada;
5. o pagamento original ja forma um par forte e mutuamente unico entre debito
   bancario revisado como pagamento de fatura e credito real do cartao;
6. a conta que recebe a devolucao e o cartao pertencem ao mesmo titular e a
   mesma conexao Pluggy;
7. valor, ordem temporal e janela maxima de tres dias coincidem;
8. uma devolucao corresponde a um unico pagamento e vice-versa.

Se qualquer controle falha, a ocorrencia nao recebe o motivo terminal
`strong_linked_card_payment_reversal`. O caminho nunca produz `write_plan`.

## Arquivos do candidato

- `scripts/buildOpenFinanceHistoricalImportConfig.js`;
- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportConfig.test.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`.

## Evidencia executada

- RED focal: duas falhas esperadas, uma no schema privado e outra no
  planejador real;
- syntax checks dos dois arquivos de produto: verdes;
- focal final: `68/68`, sem falhas ou skips;
- bateria hermetica ampla unica de todas as doze suites
  `openFinanceHistorical*.test.js`: `143/143`, sem falhas ou skips;
- recalculo privado: uma unica transicao de `needs_review` para `excluded`,
  nenhuma mudanca colateral, zero revisoes incrementais, cobertura completa e
  `financial_writes=0`;
- o artefato privado e os dados financeiros permaneceram fora do Git.

## Controles negativos

Os testes mantem a devolucao fechada quando falta decisao exata, o estado e
`PENDING`, item ou titular divergem, valor diverge, o evento ocorre antes ou
mais de tres dias depois, direcao ou moeda divergem, ou duas devolucoes
competem pelo mesmo pagamento.

## Alcance

O candidato e exclusivamente local e read-only. Nao implementa writer, nao
grava planilha, nao atualiza o catalogo recorrente, nao altera WhatsApp, flags,
servicos ou producao. Um GO tecnico local nao autoriza importacao ou deploy.
