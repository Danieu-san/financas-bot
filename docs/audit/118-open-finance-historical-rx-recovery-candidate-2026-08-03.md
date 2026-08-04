# RX-HIST-SEG-01 - candidato de recovery

Data: 2026-08-03

## Estado

`RECOVERY LOCAL AGUARDANDO REAUDITORIA INDEPENDENTE`.

Este documento nao autoriza dados reais, escrita financeira, integracao Pluggy,
deploy, WhatsApp ou producao.

## Base e NO-GO anterior

- candidato anterior: `3888a337f12cb9e44524d0c1510f1f8507e5fd51`;
- auditoria independente: `NO-GO`;
- ALTA: colecao indisponivel podia produzir agregados zero e bills/parcelas
  podiam apontar para conta bancaria;
- MEDIA: CLI dizia `GO` com blockers e comparava apenas o arquivo principal do
  SQLite;
- BAIXA: a justificativa dos skips PowerShell nao distinguia plataforma.

## Recovery implementado

### Ausencia nao vira zero

- `accounts` ou `transactions` incompletos deixam fluxos, saldos derivados e
  contagens como `null`;
- `bills` incompleto deixa quantidade, total e datas derivadas como `null`;
- investimentos so sao emitidos quando a colecao correspondente esta
  `available`;
- blockers continuam impedindo `ready_for_reconciliation`.

### Fronteira de produto

- bill exige `account.type === CREDIT`;
- metadados de parcela em conta `BANK` falham fechado;
- nenhum valor de cartao e usado para reconstruir saldo bancario.

### Resultado da CLI

- relatorio com blockers e preservado para diagnostico privado, mas stdout usa
  `outcome: NO_GO` e o processo termina com codigo 2;
- somente relatorio sem blockers retorna `GO` e codigo 0.

### Imutabilidade SQLite

- a prova cobre banco, `-wal`, `-shm` e `-journal`, incluindo existencia,
  tamanho e SHA-256;
- journal nao vazio falha fechado;
- o conjunto completo e copiado para diretorio temporario privado;
- apenas a copia e aberta pelo vault com `readonly:true`;
- a copia e removida em `finally`;
- o conjunto-fonte e comparado antes/depois e qualquer divergencia falha.

### Skips PowerShell

- no Windows, os cinco testes sao pulados pelo runner hermetico porque sua trava
  proibe `powershell.exe`, e passam quando executados diretamente;
- fora do Windows, sao pulados tambem por dependencia de plataforma;
- a lista exata de skips permanece fail-closed.

## Evidencia executada localmente

- RED causal: quatro falhas correspondentes aos achados;
- syntax checks: verdes;
- bateria causal do recovery: 30/30;
- suite hermetica final: 1.460 testes, 1.450 aprovados, 0 falhas, 10 skips
  conhecidos e 0 todo;
- cobertura: linhas 90,57%, branches 72,84%, funcoes 90,19%;
- contagens sao evidencia local relatada, nao execucao do auditor.

## Arquivos materiais

- `src/openFinance/openFinanceHistoricalRx.js`;
- `scripts/runOpenFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`;
- este manifesto e checkpoints do workstream.

## Lacunas preservadas

- nenhuma copia real foi aberta;
- data de corte e lifecycle reais ainda nao foram definidos/validados;
- o RX privado ainda exige conferencia humana;
- nenhuma reconciliacao ou escrita esta autorizada.

## Proximo gate

Publicar o recovery em novo hash imutavel e obter reauditoria independente. So
um `GO TECNICO LOCAL` autoriza executar o preview privado em copia isolada.
