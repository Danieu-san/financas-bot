# NEXT-02 — Evidência local por fatia

## N02-E — corpus complementar, validação local concluída; auditoria pendente

Parent esperado: `c0c762786d81db71cf82681915750efb2f23f9e7`.
Escopo: `financasbot-next-02-golden-reconciliation-v1.md`. Somente fixtures,
testes, gate e documentação; nenhum runtime, dependência ou Golden Set v1 alterado.

- RED inicial: seis propriedades passaram; NEXT02E:GATE falhou por fatia
  inexistente. Não há alegação de RED financeiro: kernel aprovado já atendia
  às consultas explícitas do corpus complementar.
- Gate `node scripts/agent/validateFinancasBotNext02.mjs --slice N02-E --worktree`:
  64/64 por eventos estruturados, zero skip/todo. São 57 regressões e sete
  propriedades E, incluindo 23 consultas/cinco recusas e mutações causais.
- Inventário 15; imports v1/efeitos proibidos/loaders não classificados zero;
  um runtime loader hermético classificado. Allowlist N02-E não permite src/next.
- Afetados 137/137, zero FAIL/CANCELLED/SKIP/TODO, com o comando N02-D abaixo
  acrescido de `tests/next02GoldenExpenses.test.js`.
- Golden Set antigo: validador PASS, 48 casos/56 turnos/76 fatos/39 avaliadores.
  Seus quatro arquivos são pinados por SHA-256 com LF canônico; não alterados.
- Adversarial: referência omitida, valor divergente, categoria alterada com
  total familiar igual, refund inválido, compra/parcela ausente, competência
  nula, subcategoria incompatível/unknown. Recusas não carregam claim de valor.
  Gate rejeita skip/todo/arquivo/nesting inválidos, ID ausente/duplicado,
  test:fail e stdout usado para simular aprovação.
- Suíte ampla única `npm test`, sessão 36370, concluída: 181 arquivos
  descobertos/163 entrypoints; 1.993 testes, 1.983 PASS, zero FAIL/CANCELLED/TODO,
  10 SKIP previstos, exit_status=0, runner valid=true e validation_reasons vazio.
  Duração 1.061.024 ms. Cobertura: linhas 91,94%, branches 75,73%, funções 91,54%.
  Skips: cinco casos de instalação/configuração e cinco grupos funcionais;
  WhatsApp real excluído. Nenhum skip focal e nenhuma integração real executada.
  Saída recuperada da mesma execução após pausa; não houve nova suíte.

Novo corpus é candidato de autoria local, não oracle independentemente
ratificado. Rastreabilidade cobre inventário de turnos, não todos os fatos
nem a execução das conversas. Provenance integral e GO global pendentes.
Gate final: `--slice N02-E --expected-head SHA --expected-parent c0c762786d81db71cf82681915750efb2f23f9e7`.

## Histórico N02-D — aprovado focalmente

N02-D recebeu APROVÁVEL no SHA `c0c762786d81db71cf82681915750efb2f23f9e7`;
recibo remoto `54ba9e2fd29b51ef4529dcb62a839f90a9bd0f7e`. O texto abaixo
registra a validação anterior ao parecer, não nova auditoria pendente.

Parent esperado: `3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2` (N02-C aprovado).
Contrato: `financasbot-next-02-n02d-subcategories-v1.md`.

- RED inicial executado: NEXT02D:TOTAL falhou por `read_model_input_invalid`,
  pois o schema v4 ainda não era aceito. Não equivale a 13 REDs independentes.
- Gate precommit `node scripts/agent/validateFinancasBotNext02.mjs --slice N02-D --worktree`:
  57/57 propriedades por eventos estruturados: 20 A + 11 B + 13 C + 13 D.
  Zero skip/todo focal; inventário permanece em 15 fontes. Zero import v1,
  loader não classificado ou import de efeito proibido; um forwarder hermético.
- Bateria afetada: 130/130 PASS, zero fail/skip/todo. Comando:
  `node --test tests/financasBotNext01.test.js tests/next02ObservationKernel.test.js tests/next02InstallmentSchedule.test.js tests/next02BillingReadModel.test.js tests/next02Subcategories.test.js tests/canonicalLedgerProjector.test.js tests/canonicalLedgerReceiptProjector.test.js tests/canonicalInstallmentSchedule.test.js`.
- Revisão adversarial local: vínculo com parent do catálogo, combinação de
  filtros inválida, refund/parcela divergente com valor preservado, integridade
  sem reassinatura, versões/tombstones, null relevante versus outro estado ou
  pessoa/período, conta/cartão, neutralidade, labels e IDs públicos; testes do
  gate rejeitam falta/duplicação de ID, skip/todo, nesting, arquivo incorreto,
  falha e stdout como substituto de aprovação. Isso não afirma exaustividade
  do motor de provenance futuro.
- Única suíte ampla `npm test`, sessão 84168, concluída e recuperada após pausa:
  180 arquivos descobertos / 162 entrypoints; 1.986 testes, 1.976 PASS,
  zero FAIL/CANCELLED/TODO, 10 SKIP previstos; runner valid=true,
  exit_status=0 e validation_reasons vazio. Duração 728.251 ms.
  Cobertura: 91,93% linhas, 75,59% branches, 91,50% funções.
  Skips: cinco casos de instalação/configuração e cinco grupos funcionais;
  teste WhatsApp real excluído pelo runner. Nenhuma integração real executada.

Reaproveitamento: semântica v1 de categoria/subcategoria separadas e vínculo de
estorno, adaptada aos módulos Next existentes e às entradas sintéticas explícitas.
Não houve módulo de runtime novo, alteração de dependência, runner, contrato
congelado, produção ou bot de auditoria. O parent v1/v2/v3 permanece suportado;
schema v4 só entra por opt-in. Golden Set integral e provenance completo seguem
pendentes, sem GO global NEXT-02 ou abertura NEXT-03.

Gate final exige `--slice N02-D --expected-head SHA --expected-parent 3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2`.
O resultado final vinculado será obtido após criar o commit; o precommit não é
apresentado como prova imutável. Não repetir a ampla sem mudança causal.

## Histórico N02-C — aprovado focalmente em 2026-09-06

O texto abaixo registra a validação anterior à auditoria. N02-C recebeu
APROVÁVEL no SHA `3bb1f93aeacecab547cc1402c9e04c01f6ddb5a2`; retorno e recibo
estão referenciados na memória do workstream. Não há nova auditoria N02-C pendente.

Parent esperado: `8d987dab960e0ad8f9b112326464b69caa5dfe58`.
Contrato focal: `financasbot-next-02-n02c-billing-read-v1.md`.
RED inicial: leitura v3 recusada por schema anterior (read_model_input_invalid).
RED comportamental adicional: origem parcial da agenda ainda produzia complete;
reproduzido e corrigido antes da suíte ampla. A prova agora verifica e referencia
todos os eventos da agenda relevante, com suas versões.

- Gate `node scripts/agent/validateFinancasBotNext02.mjs --slice N02-C --worktree`:
  44/44 propriedades por eventos estruturados (20 A + 11 B + 13 C), sem skip/todo.
- Inventário: 15 fontes, zero import v1, zero loader não classificado, zero
  import de efeito proibido e um forwarder hermético reconhecido.
- Syntax checks: dois módulos, duas políticas/gate e teste novo válidos.
- Bateria afetada: 117/117 PASS, zero fail/skip/todo; NEXT-01, N02-A/B/C,
  canonicalLedgerProjector, canonicalLedgerReceiptProjector, canonicalInstallmentSchedule.
- Casos adicionais de estados simultâneos na mesma competência e transferência
  neutra: 2/2 PASS, após a bateria e antes da ampla; não houve mudança de produto.
- Suíte hermética ampla: uma execução por `npm test`, 179 arquivos descobertos,
  161 entrypoints; 1.973 testes, 1.963 PASS, zero FAIL/CANCELLED/TODO e os mesmos
  10 SKIP previstos. Nenhum skip focal. Runner `valid=true`, `exit_status=0`,
  `validation_reasons=[]`; duração 916.961 ms. Coverage: 91,92% linhas,
  75,60% branches e 91,48% funções. WhatsApp real excluído pelo runner.
- `agent-workflow: OK`; `git diff --check` sem erros. Não repetir a ampla
  sem mudança causal posterior.

O gate final exigirá o SHA novo e parent acima; o PASS precommit não é uma
execução já vinculada a commit. Auditoria independente obrigatória após publicação.
Não houve mudança de package/lockfile, runtime v1, runner hermético ou fonte real.
NEXT-02 integral, NEXT-03 e produção não estão aprovados por esta evidência.

## Histórico N02-B — aprovado focalmente em 2026-09-05

Parent esperado: `4a6396000d15d98969b8291d6c162e5aafcd04b9`.
Escopo: agenda derivada de observações v2, não consulta pública por competência.
Gate precommit `--slice N02-B --worktree`: PASS; 15 fontes, 31/31 IDs por
eventos estruturados (20 N02-A + 11 N02-B), sem skips/todos.
Bateria afetada: 104/104 PASS, zero fail/skip/todo. Inclui NEXT-01,
N02-A, N02-B, canonicalLedgerProjector, canonicalLedgerReceiptProjector e
canonicalInstallmentSchedule. REDs comportamentais reproduzidos: agenda
parcial monetariamente inviável e provenance de aliases sem resolução canônica.
Suíte ampla N02-B executada uma única vez após estabilização:
178 arquivos descobertos / 160 entrypoints; 1.960 testes, 1.950 PASS,
0 FAIL, 10 SKIP previstos, 0 TODO, 0 cancelados. Runner valid=true,
exit_status=0, validation_reasons vazio; duração 686.919 ms.
Coverage: 91,87% linhas, 75,33% branches, 91,44% funções.
Os skips são os mesmos cinco testes de instalação e cinco grupos funcionais
dependentes de integração; nenhum skip focal. A execução real WhatsApp fica
explicitamente excluída pelo runner, não foi acessada.
Auditoria independente por novo hash ainda obrigatória; não é GO do NEXT-02.

## Histórico N02-A

Estado: correção pós-auditoria localmente verde; novo candidato N02-A a publicar
e submeter à reauditoria.
Não é GO do NEXT-02.
Base: `5d4339f46a9ec412d6c86894853435c7238dbcf1`.

Fatia: ingestão normalizada sintética, projeção versionada, consumo
transaction_date e porta expenses.sum. Tipos não implementados falham fechado.
Os IDs DA-01..06 são exercitados neste domínio restrito; não significam que
todo o contrato de autoridade ou o motor de provenance esteja implementado.

Reutilização e limitações:
`financasbot-next-02-kernel-reuse-v1.md`.
Gate: `node scripts/agent/validateFinancasBotNext02.mjs --worktree`.
Gate final exige `--expected-head SHA --expected-parent 5d4339f46a9ec412d6c86894853435c7238dbcf1`.

## Evidência já executada

- RED inicial: módulo ausente (1 arquivo de testes falhou ao carregar).
  Não contado como 20 testes comportamentais vermelhos.
- Focal/gate N02-A: 20/20 properties por eventos estruturados, sem skip/todo.
- Bateria afetada: 86/86 PASS, zero fail/skip/todo:
  NEXT-01, N02-A, canonicalLedgerProjector e canonicalLedgerReceiptProjector.
- Inventário: 14 fontes; 0 import v1; 0 loader não classificado;
  0 import de efeito proibido; 1 forwarder hermético reconhecido.
- Syntax checks e revisão adversarial local: realizadas antes da suíte ampla.
- npm ci usou lockfile existente; SQLite local preparado por npm rebuild
  better-sqlite3. package.json e lockfile não alterados.

## Correção do parecer independente de 2026-09-05

O candidato `af83a4e0cd79de5e582ce2bd030eb0328da32d52` recebeu NO-GO
focal por três rotas causais. O delta corretivo mantém a mesma arquitetura e:

- traduz seletores públicos de conta, cartão e categoria para IDs internos
  somente dentro do adapter; claim e filtros retornam labels públicas e as
  referências de evidência viram handles locais à resposta, sem IDs estáveis;
- rejeita coverage `complete` quando `as_of` ainda não alcançou o fim integral
  do intervalo declarado, tanto na observação quanto no snapshot de leitura;
- materializa `settles_card_id` como `card_id` canônico do pagamento de fatura
  e conserva a origem exata no `field_provenance`, sem inventar aresta para um
  evento de fatura inexistente nesta fatia.

A revisão adversarial retirou uma primeira tentativa baseada em aleatoriedade:
os handles públicos são sequenciais por instância do gateway, preservando
opacidade sem introduzir entropy/capability nem tornar o replay não
determinístico. O gateway compartilhado do NEXT-01 permaneceu inalterado.

Após o delta corretivo: focal/gate 20/20; bateria afetada 86/86; zero
fail/skip/todo em ambas.

## Correção de portabilidade no teste

O teste NEXT01:N01-VALIDATOR-001 substituía trechos LF em arquivo CRLF e não
gerava suas mutações no Windows. Apenas a leitura do teste normaliza CRLF
para LF. Runner e hash canônico da AST não foram alterados. A bateria
passou após a preparação do binding SQLite e essa correção.

## Alcance e limites

O evento canônico conserva proveniência de payload, coverage, evidence_state e
catálogo da família. Hash prova integridade, não verdade externa.
Snapshot de leitura rejeita observações posteriores ao as_of declarado.
Cobertura completa é entrada server-side explícita, não deduzida de haver
eventos; não há adapter real que produza essa cobertura nesta fatia.
History retém versões; relações da projeção corrente são verificadas contra
o conjunto corrente. Não é prova de reconstrução temporal completa do grafo.
Contas têm titular único; cartões podem ser compartilhados na mesma família.
Moeda BRL e transaction_date são as únicas opções desta primeira fatia.

## Suíte ampla final

`npm test`, uma execução após estabilização do candidato:

- 177 arquivos descobertos, 159 entrypoints;
- 1.949 testes: 1.939 PASS, 0 FAIL, 10 SKIP previstos, 0 TODO, 0 cancelados;
- runner `valid=true`, `exit_status=0`, sem validation_reasons;
- coverage: 91,85% linhas; 75,16% branches; 91,40% funções;
- duração: 825.048 ms;
- skips: cinco casos de instalação/configuração e cinco grupos funcionais
  que dependem de integração; nenhum skip no focal N02-A.

`agent-workflow: OK` e `diff --check` sem erros. A reauditoria independente do novo hash é obrigatória;
nenhum veredito externo é inferido dos testes locais.
