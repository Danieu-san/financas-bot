# OF-NUMERIC-SAVE-RELEASE-01 - recovery da corrida de temporarios

Data: 2026-08-06

## Origem

O primeiro recovery, no hash
`3e94bb43c7bf13e0bf6521a9a36236080f83af7d`, recebeu `NO-GO` por
um unico `MEDIUM` residual. O auditor confirmou `CRITICAL 0`, `HIGH 0` e
`LOW 0`, incluindo o fechamento do rollback real, backlog pos-rollback,
tripwire externo e politica imutavel.

A lacuna restante era uma corrida: `state_store.tmp` ou
`state_store.replay.tmp` podia aparecer durante a etapa assincrona depois do
precheck. Como esses arquivos nao entravam no fingerprint final, o bundle podia
ser aceito enquanto uma promocao de estado estava em curso.

## Correcao causal

- `state`, `replay`, `temp` e `replayTemp` entram no conjunto fingerprintado;
- bancos principais, WAL e rollback journal SQLite com conteudo tambem entram;
- SHM derivado nao e tratado como dado persistente e pode ser criado pela
  propria leitura SQLite sem falso positivo;
- imediatamente antes do manifesto, a existencia de qualquer temporario e
  verificada novamente;
- aparecimento, desaparecimento ou mudanca de qualquer item rastreado produz
  `numeric_save_release_source_changed_during_snapshot`;
- a falha remove integralmente o bundle parcial.

## Prova adversarial

O teste substitui o `checkpoint()` do journal por uma versao que cria
`state_store.tmp` exatamente durante a etapa assincrona. O gate deve rejeitar o
snapshot pela causa especifica e deixar o destino inexistente. A prova anterior
de mudanca direta do state store permanece verde.

## Evidencia local final

- syntax checks: verdes;
- focal: `9/9`;
- causal: `229/229`;
- suite hermetica ampla final: 1.539 testes, 1.529 aprovados, zero falhas e 10
  skips conhecidos;
- cobertura: linhas 90,82%, branches 73,38%, funcoes 90,53%;
- guarda de rede valida e escopo local-only;
- nenhuma chamada real, flag, escrita financeira, deploy, OCI ou producao.

As contagens sao evidencia local relatada, nao execucao do auditor.

## Arquivos a reauditar

- `src/openFinance/openFinanceNumericSaveReleaseGate.js`;
- `tests/openFinanceNumericSaveReleaseGate.test.js`;
- este manifesto;
- `docs/plans/workstreams/open-finance-numeric-save-release.md`;
- `docs/agent-memory/workstreams/open-finance-historical-rx.md`;
- `docs/agent-memory/workstreams/index.md`.

## Estado maximo

`Segundo recovery candidato aguardando auditoria independente por hash
imutavel`. Nenhuma acao operacional e autorizada.
