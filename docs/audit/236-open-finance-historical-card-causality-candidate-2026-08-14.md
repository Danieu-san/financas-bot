# Gate 41 - causalidade historica de cartao

Data: 2026-08-14

## Escopo

Este candidato fecha somente papeis deterministas de cartao no planejador
historico read-only:

- neutraliza compra e estorno de cartao quando o par e mutuamente unico, tem
  mesmo cartao, valores exatamente opostos, semantica explicita de estorno,
  identidades estaveis, moeda BRL, intervalo de ate 30 dias e ausencia dos dois
  lados na planilha;
- exige status `POSTED` nos dois lados do par de cartao;
- exclui credito de pagamento de fatura somente para descricoes exatas
  `Pagamento recebido` ou `Pagamento com saldo`, em cartao, com direcao e sinal
  coerentes e status `POSTED`;
- exclui saldos de fatura e ajustes de financiamento apenas para descricoes
  exatas, sinais coerentes, cartao e status `POSTED`.

O candidato nao libera creditos genericos, entradas bancarias, moedas nao BRL,
`Pagamento de pix`, itens pendentes ou pares ambiguos. Nenhum writer foi
habilitado.

## Controles causais

- os testes executam `planHistoricalImport` real;
- ordem direta e invertida produzem a mesma neutralizacao;
- compra ja existente na planilha impede a neutralizacao do par;
- dois candidatos de mesmo valor, descricao aproximada, status pendente e
  papeis bancarios falham fechado;
- descricoes exatas de pagamento e ajuste sao confrontadas com variacoes
  proximas, status pendente e origem bancaria;
- toda execucao exige `financial_writes=0`.

## Evidencia local

- RED observado antes da implementacao: 5 falhas focais esperadas;
- bateria focal final: 44/44 testes verdes;
- unica bateria hermetica ampla apos estabilizacao:
  `node --test tests/openFinanceHistorical*.test.js`, 136/136 testes verdes,
  zero falhas e zero skips;
- recalc privado: 1.707 prontos, 2 existentes, 34 duplicatas provaveis, 275
  excluidos, 172 em revisao e 161 fora da janela;
- impacto causal privado: 24 creditos de pagamento de fatura, 22 estornos, 22
  compras pareadas, 6 ajustes de financiamento e 3 saldos de fatura mudaram
  somente para os estados deterministas esperados;
- hash do plano privado:
  `2073b9cdbb9e03f678202eca142e3d89c31c957c7a14417bc4e5e8f2f2cbda5a`;
- cobertura completa, oito bindings e `financial_writes=0` preservados;
- nenhum artefato financeiro privado ou segredo foi adicionado ao Git.

## Arquivos para auditoria

- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`;
- este manifesto.

## Criterio de fechamento

Confirmar que os papeis diretos nao excedem as descricoes, sinais, tipo de
conta e status declarados; que o pareamento de estorno e mutuamente unico,
limitado ao mesmo cartao e prova ausencia dos dois lados na planilha; e que os
testes negativos preservam os residuais ambiguos sem escrita.

## Estado

`CANDIDATO LOCAL AGUARDANDO AUDITORIA INDEPENDENTE`.
