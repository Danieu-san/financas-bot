# Gate 38.4 - recovery da revogacao da perna ancora

Data: 2026-08-10

## Estado solicitado

`CANDIDATO A GO TECNICO LOCAL; SEM DEPLOY`.

Este recovery responde somente ao `NO-GO` independente emitido para o commit
`78ea3a9f688706e88d3c25d11bc20096aa3366b3`. Producao, flags, Sheets, Pluggy e
WhatsApp reais permanecem fora do alcance.

## Achado bloqueante recebido

A finalizacao padrao consultava explicitamente o journal para a geracao da
perna contraparte, mas nao para a geracao da perna ancora imediatamente antes
de carregar o restante do contexto de escrita. Uma revogacao apenas registrada
no journal poderia, portanto, depender de outra limpeza para bloquear o segundo
`sim`.

## Recovery implementado

Depois de reler o mapeamento e o item atual da perna ancora, a finalizacao agora
consulta `isGenerationRevoked(proposal.alias, proposal.generation)` e falha com
`save_proposal_revoked_generation` antes de ler contas internas, preparar o
plano ou abrir o store de finalizacao.

A consulta simetrica da contraparte permanece inalterada. Assim, as duas pernas
do par sao bloqueadas diretamente pelo journal, mesmo quando a revogacao foi
registrada depois da proposta e antes do segundo `sim`.

## Prova causal acrescentada

O novo teste usa a funcao publica
`prepareOpenFinanceSaveProposalFinalization` sem `loadContext` sintetico. Ele
injeta os stores usados pelo carregamento padrao, registra a perna ancora como
revogada e exige:

- rejeicao `save_proposal_revoked_generation`;
- consulta exata do alias e da geracao da ancora;
- nenhuma abertura de finalizacao e nenhuma escrita financeira.

## Evidencia local apos a mudanca

- syntax check: verde;
- bateria focal do Gate 38.4: `8/8`;
- bateria causal de revogacao, confirmacao e finalizacao: `39/39`;
- caminho publico real do Gate 38.4: `1/1`;
- unica suite hermetica ampla final: `1617` testes, `1607` aprovados, `0`
  falhas, `10` ignorados previstos; linhas `91,19%`, branches `73,77%` e
  funcoes `90,81%`.

As contagens acima sao evidencia local relatada e nao devem ser tratadas pelo
auditor como execucao propria.

## Arquivos causais do recovery

- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `tests/openFinanceTransferSaveProposal.test.js`.

## Perguntas para reauditoria

1. A consulta explicita da geracao primaria fecha integralmente a assimetria
   apontada no commit anterior?
2. O teste percorre o carregamento padrao da funcao publica e prova fail-close
   antes de qualquer escrita?
3. Resta alguma lacuna indispensavel dentro do Gate 38.4 tecnico local?
