# 9P.2 — candidato de entrega e captura da proposta Open Finance

Atualizado em: 2026-07-24

Base:
`ae9c7df91b0015d9812afdd0e06db6399254851a`.

## Estado

`CANDIDATO LOCAL VERDE; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

Este manifesto deve ser lido no mesmo hash imutável informado no prompt da
auditoria. O gate não autoriza deploy nem escrita financeira.

## Contrato implementado

- `OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt` é explícito, desligado por padrão,
  exige preview e reconciliação em canário e exige
  `OPEN_FINANCE_WRITE_MODE=off`;
- `off` e `shadow` permanecem passivos no handler público;
- somente decisão reconciliada `new` ligada a compra `POSTED`, política de
  visibilidade válida e principal familiar explícito gera proposta perguntável;
- observação, proposta e alerta são ligados por referências autenticadas; o
  outbox rejeita vínculos divergentes;
- a confirmação durável é preparada antes do transporte e retry definitivo
  reutiliza a mesma confirmação;
- o token bruto da confirmação não entra na mensagem, no retorno do transporte
  nem no estado conversacional;
- transporte confirmado e `accepted_unconfirmed` habilitam a resposta; alerta
  ainda `pending` depois de falha definitiva não pode ser aceito por um `sim`
  genérico;
- estado conversacional é somente índice auxiliar. Depois de restart ou perda
  desse índice, a combinação de confirmação pronta e entrega durável recupera
  a proposta;
- um estado conversacional já ativo e uma confirmação entregue ainda pendente
  excluem o familiar de nova pergunta, preservando paralelismo entre Daniel e
  Thaís;
- `sim`, `não` e `cancelar` passam pelo handler público já serializado por
  remetente; aceitação apenas avança a proposta para conferência posterior;
- terceiro, proposta expirada/ausente, entrega não ocorrida e mais de uma
  proposta entregue para o mesmo ator falham fechados;
- todos os retornos e testes mantêm `financial_writes=0`.

## Evidência causal

- mensagem proativa contém resumo e aviso de que nada foi salvo, sem bearer
  token;
- falha definitiva libera o alerta e o retry reaproveita a confirmação;
- falha ambígua fica at-most-once e não é reenviada automaticamente;
- resposta a uma proposta não entregue é recusada;
- restart sem estado auxiliar ainda permite a resposta do destinatário;
- recusa e cancelamento são terminais e não escrevem;
- duas propostas entregues para o mesmo ator geram ambiguidade fail-closed;
- ator excluído não tem alerta reclamado nem confirmação preparada;
- ciclo real do runtime cria proposta, entrega pelo transporte e grava somente
  a referência sanitizada no estado conversacional;
- `handleMessage` real consome a aceitação pela fronteira serializada e exige
  zero append financeiro.

## Evidência local executada pelo Codex

- bateria causal focada: `44/44`;
- máquina de estados completa: `122/122`;
- todos os testes Open Finance: `244/244`;
- runner hermético: `1.298` testes, `1.293` aprovados, zero falhas e cinco
  skips funcionais previstos;
- cobertura: linhas `90,10%`, branches `72,21%`, funções `89,92%`;
- bloqueio de rede do runner ativo para fetch, HTTP(S), sockets, processos Node
  descendentes e subprocessos não Node;
- sintaxe e `git diff --check`: verdes.

O auditor independente não deve tratar essas contagens como execução própria.
Nenhuma execução local usou produção, Google, WhatsApp ou Pluggy reais.

## Arquivos do candidato

- `.env.example`;
- `src/handlers/messageHandler.js`;
- `src/openFinance/openFinanceAlertOutbox.js`;
- `src/openFinance/openFinanceCanaryRuntime.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceWhatsappCanaryDelivery.js`;
- `tests/financialStateMachine.test.js`;
- `tests/openFinanceSaveProposalConfirmation.test.js` como contrato predecessor;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `tests/openFinanceSaveProposalShadow.test.js`;
- `tests/openFinanceWhatsappCanaryDelivery.test.js`;
- `docs/plans/current-gate.md`;
- `docs/agent-memory/current.md`;
- este documento.

## Limites deliberados

- aceitação não abre correção guiada nesta fatia;
- não há revalidação final contra Sheets/ledger;
- não há operation key, recibo ou writer financeiro;
- modo `prompt` continua somente candidato local até auditoria;
- não houve deploy, Oracle/AWS, mensagem real nem alteração de configuração
  ativa.

## Perguntas para a auditoria

1. O vínculo observação→proposta→alerta→confirmação impede resposta a evento
   não reconciliado, não entregue ou destinado ao outro familiar?
2. Preparar antes do transporte, reutilizar no retry definitivo e não reenviar
   transporte ambíguo preserva causalidade e at-most-once?
3. Estado auxiliar mais fallback durável recuperam restart sem permitir que um
   `sim` genérico aceite proposta nunca entregue?
4. A exclusão por ator impede segunda pergunta ativa sem bloquear o outro
   familiar?
5. O handler público real preserva serialização, não interfere em outros
   estados e mantém todo writer financeiro fora da fatia?
6. Resta achado `CRITICAL`, `HIGH` ou `MEDIUM` que bloqueie o `GO TÉCNICO
   LOCAL` do 9P.2?
