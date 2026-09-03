# NEXT-02 N02-A — Evidência local

Estado: validação local verde; candidato N02-A aguardando auditoria.
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
- coverage: 91,89% linhas; 75,36% branches; 91,38% funções;
- duração: 905.917 ms;
- skips: cinco casos de instalação/configuração e cinco grupos funcionais
  que dependem de integração; nenhum skip no focal N02-A.

`agent-workflow: OK` e diff --check sem erros.
Auditoria independente: pendente; nenhum veredito externo inferido dos testes.
