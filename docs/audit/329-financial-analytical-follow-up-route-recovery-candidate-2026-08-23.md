# ARQ-06 — recovery do roteamento público de follow-up analítico

Data: 2026-08-23

## Estado

`RECOVERY CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O canário de produção está `off`. Este recovery não autoriza novo artefato,
deploy ou smoke antes de `GO TÉCNICO LOCAL`.

## Falha observada

O release `e8a27548d32c84faaea02e2231267195e049bb84` promoveu corretamente a
pergunta base “Quais foram os maiores gastos da família neste mês?” pelo
reasoner público, com uma leitura, escopo familiar e zero efeitos. O follow-up
“E só com alimentação?” recebeu a resposta pública de intenção desconhecida e
não gerou telemetria do canário.

A reprodução pelo `handleMessage` real confirmou a causa: a entrada pública
classificava a frase elíptica como `desconhecido` e executava o `default` antes
de alcançar o `case 'pergunta'`, embora o classificador analítico interno já
derivasse corretamente `ranking_maiores_gastos`, categoria `alimentacao` e
escopo `family` a partir do checkpoint anterior.

## Recovery

Antes do planner shadow e do `switch`, uma resposta externa
`desconhecido` passa por recuperação determinística somente quando:

1. existe checkpoint analítico válido para o mesmo remetente;
2. `classifyPerguntaLocally` consegue derivar uma intenção analítica válida;
3. a classificação não é a resposta genérica `pergunta_geral`.

Nesse caso, apenas o envelope externo é promovido a `pergunta`; o próprio
`case 'pergunta'` repete o classificador local e continua responsável por
resolver usuários autorizados, escopo, fonte, plano, adequação, resposta e
armazenamento do novo checkpoint. Sem contexto ou sem classificação válida, a
resposta original permanece inalterada. O texto “sim” com checkpoint ativo
continua em `desconhecido` e nenhum writer foi deslocado para essa fronteira.

## Evidência local

- teste RED público: o `handleMessage` devolveu a resposta de intenção
  desconhecida para o follow-up exato;
- teste GREEN público: o mesmo handler recuperou `pergunta`, resolveu
  `scope=family` com dois usuários, consultou a planilha pessoal/familiar e
  armazenou novo checkpoint com categoria `alimentacao`;
- controle negativo no mesmo teste: “sim” continuou desconhecido;
- efeitos: zero append e zero delete;
- teste unitário causal do plano familiar/categoria: `1/1`;
- suíte hermética ampla: `1.821/1.831`, zero falha e dez skips previstos;
- cobertura: linhas `91,82%`, branches `75,05%`, funções `91,23%`.

As contagens são execução local relatada, não execução do auditor. O teste
público usa o handler e os resolvedores do produto com stores e fontes
herméticos; não representa smoke de produção.

## Arquivos causais para auditoria

- este documento;
- `src/handlers/messageHandler.js`, especialmente
  `recoverAnalyticalFollowUpIntent`, a chamada anterior ao planner/switch,
  `case 'pergunta'`, `getAnalyticalContext` e `classifyPerguntaLocally`;
- `tests/financialStateMachine.test.js`, teste
  `public handler routes an elliptical family expense follow-up through the analytical context`;
- `tests/unit.test.js`, teste
  `expense ranking follow-up narrows the family ranking to one category`.

## Critério de GO

O auditor deve confirmar que a falha estava antes do agente; que a recuperação
é fechada por remetente e checkpoint; que ela apenas alcança o caminho analítico
read-only já autorizado; que o resolvedor de escopo familiar continua sendo a
autoridade; que “sim” e mensagens sem plano não são promovidos; e que o teste
público prova roteamento, contexto final e zero escrita.

Com `GO TÉCNICO LOCAL`, fica autorizado gerar/promover um artefato OCI com o
canário `off` e repetir uma única sequência base + follow-up. Qualquer resposta
incorreta exige retorno imediato para `off`, sem repetição no mesmo hash.
