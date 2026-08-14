# Gate 41 - Pix historico financiado por cartao

Data: 2026-08-14

## Problema

Um Pix financiado por cartao aparece como tres fatos proximos: saida bancaria
ao favorecido, credito bancario do principal e debito maior no cartao. Importar
o debito integral do cartao junto com a saida bancaria duplica o principal;
excluir o debito integral apaga a taxa do financiamento.

## Escopo do candidato

O planejador read-only reconhece a triade somente quando:

- os tres fatos pertencem ao mesmo item Pluggy e ao mesmo titular autorizado,
  com `ownerUserId` nao vazio nos dois bindings;
- debito e credito bancarios usam a mesma conta, com principal exatamente
  oposto;
- o credito tem descricao e operacao exatas de valor adicionado para Pix no
  credito;
- o debito bancario tem prefixo exato de transferencia enviada e favorecido;
- o debito de cartao usa o mesmo favorecido ou a descricao exata
  `Pagamento de pix`;
- o debito do cartao e maior que o principal, permitindo derivar taxa positiva;
- a ordem causal e debito bancario, credito bancario e debito do cartao, com no
  maximo cinco segundos entre cada etapa;
- todos os fatos sao `POSTED`, BRL, possuem identidade unica, estao dentro da
  janela e nao possuem correspondencia na planilha;
- cada componente pertence a uma unica triade candidata.

A saida ao favorecido conserva o fluxo normal de despesa. O credito do
principal e excluido como funding neutro. O debito do cartao deixa de ser
compra integral e fica em revisao somente como taxa, com principal, taxa e
referencias causais no `review_context`; nenhum `write_plan` e criado para a
taxa antes de categoria explicita.

## Controles negativos

Ambiguidade, titular ausente, `PENDING`, data sem horario preciso, descricao aproximada do
credito, prefixo bancario diferente, operacao diferente, favorecido divergente,
taxa nao positiva, intervalo superior a cinco segundos, titular diferente ou
qualquer lado ja registrado falham fechado.

## Evidencia local

- RED focal limpo: 1 falha causal esperada antes da implementacao;
- focal final: 47/47 testes verdes;
- unica bateria historica ampla do candidato: 139/139 testes verdes, zero
  falhas e zero skips;
- recalc privado `v208`: 1.704 prontos, 2 existentes, 34 duplicatas provaveis,
  279 excluidos, 171 em revisao e 161 fora da janela;
- impacto privado exato: quatro creditos bancarios passaram de revisao para
  funding excluido; tres debitos de cartao passaram de compra pronta para taxa
  em revisao; um debito ja em revisao passou a expor somente a taxa;
- inventario residual privado `v207`: 147 entradas/estornos, 16 creditos de
  cartao, 4 taxas de Pix financiado e 4 moedas nao BRL;
- hash do plano privado:
  `70bc39c8572cbe7851a2d3f8f918b6e2d108a84cbb5819dc9345ce7324f3f745`;
- cobertura completa, oito bindings e `financial_writes=0` preservados;
- nenhum artefato financeiro privado ou segredo foi adicionado ao Git.

## Arquivos para auditoria

- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`;
- este manifesto.

## Estado

`CANDIDATO LOCAL CORRIGIDO AGUARDANDO REAUDITORIA INDEPENDENTE`.
