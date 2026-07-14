# Fase 8A - inventario e telemetria de legado - auditoria 2026-07-14

## Veredito

`NO-GO para remover legado` e `GO para continuar a Fase 8A/8B somente com
medicao e migracao controlada`.

O sistema esta saudavel, mas ainda ha consumidores reais dos caminhos antigos.
Nesta auditoria nenhum codigo, dado, flag ou schema foi removido. Ausencia de
evento observado foi tratada como evidencia insuficiente, nunca como uso zero.

A Fase 7, patrimonio e investimentos, fica adiada por decisao de produto. Daniel
nao possui investimentos hoje e a consolidacao reduz mais risco e custo de
manutencao. A Fase 7 volta ao roadmap quando existir ao menos um ativo real,
necessidade de separar rendimento de reserva/caixa ou demanda por visao
patrimonial/Open Finance.

## Escopo e metodo

- baseline auditado: `03128e2ff1403a8bb396912e646019fadcbec48d`;
- inventario estatico de `src`, imports, handlers, adapters, stores, scripts e
  suites;
- leitura sanitizada de flags, arquivos de dados e logs de producao;
- execucao local do gate analitico deterministico;
- execucao remota read-only do gate de planos projetados;
- reconciliacao com roadmaps, memoria operacional e runbooks;
- nenhuma mensagem financeira bruta, telefone, token, id de planilha ou valor
  financeiro foi copiado para este relatorio.

O inventario encontrou 116 arquivos JavaScript em `src`, cerca de 47 mil linhas,
72 arquivos de teste e 50 scripts. `messageHandler.js`, com mais de 10 mil linhas,
concentra roteamento, fallbacks e integracoes; essa concentracao aumenta o risco
de remover um caminho aparentemente isolado.

## Evidencias objetivas

### Gates

- `npm run gate:analytical-legacy`: `NO_GO`. A bateria ampla encontrou uma
  lacuna em 265 casos; `BILL-015` (`tem conta sem categoria?`) terminou em
  `tool_unavailable:canonical_transactions_unavailable`. A bateria especifica
  de telemetria passou 6/6, sem evento ausente ou inseguro.
- `npm run plans:read-gate` remoto e read-only: `GO`, paridade `GO`, privacidade
  `true`, `writes=0`, uma meta observada, zero divergencias e uma identidade
  persistida sem criacao durante o gate.
- baseline da Fase 6 no mesmo runtime: 76/76 no gate combinado, 851/851 na suite
  principal e zero vulnerabilidade de nivel alto.

Conclusao: planos projetados possuem paridade atual e devem permanecer; o
fallback analitico ainda protege uma lacuna real e nao pode ser removido.

### Trafego e telemetria sanitizada

Na janela disponivel dos logs PM2, de 2026-05-11 a 2026-07-14:

- respostas do Financial Agent observadas: 181;
- fallbacks do Financial Agent para o caminho analitico legado: 8;
- execucoes shadow do command planner observadas: 3;
- fallbacks do read-model para legado encontrados pelo padrao atual: 0.

O ultimo numero nao prova uso zero: essa superficie nao possui contador duravel
por caminho suficiente para autorizar remocao.

O log duravel `data/dashboard-access.jsonl` continha 5.869 eventos JSON validos:

- `api_access`: 4.510;
- `api_v2_access`: 43;
- `api_scope_forbidden`: 906;
- `api_auth_failed`: 410.

O dashboard atual ainda recebe muito mais trafego que a API v2. O v1 deve ser
mantido ate haver telemetria por rota, janela de observacao definida e rollback
testado.

### Flags e stores de producao

O runtime mantem simultaneamente:

- Financial Agent e command planner em canario/answer;
- ledger canonico em shadow write e canary read para `transactions`,
  `transfers`, `accounts` e `forecast`;
- projected plan writes em `shadow`;
- dashboard v1 e v2 habilitados;
- Fase 6A-6E em canario para escopo restrito;
- `STATE_STORE_DRIVER=file`.

Foram observados os stores SQLite do ledger canonico, operacoes financeiras,
identidade de planos, read-model e OAuth. Os bancos default de batch,
comprovantes e undo nao estavam materializados. Isso sugere ausencia de uso
persistido nesses stores especificos, mas nao prova ausencia de chamada aos
handlers, pois parte das metricas atuais e apenas em memoria.

## Matriz de decisao

| Superficie | Consumidor/evidencia atual | Decisao 8A | Condicao antes de remover |
| --- | --- | --- | --- |
| Financial Agent/LangGraph | 181 respostas observadas | Manter | Nao e legado |
| `intentClassifier` + `calculationOrchestrator` + `responseGenerator` | Runtime ativo e 8 fallbacks observados | Manter e migrar por dominio | Gate analitico verde e zero fallback duravel por janela definida |
| Query Engine/read-model com fallback Sheets | Runtime ativo; telemetria ainda incompleta | Manter e instrumentar | Contador duravel por fonte/operacao e paridade |
| Ledger canonico shadow/canary | Consumidores em agente, projector e reconciliacao | Manter | Cutover somente na 8D com backup/rollback |
| Planos projetados e adapters de metas/dividas | Runtime conectado; gate remoto de paridade verde | Manter | Migrar fonte sem perder compatibilidade nem identidade |
| Dashboard v1 | 4.510 acessos contra 43 da API v2 | Manter | Janela com uso zero ou migracao explicita dos consumidores |
| Abas antigas de cartao | Compatibilidade ainda presente; leitura real nao medida por aba | Medir | Contagem de linhas/leituras e migracao para `Lancamentos Cartao` |
| Fase 6A-6D | Handlers ligados ao WhatsApp; adocao duravel nao medida | Manter e instrumentar | Telemetria sanitizada de tentativa/sucesso/fallback |
| Fase 6E undo | Service usado por testes/scripts, sem ligacao no handler do WhatsApp | Decidir: integrar ou desligar o canario | Gate de produto real se integrar; flag coerente se permanecer test-only |
| Ferramentas de parity/gates | Consumidores de QA e operacao | Manter | Nao classificar como codigo morto de runtime |

## Candidatos a quarentena, nao a exclusao

O grafo estatico nao encontrou consumidor de producao para:

- `src/handlers/debtUpdateHandler.js`;
- `src/services/debtAvalancheService.js`;
- `src/services/financialHealthService.js`;
- `src/utils/auth.js`;
- `src/utils/dateTimeNormalizer.js`;
- `src/query/financialQuerySpec.js` como modulo standalone;
- `src/undo/financialUndoService.js` fora de testes/scripts.

Alguns desses modulos possuem testes, valor de dominio ou foram criados
recentemente. Cada um precisa de caracterizacao, busca de imports dinamicos,
decisao de produto e teste provando o consumidor substituto. A exclusao, se
aprovada, pertence a uma fatia 8C posterior.

## Riscos e desvios documentais

1. `FINANCIAL_UNDO_MODE=canary` sugere capacidade ativa, mas o service 6E nao
   esta ligado ao fluxo do WhatsApp. A flag deve ser desligada/documentada como
   test-only ou a integracao deve ganhar um gate proprio.
2. O gate analitico que ja havia passado voltou a `NO_GO` em `BILL-015`. Isso e
   evidencia de que remocao baseada apenas em um gate historico seria insegura.
3. A telemetria de dashboard e duravel, mas as metricas de varios handlers e
   fallbacks ainda sao volateis ou inferidas de texto de log.
4. O template central ainda preserva abas antigas de cartao enquanto a planilha
   pessoal usa `Lancamentos Cartao`; nao ha medicao suficiente para retirar a
   compatibilidade.
5. `.env.example` nao representa todas as flags criticas de rollout atualmente
   usadas. A reconciliacao deve ser feita sem copiar valores de producao.
6. O mapa de arquitetura dizia que `ProjectedPlansStore` nao estava ligado ao
   runtime, embora `projectedPlanWriteRuntime` ja o conecte.
7. Backups pre-5C de planos continuam retidos; definir politica de retencao antes
   de qualquer limpeza.

## Plano seguro para a 8B

1. **8B.0 - telemetria duravel:** criar eventos sanitizados para fonte de leitura,
   fallback por dominio, uso de abas antigas de cartao, handlers 6A-6E e rotas do
   dashboard. Definir janela minima antes de falar em uso zero.
2. **8B.1 - analitico:** corrigir `BILL-015`, rerodar o gate e migrar um dominio
   por vez com fallback por flag. Nunca usar `*` enquanto houver uma lacuna.
3. **8B.2 - dashboard:** identificar os consumidores de `api_access`, migrar para
   v2 e observar a janela; o v1 permanece como rollback.
4. **8B.3 - undo:** tomar a decisao explicita entre integrar a 6E ao produto ou
   desligar o canario e manter a infraestrutura somente como experimento.
5. **8B.4 - cartoes e candidatos:** caracterizar cada caminho em quarentena. Uma
   eventual remocao deve ser pequena, reversivel e ocorrer apenas na 8C.

## Capacidade e revisao independente

`Codex -> Sol -> Alto -> implementar telemetria 8B.0 e corrigir BILL-015`.

Altissimo nao e necessario para inventario, telemetria ou correcoes pequenas.
Ele volta a ser recomendado para o gate final 8E, para um cutover irreversivel
de fonte de verdade ou quando a Fase 7 patrimonial for reaberta.

Depois desta auditoria factual, uma revisao independente no Chat pode desafiar
prioridades e lacunas do documento. Ela ajuda na critica de produto, mas nao
substitui os imports, gates, logs e stores verificados pelo Codex.
