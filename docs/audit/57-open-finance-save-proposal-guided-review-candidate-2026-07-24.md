# 9P.3 — candidato de revisão e correção guiada da proposta

Atualizado em: 2026-07-24

Base:
`4fa682e197a2a537ec76e9aed1a94ae3b4039dd6`.

## Estado

`CANDIDATO LOCAL VERDE; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

## Objetivo

Transformar a aceitação 9P.2 em uma conferência local, guiada e durável de
pessoa, categoria, forma de pagamento, conta financeira e cartão, sem chamar
writer financeiro. Revalidação final e persistência continuam fora deste gate.

## Implementação

- o handler público carrega um catálogo read-only somente quando uma proposta
  entregue e pronta recebe `sim`;
- o catálogo limita pessoas e linhas ao escopo financeiro familiar autorizado,
  reúne categorias já observadas/cadastradas, contas ativas e cartões ativos e
  mantém formas de pagamento em enumeração fechada;
- a revisão é preparada em SQLite cifrado antes de a confirmação mudar para
  `accepted`;
- depois da aceitação, a revisão muda de `prepared` para `editing`;
- queda antes da aceitação deixa a confirmação pronta e a revisão preparada
  para replay; queda depois da aceitação permite ativar a revisão preparada na
  próxima mensagem;
- somente uma revisão `prepared|editing` pode existir por ator familiar;
- o runtime consulta a revisão durável, além do estado auxiliar, antes de
  entregar outra proposta ao mesmo familiar;
- pessoa, categoria, pagamento, conta e cartão usam escolhas numeradas do
  catálogo capturado;
- `Crédito` exige cartão; `Débito` e `PIX` exigem conta financeira; mudar a
  forma de pagamento limpa o campo incompatível;
- campos ausentes bloqueiam `Concluir conferência`;
- cancelamento e expiração são terminais; metadados mutáveis são autenticados;
- payload, catálogo e rascunho ficam cifrados; o estado conversacional auxiliar
  guarda somente a referência HMAC da proposta;
- todos os retornos declaram `financial_writes=0`.

## Prova causal

A prova RED inicial falhou porque
`src/openFinance/openFinanceSaveProposalReviewStore.js` ainda não existia.

Os cenários verdes exigem:

1. preparação durável antes da aceitação;
2. replay após falha entre preparação e aceitação;
3. correção individual de todos os cinco campos;
4. bloqueio de conclusão com cartão ou conta obrigatória ausente;
5. recuperação sem estado auxiliar e exclusão de nova pergunta no runtime;
6. catálogo sem usuário, conta ou categoria fora do escopo familiar;
7. indisponibilidade da fonte sem virar catálogo vazio autorizado;
8. payload financeiro ausente do SQLite em claro;
9. terceiro incapaz de ler ou decidir;
10. cancelamento, expiração e tamper fail-closed;
11. entrada pública real preservando zero append financeiro.

## Evidência executada pelo Codex

- conversa, store e controles 9P.2/9P.3: `15/15`;
- catálogo familiar read-only: `2/2`;
- runtime shadow/prompt e bloqueio por revisão durável: `8/8`;
- máquina de estados e entrada pública serializada: `122/122`;
- bateria causal combinada anterior, incluindo os módulos acima: `136/136`;
- runner hermético completo:
  - testes: `1.307`;
  - aprovados: `1.302`;
  - falhas: `0`;
  - skips funcionais previstos: `5`;
  - cobertura: linhas `90,12%`, branches `72,23%`, funções `90,01%`;
- sintaxe dos seis arquivos de produto alterados: verde;
- workflow portátil e `git diff --check`: verdes.

O runner hermético bloqueou rede em `fetch`, `http`, `https`, `net`,
subprocessos Node e subprocessos não Node. Nenhuma integração real foi usada.

## Arquivos do candidato

- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceSaveProposalReviewCatalog.js`;
- `src/openFinance/openFinanceSaveProposalConversation.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceCanaryRuntime.js`;
- `src/handlers/messageHandler.js`;
- `tests/openFinanceSaveProposalConversation.test.js`;
- `tests/openFinanceSaveProposalReviewCatalog.test.js`;
- `tests/openFinanceSaveProposalShadow.test.js`;
- `tests/financialStateMachine.test.js`;
- `docs/plans/current-gate.md`;
- `docs/agent-memory/current.md`;
- este documento.

## Limites

- `OPEN_FINANCE_SAVE_PROPOSAL_MODE` continua desligado por padrão;
- `OPEN_FINANCE_WRITE_MODE=off` continua obrigatório;
- revisão pronta não revalida Sheets/ledger e não autoriza persistência;
- não existe operation key de writer nem recibo de escrita neste gate;
- não houve deploy, Oracle/AWS, Pluggy, Google ou WhatsApp reais.

## Perguntas para a auditoria

1. Preparar antes de aceitar, ativar depois e recuperar `prepared` fecha a
   janela de perda causal sem permitir revisão de proposta não aceita?
2. O catálogo read-only e o vínculo do ator impedem ampliação para pessoas,
   categorias, contas ou cartões fora do casal autorizado?
3. A máquina guiada preserva dependências entre pagamento, conta e cartão,
   bloqueia campos ausentes e mantém todo writer financeiro fora da fronteira?
4. Integridade, cifragem, expiração, cancelamento, restart e exclusão runtime
   sustentam o contrato local de 9P.3?
5. Resta achado `CRITICAL`, `HIGH` ou `MEDIUM` ou lacuna causal indispensável?
