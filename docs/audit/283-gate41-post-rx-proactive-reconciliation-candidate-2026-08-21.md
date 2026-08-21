# Gate 41 — candidato pós-RX da reconciliação proativa

Data: 2026-08-21

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Problema reproduzido

Depois da aplicação histórica, ciclos reais do Open Finance falhavam fechados
em `save_proposal_replay_conflict`, com zero escrita financeira. A reprodução
em cópias consistentes dos bancos localizou oito propostas cuja compra já era
`matched` na planilha e cuja única divergência no payload era `source.date`,
alterada pelo provedor entre observações.

O store já aceitava mudança isolada de data enquanto uma proposta não
transportada continuava elegível. A transição para inelegível, que deve
cancelar a proposta já reconciliada, exigia igualdade literal também da data e
abortava atomicamente o ciclo inteiro.

## Mudança causal

`OpenFinanceShadowPreviewStore` passa a aceitar, somente na transição de
inelegibilidade, igualdade integral após normalizar `source.date`, desde que as
duas datas sejam válidas. Identidade, alias, geração, referência de transação,
valor, descrição, conta, principal, estado anterior e demais campos continuam
imutáveis. Divergência de valor permanece `save_proposal_replay_conflict`.

O mesmo candidato conclui a etapa visual já aprovada do gasto livre: mantém
todo o conteúdo e envolve em asteriscos as seis linhas monetárias para que o
WhatsApp destaque limite, realizado, gasto do dia, ritmo, restante e disponível
do dia. Não adiciona memória ou aprendizado automático de estabelecimentos.

## Evidência local

- RED reproduziu o conflito de data na transição `new -> matched`;
- prova focal corretiva e regressões adjacentes: `4/4`;
- bateria causal completa do store: `15/15`;
- ciclo integral em bancos isolados: `GO`, 73 propostas históricas invalidadas,
  3 propostas atuais preservadas e zero escrita financeira;
- quatro tentativas de transporte foram interceptadas por cliente sintético;
  nenhuma mensagem externa foi enviada;
- suíte hermética final única: 1.756 testes, 1.746 aprovados, zero falhas, 10
  skips controlados e 91,61% de cobertura de linhas.

As contagens são evidência relatada e não execução do auditor.

## Arquivos para leitura integral

1. este manifesto;
2. `src/openFinance/openFinanceShadowPreviewStore.js`;
3. `tests/openFinanceSaveProposalShadow.test.js`;
4. `src/handlers/messageHandler.js`;
5. o teste focal de apresentação em `tests/unit.test.js`.

## Questões de auditoria

1. A normalização fica estritamente limitada a `source.date` válida e à
   transição que invalida uma proposta agora inelegível?
2. Valor, descrição, identidade, conta, alias, geração e referências continuam
   falhando fechados?
3. O cancelamento terminal continua durável, idempotente e incapaz de reabrir
   uma proposta?
4. O negrito altera somente apresentação, sem mudar cálculo ou política do
   gasto livre?
5. Há lacuna causal indispensável antes de promover o candidato à OCI?

## Limite

Este commit não autoriza deploy sozinho. A promoção depende de `GO TÉCNICO
LOCAL` independente, instalação por artefato imutável, health verde e ciclo
real controlado. O smoke de WhatsApp permanece posterior à promoção.
