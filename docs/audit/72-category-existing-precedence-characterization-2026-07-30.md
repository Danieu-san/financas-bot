# Fila pós-9P.4 — caracterização da precedência de categorias existentes

Atualizado em: 2026-07-30

Base:
`d566ca1644aee78a9536c3b98036de6b3308d0dd`.

## Estado

`CARACTERIZAÇÃO LOCAL VERDE; ALCANCE DA PROPOSTA PROATIVA PENDENTE DE AUDITORIA`.

## Requisito

Quando houver dúvida de categoria, oferecer mais categorias já existentes antes
da opção explícita de criar uma nova.

## Caminho financeiro geral encontrado

O fluxo `expense.create` já:

- relê `Saídas`, `Lançamentos Cartão`, `Contas` e `Categorias` no escopo;
- cruza candidatos históricos, registrados e conhecidos;
- quando reconhece uma categoria ampla, oferece todas as subcategorias
  existentes desse grupo;
- enumera opções existentes antes de `Criar nova subcategoria em <categoria>`;
- no caso global, oferece até oito opções existentes, depois `Outros` e por
  último `Criar nova categoria/subcategoria`;
- rejeita texto livre e exige escolha numerada;
- não aceita categoria inventada pelo planner;
- só registra categoria e gasto depois da confirmação final.

## Fronteira a decidir

A proposta proativa Open Finance usa uma revisão durável própria antes do
switch geral de estados. Seu catálogo reúne até cem categorias existentes e o
menu as enumera, mas não expõe opção de criação nem reutiliza diretamente os
estados `awaiting_*_expense_category`.

A auditoria deve decidir se:

1. a fila posterior a 9P.4 já está satisfeita pelo caminho financeiro geral; ou
2. por estar registrada como evolução posterior da proposta Pluggy/Open
   Finance, ainda existe uma lacuna de alcance no fluxo proativo.

## Evidência executada pelo Codex

Seleção focal por nome de teste:

- planner não pode inventar categoria;
- categoria existente numerada é obrigatória;
- categoria ampla oferece as subcategorias existentes;
- criação aparece depois das existentes e pergunta somente o novo campo;
- helper rejeita texto livre e preserva categorias registradas.

Resultado: `5/5`.

Não houve WhatsApp, Google, Pluggy, Oracle/OCI ou AWS reais, escrita financeira,
flag, deploy, restart ou QR.

## Arquivos para auditoria

- `src/handlers/messageHandler.js`;
- `src/planning/financialCommandContextTools.js`;
- `tests/financialStateMachine.test.js`;
- `tests/unit.test.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- este documento.

Nenhum veredito deste documento autoriza integração real, escrita financeira,
flag, deploy ou produção.
