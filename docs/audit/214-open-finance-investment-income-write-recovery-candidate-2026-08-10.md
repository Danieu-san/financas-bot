# Gate 38.6 - recovery da categoria fixa e da prova writer-projetor

Data: 2026-08-10

## Origem

O candidato `e0fa917752034faad47521f3b3e66f02649712cc` recebeu `NO-GO`
independente com dois achados:

- `ALTO`: a revisao comum ainda oferecia categoria nova e o finalizador aceitava
  `origin=user_created`, permitindo contornar a categoria `Investimentos`;
- `MEDIO` probatorio: a prova publica usava o mock global de Google e o projetor
  real era exercitado apenas separadamente.

## Recovery

- `investment_income` nao recebe a opcao `Criar nova categoria` no menu real;
- um estado legado ou adulterado `enter_new_category` para essa classe falha
  fechado;
- a revalidacao final rejeita explicitamente qualquer categoria
  `origin=user_created` antes de construir o write plan;
- a categoria selecionada continua obrigada a corresponder integralmente ao
  unico item `Investimentos` do catalogo atual filtrado;
- a prova publica exige ausencia da opcao de categoria nova;
- a prova focal adversarial injeta uma categoria nova valida e exige bloqueio;
- uma nova prova usa `writeOpenFinanceSaveProposal` e
  `services/google.appendRowToSheet` reais, cliente Sheets hermetico, ledger de
  escrita real e projetor canonico real; exige um unico append e um unico evento
  `income` de 325 centavos no banco canonico.

## Evidencia do recovery

- focal Gate 38.6: `4/4`;
- caminho publico real focal: `1/1`;
- bateria causal afetada: `184/184`;
- unica suite hermetica ampla final do recovery: `1629` testes, `1619`
  aprovados, zero falhas e `10` skips previstos;
- cobertura: linhas `91,26%`, branches `73,73%`, funcoes `90,89%`;
- sintaxe, workflow e `git diff --check`: verdes;
- nenhuma chamada externa, planilha real, WhatsApp real, flag ou servidor.

As contagens sao evidencia local relatada pelo Codex, nao execucao do auditor.

## Arquivos causais do recovery

- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `tests/openFinanceInvestmentIncomeSaveProposal.test.js`;
- `tests/financialStateMachine.test.js`.

## Perguntas de reauditoria

1. O contorno por categoria criada pelo usuario esta fechado tanto na conversa
   quanto na revalidacao final?
2. A categoria final permanece necessariamente `Investimentos` do catalogo
   atual e a conta permanece do mesmo titular?
3. A nova prova atravessa writer Google e projetor canonico reais sem chamar
   servico externo e exige um unico efeito?
4. Os demais invariantes confirmados no primeiro parecer permanecem intactos?

Estado maximo: `CANDIDATO LOCAL VERDE; AGUARDANDO REAUDITORIA; SEM DEPLOY`.
