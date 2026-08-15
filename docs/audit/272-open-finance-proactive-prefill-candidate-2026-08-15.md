# Pré-preenchimento da proposta proativa — candidato

Data: 2026-08-15

## Problema reproduzido

Uma compra real recebida como `Nubank Thais`, com descrição comercial
`Neide Lanches e Pizzar`, chegou à revisão com pessoa, categoria e cartão para
seleção manual. A origem já vinculava alias e titular e a descrição continha
um sinal determinístico presente nas regras financeiras.

O novo teste atravessou ingestão da transação, proposta durável, entrega,
aceitação e revisão reais. Antes da correção, a resposta continha `Categoria:
não definida`, `Cartão: não definido` e bloqueava a conclusão.

## Correção

`initialDraft` agora:

- preenche cartão somente quando alias e `cardId`/rótulo do catálogo produzem
  uma única identidade exata, ignorando ordem e pontuação;
- preenche categoria somente quando a descrição ativa uma única regra lexical
  determinística e o catálogo autorizado oferece um único destino compatível;
- mantém categoria e cartão vazios quando origem ou descrição são ambíguas;
- não altera entradas, estornos, transferências, reservas ou investimentos;
- preserva o menu de revisão, a possibilidade de correção e a segunda
  confirmação antes de qualquer escrita.

## Prova causal

- RED real: `Neide Lanches e Pizzar` chegou sem categoria e cartão;
- preenchimento forte: pessoa Daniel, `Alimentação / PADARIA / LANCHE`,
  `Crédito` e `Nubank Daniel` chegaram no rascunho;
- ambiguidade: duas regras de comerciante ou duas identidades exatas mantêm os
  campos nulos;
- correção humana: categoria pré-preenchida pôde ser trocada por
  `Alimentação / SUPERMERCADO` antes da conclusão;
- ausência de cartão correspondente continua bloqueando a conclusão;
- a regressão de entrada causada por um primeiro candidato excessivo foi
  removida antes da evidência final.

## Testes locais

- syntax checks dos dois arquivos alterados: verdes;
- bateria causal afetada: 58/58 verde antes da restrição final;
- focais pós-restrição: pré-preenchimento, ambiguidade, override, cartão
  ausente e entrada 38.2 verdes;
- suíte hermética final: 1.729 passaram, 0 falharam, 10 ignorados;
- cobertura final: linhas 91,57%, branches 74,42%, funções 91,13%.

As contagens acima são evidência do executor local. Nenhum teste controlou
WhatsApp real, Google Sheets real ou produção e `financial_writes=0` nos novos
cenários.

## Arquivos materiais

- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `tests/openFinanceSaveProposalConversation.test.js`.

## Estado

`CANDIDATO LOCAL VERDE, AGUARDANDO AUDITORIA INDEPENDENTE POR HASH`.

