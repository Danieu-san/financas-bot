# RX-HIST-AMBIGUITY-WHATSAPP-01 - candidato local

Data: 2026-08-05

## Objetivo

Integrar o nucleo auditado da revisao numerada de ambiguidades historicas a
entrega e a entrada publicas do WhatsApp para exatamente os dois atores
familiares autorizados, sem habilitar salvamento ou escrita financeira.

## Fronteira implementada

- a inicializacao permanece `off` por padrao e aceita somente o modo explicito
  `prompt`;
- o estado candidato e lido de arquivo externo absoluto e continua autenticado
  e cifrado pelo nucleo auditado;
- uma outbox cifrada cria exatamente um job deduplicado por revisao e ator;
- o dreno fica restrito aos dois jobs da revisao corrente e nao consome mensagens
  antigas ou alheias da mesma outbox;
- resposta com ID do provedor confirma a entrega; retorno sem ID ou excecao de
  resultado ambiguo terminaliza como `accepted_unconfirmed`, sem reenvio cego;
- somente falha marcada como envio definitivamente nao realizado agenda retry;
- apenas ator autorizado com entrega tentada pode responder pela entrada
  publica;
- conversa financeira ja ativa conserva precedencia; fora dela, a revisao
  numerada e consumida antes de qualquer writer ou LLM;
- `sim` generico nao decide ambiguidade; a selecao permanece numerada e isolada
  por telefone;
- uma resposta atrasada do outro telefone depois da decisao familiar e
  consumida uma unica vez e depois deixa de interceptar novos numeros;
- restart reabre o mesmo candidato e preserva progresso sem nova entrega.

## Evidencia local

- syntax check do outbox: verde;
- bateria focal de runtime, nucleo, outbox e handler publico: 154/154;
- bateria causal Open Finance: 377/377;
- a primeira ampla encontrou somente as novas variaveis ausentes do
  `.env.example`; o contrato ambiental focal ficou verde em 5/5 depois da
  correcao;
- suite hermetica ampla final substitutiva: 1.502 testes, 1.492 aprovados, zero
  falhas e 10 skips conhecidos;
- cobertura final: linhas 90,72%, branches 73,27%, funcoes 90,40%;
- nenhum cliente WhatsApp real, Pluggy, planilha, ledger, deploy ou producao foi
  acessado;
- `financial_writes=0` em todos os retornos do gate.

## Arquivos causais

- `src/openFinance/openFinanceHistoricalAmbiguityWhatsappRuntime.js`;
- `src/openFinance/openFinanceHistoricalAmbiguityReview.js`;
- `src/jobs/schedulerMessageOutbox.js`;
- `src/handlers/messageHandler.js`;
- `index.js`;
- `tests/openFinanceHistoricalAmbiguityWhatsappRuntime.test.js`;
- `tests/openFinanceHistoricalAmbiguityReview.test.js`;
- `tests/financialStateMachine.test.js`.

## Alcance e nao alcance

Este candidato cobre somente preparacao, entrega e roteamento publico da
revisao read-only. Nao consome as decisoes para criar lancamentos, nao escreve
em fonte financeira, nao ativa o modo `prompt`, nao executa deploy e nao altera
producao. O estado maximo antes de auditoria independente e `candidato local`.
