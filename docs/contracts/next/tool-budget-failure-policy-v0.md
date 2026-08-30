# Tool Budget and Failure Policy v0

Estado: `FROZEN FOR NEXT-00`
Versão: `0.1.0`
Escopo: agente conversacional e Tool Gateway do FinançasBot Next

## 1. Objetivo

O orçamento limita loop, custo e latência; não limita a semântica do produto.
Se uma investigação válida não couber no turno, o agente expõe a insuficiência
ou pede a informação indispensável. Nunca encurta a apuração inventando resposta
nem muda para planner/provider/fonte alternativo silencioso.

## 2. BudgetEnvelope v0

```yaml
schema_version: 0
policy_version: tool_budget_v0
turn_id: string
soft_tool_calls: 6
hard_tool_calls: 12
max_same_tool_args_fingerprint: 2
max_parallel_read_calls: 3
max_sequential_decision_rounds: 4
max_clarification_questions_per_turn: 2
max_response_recompositions: 1
total_trajectory_timeout_seconds: 30
writer_commit_attempts_after_confirmation: 1
```

Contagem inclui toda chamada ao Tool Gateway, inclusive falha e cache miss.
Cache hit validado conta para observabilidade, mas não consome nova chamada. Uma
chamada paralela conta individualmente. Reconcile assíncrono e delivery outbox
não são calls do agente; seguem state machines próprias.

## 3. Soft e hard budget

Ao atingir 6 chamadas:

1. o gateway adiciona `soft_budget_reached` ao trace;
2. o agente deve verificar se já há evidence/coverage suficiente;
3. nova chamada exige uma lacuna material identificada e tool distinta ou
   segunda tentativa permitida.

Ao atingir 12 chamadas ou 30 segundos:

- nenhuma nova tool é executada;
- claims já adequados podem ser respondidos com limitações explícitas;
- se faltar fato material, responder insuficiência ou pedir esclarecimento;
- não iniciar outro agente, planner, SQL, provider ou fallback;
- continuação exige novo turno, preservando somente contexto versionado.

O hard budget só muda por nova versão deste contrato, calibrada antes da bateria
que a julga.

## 4. Repetição, paralelismo e dependência

- Mesmo `tool + args_fingerprint` pode executar no máximo 2 vezes.
- Segunda execução só ocorre após erro retryable ou source version materialmente
  nova; “tentar de novo” do modelo não basta.
- Reads independentes podem executar em paralelo, máximo 3.
- Tools dependentes são sequenciais e recebem somente outputs permitidos pelo
  schema, não texto livre do modelo.
- Writer/commit nunca executa em paralelo com outro writer da mesma economic
  identity.
- Uma proposta confirmada autoriza 1 claim de commit; timeout ambíguo vira
  `uncertain`, não segunda tentativa.

## 5. Taxonomia de falhas

| Classe | Exemplos | Retry | Resposta/ação |
|---|---|---:|---|
| `INPUT_MISSING` | período, pessoa ou conta indispensável ausente | 0 | até 2 perguntas objetivas |
| `SCOPE_DENIED` | família/entidade não autorizada | 0 | negar sem revelar existência |
| `SOURCE_UNAVAILABLE` | provider/adapter indisponível | 1 se retryable | insuficiência; nunca zero |
| `COVERAGE_INCOMPLETE` | janela parcial, fonte atrasada | 0 | responder parcial somente se seguro |
| `TOOL_SCHEMA_INVALID` | args/output fora do schema | 0 | bloquear candidato e auditar |
| `RATE_LIMITED` | 429/local limiter | 1 com backoff dentro do prazo | insuficiência se exceder 30s |
| `TIMEOUT_READ` | read sem resultado | 1 se idempotente | insuficiência, sem fallback |
| `FACT_CONFLICT` | sources materiais divergem | 0 | hold/review ou esclarecer |
| `CLAIM_INVALID` | claim sem vínculo/cobertura | 0 | bloquear resposta |
| `MODEL_FORMAT` | saída válida em conteúdo, schema inválido | 1 recomposição | mesma evidência, zero tool nova |
| `MODEL_FACTUAL` | texto troca valor/entidade/período | 0 | bloquear; não pedir “corrija” livremente |
| `WRITE_PRECONDITION` | proposal/lease/version diverge | 0 | rejeitar e exigir novo prepare |
| `WRITE_UNCERTAIN` | timeout após possível efeito | 0 | reconcile determinístico |
| `BUDGET_EXHAUSTED` | 12 calls/30s | 0 | parcial seguro ou insuficiência |

Erro não classificado é fail-closed e mapeado para `INTERNAL_UNCLASSIFIED`; não
é considerado retryable.

## 6. Adequação da evidência

Antes da resposta, o verificador exige vínculo completo:

`claim -> valor -> entidade -> período -> unidade -> coverage -> evidence`

Falha factual, de scope, cálculo ou coverage bloqueia a resposta. Somente erro
de forma admite 1 recomposição sem novas tools. “O número apareceu em algum
resultado” não é adequação.

Quando há claims parciais seguros, a resposta deve separar:

- fatos confirmados;
- período/fontes cobertos;
- lacuna que impede conclusão;
- próxima informação/tool necessária.

## 7. Clarificação

No máximo 2 perguntas por turno, agrupadas quando independentes. Uma pergunta é
redundante se a dimensão já estiver resolvida e vigente na sessão/evidência. Se
mais de 2 dimensões materiais faltarem, pedir primeiro as 2 que mais reduzem a
ambiguidade; não executar tools especulativas.

“Qual cartão?” ou “qual pessoa?” não é perguntado quando o source observation já
possui identidade server-side. O modelo não recebe IDs para decidir.

## 8. Escrita

O budget do agente cobre `prepare` e reads do preview. Após confirmação:

- 1 chamada de commit por proposal/idempotency key;
- precondition failure não consome nova proposta automaticamente;
- reconcile/outbox são workers determinísticos e cercados;
- resposta de sucesso somente após receipt/reconcile;
- falha de entrega não repete writer.

Nenhum estouro de budget converte operação confirmada em auto-write tardio. A
proposta expira normalmente.

## 9. Telemetria sanitizada

Por turno registrar somente:

- policy version;
- total de calls, paralelismo e fingerprints efêmeros;
- duração por tool/trajectory;
- cache hit/miss;
- tokens e custo estimado;
- classes de falha;
- soft/hard budget atingido;
- número de clarificações e recomposições;
- status final: answered|partial|clarification|insufficient|blocked.

Não registrar texto, args financeiros, IDs, valores, prompts ou raw results.

## 10. Testes obrigatórios

| ID | Caso | Resultado |
|---|---|---|
| TB-01 | 6 calls e evidência suficiente | responder; zero call adicional |
| TB-02 | 12 calls com lacuna | insuficiência explícita |
| TB-03 | mesma tool/args pela 3ª vez | bloquear |
| TB-04 | 4 reads paralelos | máximo 3; quarto aguarda ou não inicia |
| TB-05 | trajetória >30s | interromper novas calls |
| TB-06 | erro de forma | 1 recomposição, mesmas claims |
| TB-07 | erro factual | zero recomposição livre; bloquear |
| TB-08 | coverage parcial soma zero | não responder zero |
| TB-09 | 429 retryable | 1 retry dentro do prazo |
| TB-10 | writer timeout ambíguo | `uncertain`, zero retry de efeito |
| TB-11 | duas dimensões já resolvidas | zero clarificação redundante |
| TB-12 | fallback/provider alternativo | não chamar sem policy explícita |

## 11. Calibração

NEXT00-04 mede, por conversa do Golden Set: calls, repetições, duração,
clarificações, insuficiência correta e custo estimado. Alterar os números exige
novo hash desta policy e repetição apenas das baterias afetadas; limite nunca é
ajustado depois de ver o resultado que deveria julgá-lo.
