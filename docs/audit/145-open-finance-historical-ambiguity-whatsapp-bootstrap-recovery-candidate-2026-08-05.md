# RX-HIST-AMBIGUITY-WHATSAPP-01 - recovery de bootstrap candidato

Data: 2026-08-05

Commit anterior: `10e398af0391ca35273ee39292e8a28494d62d2d`

## Motivo do recovery

A reauditoria independente do recovery 144 retornou `NO-GO`. O auditor
confirmou os fechamentos anteriores, mas observou que `index.js` iniciava o
runtime da revisao e o backfill sem uma barreira explicita entre as duas
promessas. A ordem vigente dependia de a instalacao do runtime ocorrer antes do
primeiro `await`, detalhe que a prova composta nao exercitava pelo bootstrap
real.

## Fechamento

- `index.js` delega os servicos do evento `ready` a um coordenador unico;
- o coordenador inicia o scheduler e aguarda integralmente a inicializacao do
  runtime historico antes de iniciar canary e descoberta de nao lidas;
- em modo `prompt`, configuracao invalida ou runtime nao pronto bloqueiam o
  backfill com motivo estavel e zero mensagens processadas;
- em modo explicitamente `off`, o backfill preserva o comportamento anterior;
- rejeicao inesperada da sequencia sobe para um unico catch sanitizado no
  entrypoint, sem rejeicao nao tratada no `EventEmitter`;
- nenhuma flag e alterada e `financial_writes=0` permanece invariavel.

## Evidencia causal

- RED inicial: o teste exigia um coordenador inexistente e falhou por modulo
  ausente;
- a prova usa o inicializador real do runtime, review store e outbox reais e o
  backfill real; a primeira entrega fica suspensa e `getChats` deve permanecer
  em zero ate a liberacao e a segunda entrega;
- caso adversarial separado exige zero descoberta quando `prompt` e invalido;
- caso de compatibilidade exige uma descoberta quando o modo e `off`;
- bateria causal de runtime, handler, outbox, backfill, readiness, liveness e
  health: 174/174;
- suite hermetica ampla final: 1.510 testes, 1.500 aprovados, zero falhas e 10
  skips conhecidos;
- cobertura final: linhas 90,75%, branches 73,28%, funcoes 90,38%;
- runner valido, com tripwire de rede e sem WhatsApp real, Pluggy, Google,
  ledger, OCI, deploy ou producao.

## Alcance

O candidato fecha somente a ordem causal do bootstrap do gate read-only. Nao
consome decisoes para salvamento, nao ativa `prompt`, nao escreve dados
financeiros e nao autoriza deploy ou producao. O estado maximo permanece
`candidato aguardando auditoria independente`.
