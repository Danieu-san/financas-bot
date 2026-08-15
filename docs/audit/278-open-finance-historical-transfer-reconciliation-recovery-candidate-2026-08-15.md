# Gate 41 — recuperação da reconciliação histórica de transferências

Data: 2026-08-15

## Estado do candidato

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Falha observada

O writer histórico gravou uma transferência-canário e recebeu recibo
`committed`, mas o recálculo read-only continuou classificando a mesma origem
como `ready`. A linha da planilha devolvia o valor com formatação monetária do
Google, enquanto o plano usava número bruto. Além disso, os caminhos de
transferência consolidada, unilateral e de reserva produziam o `write_plan`
antes da detecção genérica de existentes em Saídas/Entradas e não consultavam
a aba `Transferências`.

Sem correção, um recálculo posterior poderia voltar a oferecer transferências
já escritas, embora o ledger do lote impedisse a repetição dentro do mesmo
fingerprint.

## Correção

- toda escrita histórica em `Transferências` consulta primeiro a aba canônica;
- data, descrição, valor, origem, destino, método, observação, status e
  `user_id` precisam coincidir;
- o valor passa pelo mesmo parser monetário já usado no planejador, aceitando a
  representação numérica do plano e a representação monetária devolvida pelo
  Google;
- origem, destino e `user_id` continuam obrigatórios e exatos, portanto uma
  linha de outra conta ou outro usuário não é aceita;
- a mesma fronteira cobre pares familiares, transferências unilaterais
  revisadas e movimentos de reserva;
- nenhuma decisão privada, regra semântica ou writer foi alterado.

## Evidência causal

- teste RED/verde reproduz número bruto contra valor formatado como moeda;
- teste negativo mantém `ready` quando conta ou usuário divergem;
- bateria afetada: 96/96, zero falhas;
- suíte hermética final única: 1.749 testes, 1.739 aprovados, zero falhas e dez
  skips controlados;
- cobertura final: linhas 91,58%, branches 74,36%, funções 91,16%;
- recálculo privado posterior ao canário passou de 1.805 `ready` e 61
  `existing` para 1.804 `ready` e 62 `existing`, sem revisão e com
  `financial_writes=0`;
- plano, snapshot, descrições, valores e identificadores permaneceram fora do
  Git e dos prompts.

## Arquivos para auditoria

- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`;
- este manifesto.

## Limites

- este candidato não autoriza retomar o lote real;
- a operação `uncertain` produzida pela resposta 429 permanece preservada no
  ledger anterior;
- a retomada deve usar novo snapshot/plano, novo fingerprint e blocos abaixo
  da cota, somente após GO independente;
- os 34 duplicados prováveis, 290 excluídos e 161 itens fora da janela não são
  promovidos por esta mudança.
