# NEXT-02 N02-A — Evidência local

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
