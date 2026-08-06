# OF-NUMERIC-SAVE-RELEASE-01 - recovery do NO-GO independente

Data: 2026-08-06

## Origem

O candidato `a27ac8160cf797a04d4e798929bfae2ae427a6ff` foi lido
integralmente por auditor independente e recebeu `NO-GO`.

Contagem do parecer: `CRITICAL 0`; `HIGH 2` (um defeito e uma lacuna
probatoria); `MEDIUM 2`; `LOW 1`.

O defeito determinante era que `rollback_match=true` comparava a instalacao
limpa com uma segunda restauracao limpa em outro diretorio. A arvore que sofria
quarentena, recovery e claim/release nunca era revertida. O parecer tambem
apontou ausencia de prova do backlog na arvore pos-rollback, de quiescencia
cruzada da copia, de tripwire externo e de politica imutavel ao longo do ensaio.

## Recovery

- o mesmo diretorio `installed` que sofre o ensaio e removido e restaurado;
- um arquivo extra e injetado antes do rollback e deve desaparecer;
- o fingerprint recursivo inclui todos os arquivos, inclusive sidecars, e deve
  coincidir integralmente com a instalacao limpa original;
- o outbox restaurado e reaberto e auditado: nenhum registro anterior ao corte
  pode ser reclamado, `accepted_unconfirmed` permanece terminal e pendencia de
  fonte estranha impede `GO`;
- a origem recebe fingerprint dos bancos principais, WAL com conteudo e
  arquivos cifrados antes/depois; qualquer alteracao aborta e remove o bundle
  parcial;
- a CLI exige tambem `--confirm-quiescent-source-copy`;
- aliases e ativacoes ficam congelados no preflight e nao sao relidos do
  objeto mutavel durante o ensaio;
- a prova focal instala tripwires para `fetch`, HTTP, HTTPS e sockets e exige
  zero chamadas;
- o handler publico continua exigindo zero linhas financeiras para estado
  individual legado e lote numerico reabertos.

## Evidencia local final

- syntax checks dos dois modulos novos: verdes;
- focal do gate: `8/8`;
- bateria causal: `228/228`;
- suite hermetica ampla final: 1.538 testes, 1.528 aprovados, zero falhas e 10
  skips conhecidos;
- cobertura: linhas 90,81%, branches 73,36%, funcoes 90,52%;
- o runner hermetico confirmou guarda de rede valida e escopo local-only;
- nenhuma chamada real Pluggy/Sheets/WhatsApp, flag, escrita financeira,
  deploy, OCI ou producao.

As contagens sao evidencia local relatada e nao execucao do auditor.

## Arquivos a reauditar

- `src/openFinance/openFinanceNumericSaveReleaseGate.js`;
- `scripts/runOpenFinanceNumericSaveReleaseGate.js`;
- `tests/openFinanceNumericSaveReleaseGate.test.js`;
- `tests/financialStateMachine.test.js`;
- `package.json`;
- `docs/audit/153-open-finance-numeric-save-release-readiness-candidate-2026-08-06.md`;
- este manifesto;
- `docs/plans/workstreams/open-finance-numeric-save-release.md`;
- `docs/agent-memory/workstreams/open-finance-historical-rx.md`;
- `docs/agent-memory/workstreams/index.md`.

## Estado maximo

`Recovery candidato aguardando nova auditoria independente por hash imutavel`.
Este documento nao autoriza flag, deploy, smoke, OCI ou producao.
