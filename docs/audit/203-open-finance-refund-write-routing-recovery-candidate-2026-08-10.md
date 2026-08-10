# Gate 38.3 - recovery de identidade causal da confirmacao

Data: 2026-08-10

## Estado proposto

`CANDIDATO DE RECOVERY LOCAL VERDE; AGUARDA REAUDITORIA; SEM DEPLOY`.

## Parecer que originou o recovery

O auditor do hash `6450934dde573b33c8c840cf28cda77a4208e17c`
declarou acesso integral insuficiente e nao emitiu veredito binario. A inspeção
parcial apontou um achado alto plausivel: durante `awaiting_open_finance_save_confirmation`
ou `awaiting_open_finance_save_review`, o handler consultava o finalizador sem
`expectedProposalRef`; um `sim` ou outra resposta da proposta atual poderia ser
consumido por uma unica finalizacao antiga ainda ativa para o mesmo ator.

## Causa confirmada

O finalizador fazia descoberta global por ator quando o handler nao fornecia
identidade. Alem disso, mesmo quando `expectedProposalRef` era informado e nao
existia no store final, o codigo ainda podia selecionar outra finalizacao ativa.
A separacao de stores era duravel, mas a precedencia do roteamento nao estava
causalmente vinculada ao estado conversacional.

## Fechamento aplicado

- a fase de primeiro aceite (`awaiting_open_finance_save_confirmation`) nao
  consulta mais o finalizador;
- em revisao ou confirmacao final, o handler sempre fornece o `proposalRef`
  exato do estado;
- com identidade esperada, o finalizador nunca percorre finalizacoes de outro
  item; ele le apenas a identidade exata;
- recovery anterior a atualizacao do estado continua permitido somente quando
  a revisao dessa identidade exata ja esta duravelmente `ready`;
- revisao ainda em edicao retorna ao handler de revisao sem ser consumida;
- descoberta global por ator permanece apenas quando nao existe estado
  conversacional, preservando o recovery duravel legado.

## Prova adversarial

O caminho publico do Gate 38.3 agora cria uma finalizacao antiga ativa para o
mesmo ator antes do primeiro `sim` da nova proposta. O teste exige que:

1. o primeiro `sim` avance somente a nova proposta para conferencia;
2. `financial_writes` e tentativas de append permaneçam zero;
3. a finalizacao antiga permaneça `awaiting_confirmation`, sem cancelamento,
   invalidacao ou escrita;
4. a revisao da nova proposta conclua e somente seu segundo `sim` produza um
   append no cartao original;
5. replay e reabertura continuem com uma unica tentativa de append.

O teste publico anterior do Gate 38.1 tambem foi executado junto e prova que
uma revisao exata ja `ready` ainda recupera o prompt final e avanca o lote sem
herdar consentimento.

## Evidencia local

- sintaxe dos dois modulos alterados: verde;
- caminhos publicos Gate 38.1 + Gate 38.3: `2/2`;
- regressao de compra, entrada, conversa e finalizacao: verde;
- suite hermetica ampla final: `1608/1598/0/10`;
- cobertura: linhas `91,10%`, branches `73,68%`, funcoes `90,73%`;
- diff check: verde.

As contagens sao execucao local do Codex, nao execucao do auditor.

## Arquivos focais da reauditoria

- `docs/audit/203-open-finance-refund-write-routing-recovery-candidate-2026-08-10.md`;
- `src/handlers/messageHandler.js`;
- `src/openFinance/openFinanceSaveProposalFinalization.js`;
- `tests/financialStateMachine.test.js`.

## Limites

Este recovery nao altera o contrato financeiro do candidato anterior nem
autoriza producao. Nenhuma flag, planilha, sessao WhatsApp, Pluggy ou servidor
real foi alterado. Estado maximo: `GO TECNICO LOCAL; SEM DEPLOY`.
