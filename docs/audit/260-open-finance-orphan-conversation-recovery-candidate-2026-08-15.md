# Gate 43 - recuperacao de conversa Open Finance orfa

Data: 2026-08-15

## Veredito do candidato

`CANDIDATO TECNICO LOCAL; AGUARDANDO AUDITORIA INDEPENDENTE`.

O primeiro candidato imutavel, `882a44984eeb75332c0e5be6d9826062da1580ed`,
recebeu `NO-GO` independente. O parecer encontrou um achado alto e um medio:

- `listReadyReviews(limit: 2)` limitava as linhas antes de o runtime descartar
  revisoes prontas expiradas, permitindo que duas expiradas ocultassem uma
  terceira revisao pronta valida;
- a evidencia testava a limpeza com um duplo em memoria, sem provar a fronteira
  duravel real nem a falha antes do transporte.

O hash foi corretamente impedido de chegar a producao.

O Gate 42 foi promovido na OCI e o primeiro ciclo concluiu `GO`, mas nao
transportou o lote numerado. A producao permaneceu com processo unico, WhatsApp
saudavel e `financial_writes=0`.

## Causa comprovada em producao

Um diagnostico sanitizado e somente leitura encontrou, nos dois principals:

- estado `awaiting_open_finance_save_selection` ainda vigente;
- zero revisoes ativas;
- zero confirmacoes prontas;
- nenhuma ligacao viva capaz de aceitar a selecao armazenada.

O runtime excluia qualquer remetente com estado conversacional antes de
verificar se o estado Open Finance ainda possuia respaldo duravel. Assim, os
dois principals eram excluidos e o ciclo ficava verde sem transporte.

## Correcao

Antes de excluir cada principal, o runtime agora confronta quatro fontes:

1. estado conversacional atual;
2. revisao guiada ativa;
3. revisao pronta e ainda nao expirada;
4. confirmacao pronta e sua evidencia de transporte no outbox.

Estados que nao pertencem ao Open Finance continuam bloqueando o envio. Todo
estado Open Finance que ainda tenha revisao ativa, revisao pronta valida ou
confirmacao pronta tambem continua bloqueado. Somente um estado das cinco acoes
Open Finance conhecidas, sem qualquer respaldo duravel vivo, e removido por
`deleteStateDurably` antes de liberar o principal.

A resposta do ciclo inclui apenas a contagem sanitizada de estados recuperados,
e o log passa a emitir `recovered_states=<n>`, sem telefone, referencia, valor
ou descricao.

## Correcao apos o primeiro NO-GO

`listReadyReviews` agora aplica `expires_at > agora` na propria consulta SQL,
antes de `ORDER BY` e `LIMIT`. O runtime consome diretamente esse contrato e
nao repete filtragem posterior. Uma prova com o store real cria duas revisoes
prontas expiradas seguidas de uma terceira valida e exige que `limit: 2`
devolva a terceira.

O teste do ciclo completo agora pregrava o estado orfao pelo
`userStateManager` real, exige que ele esteja ausente no instante em que o
transporte e chamado e reabre o store para provar que o novo lote ficou
persistido. Uma prova negativa adicional faz `deleteStateDurably` falhar e
exige propagacao da falha antes de qualquer passo posterior de entrega.

## Invariantes

- nenhuma revisao ou confirmacao viva e removida;
- nenhuma conversa financeira alheia ao Open Finance e alterada;
- nenhuma linha do outbox e reaberta ou reenviada por esta correcao;
- os 268 transportes `accepted_unconfirmed` historicos permanecem intactos;
- a autocura nao cria consentimento nem escrita financeira.

## Evidencia local

- RED causal: os dois novos testes falharam antes da implementacao;
- focal final: `17/17` verde;
- bateria afetada: o unico conflito sintetico de dependencia foi corrigido e as
  duas suites diretamente afetadas fecharam `31/31`;
- uma unica suite hermetica ampla final:
  - `1725` testes;
  - `1715` aprovados;
  - `0` falhas;
  - `10` ignorados previstos;
  - cobertura de linhas `91.52%`.

Evidencia corretiva posterior ao primeiro `NO-GO`:

- nucleo runtime/conversa: `44/44`;
- handler e finalizacao afetados: `149/149`;
- uma unica nova suite hermetica ampla final:
  - `1727` testes;
  - `1717` aprovados;
  - `0` falhas;
  - `10` ignorados previstos;
  - cobertura de linhas `91.54%`.

## Limites e proximo estado

Este documento nao autoriza deploy isoladamente. Depois do `GO` independente,
o candidato deve ser promovido por artefato OCI, preservar todo estado e provar
no primeiro ciclo `recovered_states=2`, um unico lote numerado por principal e
`financial_writes=0`.

## Arquivos para auditoria

- `docs/audit/260-open-finance-orphan-conversation-recovery-candidate-2026-08-15.md`;
- `src/openFinance/openFinanceCanaryRuntime.js`;
- `src/openFinance/openFinanceSaveProposalReviewStore.js`;
- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceAlertOutbox.js`;
- `src/state/userStateManager.js`;
- `tests/openFinanceCanaryRuntime.test.js`;
- `tests/openFinanceSaveProposalConversation.test.js`.
