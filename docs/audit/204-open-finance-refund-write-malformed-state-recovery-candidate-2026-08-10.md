# Gate 38.3 - recovery fail-closed de estado sem identidade

Data: 2026-08-10

## Estado proposto

`CANDIDATO DE RECOVERY LOCAL VERDE; AGUARDA REAUDITORIA; SEM DEPLOY`.

## Parecer que originou o recovery

A reauditoria independente do hash
`65198a53ebb693abc802c72b7012a93834cda6c0` confirmou integralmente os quatro
arquivos focais, mas emitiu `NO-GO` por um achado alto. Um estado
`awaiting_open_finance_save_review` ou
`awaiting_open_finance_final_confirmation` sem `data.proposalRef` ainda podia
chamar o finalizador com identidade nula e reabrir a descoberta global por ator.

## Causa confirmada

O recovery anterior vinculou corretamente os estados bem formados, mas usava a
presenca de `expectedProposalRef`, e nao a presenca do estado conversacional,
como fronteira da descoberta global. Um snapshot malformado poderia, portanto,
selecionar uma finalizacao antiga do mesmo ator.

## Fechamento aplicado

- revisao e confirmacao final sao estados explicitamente vinculados a
  identidade;
- se qualquer um desses estados nao contiver `proposalRef` textual nao vazio,
  o handler falha fechado antes de chamar finalizador ou revisor;
- a resposta informa que nenhuma escrita ocorreu e mantem o estado bloqueado,
  evitando que um novo `sim` caia na descoberta global;
- `cancelar` limpa somente o estado conversacional malformado, sem cancelar ou
  alterar uma finalizacao cuja identidade nao pode ser provada;
- estados validos continuam fornecendo a referencia exata; descoberta global
  permanece reservada ao caminho sem estado conversacional.

## Prova adversarial publica

O teste publico do Gate 38.3 preserva uma finalizacao antiga ativa para o mesmo
ator e agora injeta, separadamente, estados malformados de revisao e de
confirmacao final. Ele exige que:

1. ambos respondam fail-closed sem tentativa de append;
2. nenhum estado receba uma identidade descoberta globalmente;
3. a finalizacao antiga permaneça `awaiting_confirmation`;
4. restaurado o estado exato, a proposta nova avance normalmente;
5. somente o segundo `sim` da referencia correta produza uma escrita;
6. replay e reabertura mantenham uma unica tentativa de append.

O teste publico 38.1 permanece verde e continua cobrindo o recovery legitimo de
uma revisao exata ja `ready`.

## Evidencia local

- sintaxe dos dois arquivos alterados: verde;
- caminhos publicos Gate 38.1 + Gate 38.3: `2/2`;
- bateria causal de confirmacao, conversa, finalizacao, entrada e reembolso:
  `61/61`;
- suite hermetica ampla unica deste recovery: `1608/1598/0/10`;
- cobertura: linhas `91,09%`, branches `73,59%`, funcoes `90,74%`;
- diff check: verde.

As contagens sao execucao local do Codex e nao execucao independente do Chat.

## Arquivos focais da reauditoria

- `docs/audit/204-open-finance-refund-write-malformed-state-recovery-candidate-2026-08-10.md`;
- `src/handlers/messageHandler.js`;
- `tests/financialStateMachine.test.js`.

## Limites

O recovery nao altera a semantica financeira do Gate 38.3 nem autoriza
producao. Nenhuma flag, planilha, sessao WhatsApp, Pluggy ou servidor real foi
alterado. Estado maximo: `GO TECNICO LOCAL; SEM DEPLOY`.
