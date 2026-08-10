# Gate 36 - recovery da revisao proativa de entradas e estornos

Data: 2026-08-10

## Estado proposto

`RECOVERY LOCAL VERDE; AGUARDA REAUDITORIA INDEPENDENTE`.

Este recovery permanece estritamente read-only. Nao habilita escrita
financeira, deploy, promocao OCI ou alteracao de dados reais.

## Parecer anterior

O candidato imutavel
`e8d1c3334624030f9466efc22be6d184b32cac7c` recebeu `NO-GO` independente
por duas lacunas:

1. `HIGH`: o comando explicito `revisar <codigo> ...` era consultado somente
   quando nao havia estado financeiro ativo, portanto nao precedia globalmente
   a maquina de estados e seus writers;
2. `MEDIUM`: a expiracao removia payload cifrado apenas de revisoes `pending`,
   deixando payload de revisoes `decided` alem de `expires_at`.

## Recuperacao implementada

- a entrada publica consulta primeiro o comando explicito do Gate 36, depois
  resolve o estado financeiro; o parser fechado impede que mensagens comuns
  sejam absorvidas;
- o teste publico cria um estado financeiro ativo, executa a funcao real e
  exige decisao persistida, estado anterior preservado e zero efeitos;
- `purgeExpired()` agora abrange `pending` e `decided`, remove payload e versao
  cifrados e preserva somente metadados terminais autenticados;
- o teste de expiracao decide uma revisao, avanca o relogio, purga, inspeciona
  a linha real e exige leitura tardia rejeitada;
- `financial_writes=0` continua invariavel.

## Evidencia local focal

- Gate 36: `14/14`;
- entrada publica adversarial com estado ativo: `1/1`;
- maquina de estados completa: `130/130`;
- syntax check dos arquivos alterados: verde;
- suite hermetica ampla: `1581/1571/0/10`, com zero falhas e os dez
  skips previstos;
- cobertura ampla: linhas `90,94%`, branches `73,56%` e funcoes `90,61%`.

As contagens sao evidencia de execucao local do Codex, nao execucao do auditor.
Nenhuma suite ampla verde sera repetida sem nova mudanca causal.

## Fronteiras preservadas

- Gate 34 continua pausado;
- Gate 35 continua em `PARTIAL_NO_GO` sem inferencia historica;
- transferencia e reserva pertencem ao Gate 37;
- escrita financeira pertence ao Gate 38;
- producao, Pluggy real, WhatsApp real e dados privados nao foram acessados.
