# CODEX-USAGE-CAL-01 — prova causal de adopted_existing

Data: 2026-08-03

## Estado local

`PROVA LOCAL VERDE; REAUDITORIA INDEPENDENTE PENDENTE`.

O segundo recovery `ee3cff39c212a69c7c62231a5f7551c9fdb5da65`
recebeu NO-GO exclusivamente porque a trilha `adopted_existing` do manager nao
possuia prova executavel. O auditor nao identificou lacuna de implementacao nos
demais controles. Este candidato nao altera codigo de produto.

## Prova positiva

O teste executa `Manage-CodexUsageTelemetry.ps1 -Action Install` em configuracao
temporaria com BOM, conserva o backup criado e remove somente
`install-state.json`. Um segundo `Install` deve entrar na trilha real de adocao,
retornar `adopted_existing=true`, recriar estado `installed` referenciando
backup existente e preservar integralmente os bytes da configuracao instalada.

## Prova adversarial

Outro teste prepara a mesma situacao, mas remove somente o BOM do backup antes
do segundo `Install`. O manager deve recusar a adocao, preservar integralmente
os bytes da configuracao corrente e nao recriar `install-state.json`. Assim, um
backup textualmente equivalente, mas binariamente diferente, nao e aceito.

## Evidencia local

- bateria focal `npm run test:codex-usage-calibration`: `18/18` verde;
- os dois casos novos executam o manager PowerShell real;
- nenhuma alteracao em coletor, manager, configuracao global ou produto;
- nenhuma tarefa de calibracao foi iniciada;
- workflow validator e verificacoes finais devem acompanhar o commit auditavel.

## Alcance

O candidato fecha somente a lacuna probatoria de `adopted_existing`.
`RX-HIST-SEG-01` permanece bloqueado ate GO independente por hash imutavel.
