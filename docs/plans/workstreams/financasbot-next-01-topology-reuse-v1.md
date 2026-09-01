# NEXT-01 — Topologia mínima e reaproveitamento do v1

Atualizado em: 2026-09-01
Estado: `CANDIDATO IMPLEMENTADO — FOCO E SUÍTE HERMÉTICA AMPLA VERDES`
Base inspecionada: `0b988e7d51544dbc02942b237b0d58d12b9af264`

## 1. Decisão executiva

O FinançasBot Next permanecerá no mesmo pacote Node/CommonJS durante NEXT-01 e
será isolado sob `src/next/` e `tests/next/`. Criar outro package, serviço ou
processo agora não compra evidência para o gate e aumentaria o custo de build,
release e observabilidade.

O v1 contém comportamento aproveitável, mas nenhum módulo de runtime entra por
importação direta no Next. O reaproveitamento ocorre por extração/adaptação de
algoritmos puros e pela migração de testes causais. Isso preserva o que funciona
sem carregar autoridade de Sheets, adapters reais, estado global, fallback ou
efeitos do legado.

## 2. Evidência local usada

Foram lidos os módulos candidatos e seus testes focais. A bateria de
caracterização executada antes deste documento ficou verde em `82/82`:

| Evidência | Resultado | O que prova |
|---|---:|---|
| projector, family mode, cost guard e evidence verifier | `46/46` | comportamento determinístico e falhas atuais dos candidatos |
| semantic read facade | `8/8` | scope server-side, read-only, coverage e sanitização |
| state snapshot/shutdown | `19/19` | persistência protegida, restore fail-closed e encerramento durável |
| query plan e logger focal | `9/9` | allowlists, bloqueio de campos internos e redaction |

Esses verdes caracterizam o v1. Eles não provam conformidade do Next e não
autorizam copiar módulos inteiros.

## 3. Topologia mínima

```text
src/next/
  contracts/       schemas, enums e registries derivados do NEXT-00
  policy/          autorização, tool budget, failure policy e time policy
  session/         SessionState versionado, CAS e portas de persistência
  ledger/          portas e implementação hermética do ledger inicialmente vazio
  tools/           catálogo read-only, envelopes e dispatch por adapter injetado
  conversation/    coordenação de turno; única entrada pública do esqueleto
  observability/   eventos sanitizados e trace sem payload financeiro bruto
  replay/          tripwire de rede e execução do corpus sintético

tests/next/
  contracts/       schema/registry e tripwires de dependência
  gateway/         conversa simples, follow-up e falha fechada
  session/         CAS, versão obsoleta, TTL, backup e restore
  tools/           allowlist read-only, scope negativo e zero writer
  replay/          runner hermético e tripwire de rede
  fixtures/        referências aos artefatos sintéticos auditados do NEXT-00
```

Não será criada uma pasta `adapters/` funcional em NEXT-01. As interfaces de
adapter podem existir como portas, mas o runner fornece apenas fakes sintéticos
injetados. Não existe default adapter apontando para o v1.

## 4. Direção de dependências

```text
contracts <- policy
contracts <- session
contracts <- ledger
contracts + policy + ledger <- tools
contracts + policy + session + tools + observability <- conversation
conversation <- tests/next/replay
```

Regras:

1. `conversation` não lê Sheet, SQLite legado ou fixture diretamente;
2. `tools` acessa dados somente por portas injetadas;
3. `session` não conhece WhatsApp, modelo, tool ou família real;
4. `ledger` não conhece parser legado nem projection externa;
5. `observability` recebe somente eventos já sanitizados e tipados;
6. nenhum arquivo em `src/next/` importa `handlers/`, `jobs/`, `services/google*`,
   `ai/`, `messageHandler`, telemetry legado ou adapter produtivo;
7. importação de módulo v1 fora de `src/next/` falha o tripwire, salvo uma
   allowlist temporária e explícita criada para extrair um helper puro; a
   allowlist precisa desaparecer antes do GO.

## 5. Fluxo do primeiro replay

```text
SyntheticTurn
  -> ConversationGateway
  -> server-side AuthorizedContext
  -> SessionStore.read(version)
  -> ReadOnlyToolPolicy
  -> ToolGateway(adapter sintético injetado)
  -> typed result + coverage/evidence
  -> deterministic adequacy check
  -> SessionStore.compareAndSwap
  -> sanitized trace
  -> SyntheticResponse
```

O modelo não é necessário para provar NEXT-01. A interface de composição pode
ser injetada, mas o replay inicial usa um compositor determinístico sintético.
Isso evita rede e não cria um segundo cérebro temporário.

## 6. Classificação dos ativos técnicos

| ID | Decisão NEXT-01 | Evidência reaproveitada | Parte rejeitada ou deferida | Gate de entrada |
|---|---|---|---|---|
| AST-01 `FinancialQueryPlan` | `ADAPT` | normalização closed-list, limite, período e bloqueio de campos internos | `legacyIntentToQueryPlan`, mapa gigante de intents e enums divergentes não entram | schema/enum vem de `contracts/`; testes negativos migrados |
| AST-02 semantic read facade | `ADAPT` | scope/identidade vindos de trusted context, catálogo read-only, envelope de coverage e redaction | `DEFAULT_ADAPTERS`, `process.env`, heurística por shape e imports de tools legadas | adapters somente injetados; nenhuma identidade do request/modelo |
| AST-03 evidence verifier | `EXTRACT_BEHAVIOR` | fail-closed, distinção zero/empty/unavailable, pessoa/período/time basis/dimensão/source | parser de resposta livre, `deriveReadPlan` heurístico e busca de número em texto não são autoridade | novo verificador opera em claims tipados `claim -> value -> entity -> period -> unit -> coverage -> evidence` |
| AST-04 canonical ledger projector | `DEFER` para NEXT-02 | testes de neutralidade, links, idempotência e incerteza viram catálogo causal | módulo monolítico de 991 linhas transforma linhas legadas diretamente e mistura observation/event/projection | NEXT-01 implementa só a porta e ledger vazio; sem importar projector |
| AST-11 Golden Set/fixtures | `PORT_AS_IS` para fixtures já convertidas no NEXT-00 | corpus sintético auditado de 48 casos e 14 dimensões | fixtures legadas não sanitizadas e casos financeiros fora do esqueleto não entram no primeiro replay | leitura imutável; seleção de casos não altera oracle |
| AST-12 ADR-002 | `PORT_AS_IS` | política de privacidade e scope server-side | exceção beta `Todos os usuários` não entra no Next | testes cross-family e admin sem scope financeiro arbitrário |
| AST-13 timezone | `PORT_AS_IS` como política | valor canônico `America/Sao_Paulo` | não copiar `dateTimeNormalizer.js`: offset `-03:00` fixo, fallback de IA e legacy tripwire | uma única `timePolicy` sem offset manual e com relógio injetado |
| AST-15 regressões financeiras | `EXTRACT_BEHAVIOR` | casos causais e negativos que provam invariantes | não importar `unit.test.js` nem arquitetura de mocks/cache do legado | cada caso precisa apontar contrato/risco do Next |

Nenhum ativo de runtime recebe `PORT_AS_IS`. As únicas decisões `PORT_AS_IS`
são artefatos de teste auditados e políticas sem autoridade executável.

## 7. Classificação das capacidades ligadas ao gate

| ID | Decisão NEXT-01 | Justificativa |
|---|---|---|
| CAP-01 conversa/follow-up | `REWRITE` | o handler monolítico e a memória implícita são a classe que o Next elimina; reutilizam-se IR, casos e linguagem, não a orquestração |
| CAP-13 compartilhamento familiar | `EXTRACT_BEHAVIOR` | preservar fail-closed e negativos; `familyModeService` é allowlist de ambiente e contém texto específico de pessoas, não membership canônico |
| CAP-14 onboarding/OAuth | `DEFER` | NEXT-01 define somente estados/ports necessários; saga, token e adapter real pertencem a NEXT-04 |
| CAP-25A backup/restore | `EXTRACT_BEHAVIOR` | preservar atomicidade, tamper/replay rejection, TTL e shutdown; `userStateManager` é global, orientado a arquivo/env e não possui SessionState CAS do Next |
| CAP-26 qualidade/coverage | `ADAPT` | envelope e negativos atuais são bons; claims tipados e provenance ratificada substituem heurísticas textuais |
| CAP-29 observabilidade | `EXTRACT_BEHAVIOR` | reutilizar regras puras de redaction e safe errors; não importar logger Winston com arquivos/side effects |
| CAP-30 release/rollback | `DEFER` | disciplina de SHA imutável já vale; implementação e drills operacionais não pertencem ao esqueleto local |

## 8. Decisões adicionais da inspeção

### Tool budget

`financialAgentCostPolicy.js` não será portado. Ele limita chamadas de modelo a
`2` por pergunta e `240` por mês, enquanto o contrato Next governa tools com
soft `6`, hard `12`, repetição máxima `2` e timeout do turno. Reaproveitam-se os
testes de fail-closed quando o estado de uso está indisponível e a ideia de
relógio injetado; a implementação será nova e derivada do contrato.

### Estado de sessão

`userStateManager.js` contém propriedades valiosas de persistência, mas sua API
global `get/set/delete`, configuração por processo e signal handlers não será a
base do Next. Os testes de snapshot atômico, tamper, replay, TTL, restore e
shutdown serão migrados como propriedades da porta `SessionStore`.

### Família

`familyModeService.js` não resolve household/membership e não satisfaz sozinho
CAP-13. Seu comportamento fail-closed vira teste; IDs, nomes e allowlist de
ambiente não entram no contrato nem no runtime Next.

## 9. Primeiros REDs autorizados pelo desenho

1. `next_import_boundary`: falha se `src/next/` importar runtime legado ou rede;
2. `tool_catalog_read_only`: rejeita tool não catalogada e qualquer modo write;
3. `trusted_scope_only`: ignora/rejeita identity/scope fornecidos pelo request;
4. `session_cas`: rejeita atualização com `session_version` obsoleta;
5. `follow_up_restore`: restaura sujeito/período/time basis explícitos;
6. `coverage_fail_closed`: parcial/unavailable nunca vira zero;
7. `empty_ledger`: nasce vazio e replay não cria evento implicitamente;
8. `network_tripwire`: qualquer tentativa de socket/fetch/http falha o replay;
9. `sanitized_observability`: nenhum payload, ID privado ou mensagem bruta;
10. `v1_conformance_manifest`: toda reutilização possui decisão e teste.

Os REDs devem nascer das propriedades acima. Não serão criados testes por cada
arquivo legado nem uma tabela de exceções crescente.

## 10. Condição para avançar da documentação ao código

O primeiro lote de testes deve conter somente contratos, import boundaries,
fakes sintéticos e assertions RED. A implementação mínima começa depois que os
REDs demonstrarem falha pelo motivo causal esperado. Nenhum adapter real,
writer, model provider ou fonte financeira entra nessa transição.

## 11. Evidência RED

Comando focal:

`node --test tests/next/next01SkeletonRed.test.js`

Resultado observado em 2026-09-01: `0/9 PASS`, `9/9 RED`, exit code `1`.

Cada falha aponta ao contrato ausente esperado:

1. query plan seguro;
2. gateway read-only e scope confiável;
3. SessionState/CAS;
4. evidence/coverage tipados;
5. ledger vazio sem writer;
6. observabilidade sanitizada;
7. replay hermético;
8. manifesto executável de reaproveitamento;
9. boundary física de `src/next/`.

Não houve falha incidental de dependência instalada, rede, dado privado ou
runtime legado. Esse resultado autorizou a implementação mínima registrada na
seção seguinte; não descreve o estado atual do candidato.

## 12. Evidência GREEN do esqueleto

Depois do RED inicial, foram implementadas somente as fronteiras previstas nesta
topologia. A execução combinada abaixo terminou em `18/18 PASS`, zero skip:

`node --test tests/financasBotNext01.test.js`

Os nove REDs originais ficaram verdes e foram adicionadas oito propriedades
causais durante a revisão adversarial local: output aninhado sem identidade,
claim de outra família, rota com dimensões obrigatórias, métrica esperada,
campo de sessão arbitrário, envelope completo de budget, gateway sem budget e
budget esgotado antes do adapter.

O `network_tripwire` bloqueia `fetch` e carregamento de módulos de rede durante
o replay. Ele compra evidência para o corpus injetado e para o grafo de
dependências atual; não pretende substituir isolamento de rede do sistema
operacional. O candidato continua sem adapter real, writer, provider de modelo
ou fonte financeira.

## 13. Validação ampla e baseline estabilizado

A suíte ampla inicial encontrou oito falhas. A integração do inventário foi
corrigida por um entrypoint raiz. As sete falhas restantes eram testes legados:
fixtures Open Finance misturavam relógio fixo com relógio real e o watcher usava
um subprocesso Git que o próprio tripwire hermético corretamente bloqueava.

Com autorização explícita, o baseline foi estabilizado na própria camada de
teste, sem alteração de runtime legado:

- relógio injetado por dependências/stores nas fixtures Open Finance;
- Git local absoluto e allowlist estreita somente para a fixture controlada do
  watcher dentro da raiz temporária da auditoria;
- bateria causal combinada `64/64 PASS`.

A única suíte hermética ampla final executou `1.922` testes: `1.912 PASS`, zero
falhas, dez skips esperados e zero todo. O tripwire permaneceu válido. Nenhum
waiver foi criado.
