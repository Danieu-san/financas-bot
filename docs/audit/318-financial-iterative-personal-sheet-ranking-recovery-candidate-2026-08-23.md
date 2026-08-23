# ARQ-06 — recovery do ranking na planilha pessoal/familiar

Data: 2026-08-23

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este recovery não autoriza deploy, reativação do canário, writer ou retirada do
pipeline vigente. Em produção, o canário permanece `off`.

## Falha observada

O smoke real resolveu corretamente a família autorizada e a fonte
`personal_sheet`, mas a pergunta de maiores gastos caiu em esclarecimento. O
plano pedia `expenses/rank/merchant`; o adaptador pessoal oferecia apenas
totais, contas, orçamento e transações recentes, insuficientes para um ranking
mensal completo.

## Recovery

- a leitura vigente da planilha passa a calcular, sobre todas as saídas e
  compras de cartão do período, um ranking determinístico por descrição;
- descrições equivalentes por caixa e acento são agrupadas, somadas e contadas;
- ordenação é por total, quantidade e nome, com limite de doze linhas;
- rankings separados por categoria usam a categoria normalizada e não linhas
  recentes truncadas;
- o adaptador aceita somente `expenses/rank` agrupado por `merchant` e escolhe
  o ranking geral ou o recorte categórico solicitado;
- operações pessoais ainda não suportadas continuam falhando fechado;
- `Quais foram os maiores gastos da família neste mês?` preserva o escopo
  `family` definido server-side;
- `E só com alimentação?` mantém o ranking, o período e o escopo, acrescenta o
  filtro `category=alimentacao` e recebe somente valores desse recorte.

Nenhuma identidade, telefone, `user_id`, planilha, token ou linha bruta é
adicionada à evidência entregue ao reasoner. O caminho continua read-only e os
contadores exigidos de mensagens e escritas permanecem em zero.

## Evidência local

- RED do ranking pessoal: a operação era rejeitada;
- RED do follow-up: a classificação retornava `null`;
- RED do recorte: o plano categórico ainda recebia o ranking geral;
- focal do canário após o recovery: `20/20`, zero falha;
- bateria causal de canário, shadow, fachada, adequação e dashboard: `68/68`,
  zero falha;
- syntax check dos quatro arquivos de produto: verde;
- suíte hermética ampla: `1.812/1.822`, zero falha e dez skips previstos;
- cobertura ampla: linhas `91,68%`, branches `74,53%`, funções `91,17%`;
- rede e efeitos externos foram bloqueados pela suíte ampla.

As contagens são execução local relatada, não execução do auditor.

## Arquivos causais para auditoria

- este documento;
- `src/services/userSheetAnalyticsService.js`;
- `src/agent/financialPersonalSheetSemanticAdapters.js`;
- `src/handlers/messageHandler.js`;
- `src/query/financialQueryPlan.js`;
- `tests/financialIterativeCanary.test.js`;
- `tests/unit.test.js`.

## Critério de GO

O auditor deve confirmar que o ranking usa o período completo e o escopo já
autorizado, que o filtro de categoria alcança os valores retornados, que o
follow-up preserva ranking/período/família, que operações fora do recorte
continuam fechadas e que não há ampliação de escrita ou identidade.

Com GO fica autorizado apenas construir e promover um novo artefato OCI com o
canário ainda `off`; a reativação limitada e o smoke real continuam sendo um
gate operacional separado.
